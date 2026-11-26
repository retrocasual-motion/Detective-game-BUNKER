import {
  addExcerpt,
  BOX_KEEPS,
  boardCamera,
  CARD_H,
  CARD_W,
  type Camera,
  CONTAINERS,
  type ContainerId,
  DEVICE_IDS,
  type DeskItem,
  deskGroupOf,
  deviceOf,
  FOLDER_DOCS,
  fileFromDesk,
  folderItemId,
  GRID_DX,
  hangFromDesk,
  hangNear,
  inboxIds,
  isWeb,
  type Join,
  type Material,
  markLooked,
  NEWSPAPER_ID,
  openAll,
  openContainer,
  openedOf,
  PIECES,
  type PlayerState,
  pieceItemId,
  pieceOf,
  reconcile,
  removeExcerpt,
  sealedIds,
  type View,
  WALL_BOUNDS,
  type WallExcerpt,
} from '@bunker/shared';
import { useMemo } from 'react';
import { create } from 'zustand';
import {
  ackExcerpts,
  getExcerpts,
  getMaterials,
  getState,
  PAGE_ID,
  postAction,
  putState,
} from './api.ts';
import { clampToBounds } from './canvas/math.ts';
import { todayKey } from './clock.ts';
import { createSaver } from './save.ts';
import { openSite } from './site.ts';
import { moveItem } from './wall/wall-actions.ts';

const screen = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Камера, с которой доска видна сейчас: со стола — вся целиком (WB-C), у стены — своя. */
export const shownCamera = (s: PlayerState) =>
  s.view === 'desk' ? boardCamera(screen()) : s.wall.camera;

/** Найденное поиском показывается не мельче этого (карточка ~100 px, заголовок читается). */
const REVEAL_ZOOM = 0.6;

/** Часть экрана, не закрытая панелью поиска (справа) и папкой заключения (слева). */
function freeArea(vp: { width: number; height: number }) {
  const panel = document.querySelector('.search-panel')?.getBoundingClientRect();
  const folder = document.querySelector('.petition-open .petition-folder')?.getBoundingClientRect();
  return {
    left: folder ? folder.right : 0,
    right: panel ? panel.left : vp.width,
    top: 0,
    bottom: vp.height,
  };
}

/**
 * Что в руках: конверт или коробка архива (вскрытые — картотекой, OP-D), пакет личных вещей из
 * коробки (EB-A, по номеру описи) — или изъятое устройство (по номеру материала).
 */
export type Held =
  | { type: 'container'; id: ContainerId }
  | { type: 'bag'; id: string; inBox?: boolean }
  | { type: 'device'; id: string };

/**
 * 'error' — сбой связи, повторяем; 'rejected' — сервер отказал по существу (следующее изменение
 * сохранится снова); 'conflict' — дело открыто на другой странице или устройстве (DEV-A);
 * 'signedout' — вход истёк, недосланное ждёт входа (RV-57).
 */
export type SaveStatus = 'saved' | 'saving' | 'error' | 'rejected' | 'conflict' | 'signedout';

/**
 * Недосланное, когда истёк вход (RV-57): дело этой страницы, пока сервер его не принял. После входа
 * дошлётся, если с тех пор дело никто не писал (номер прежней страницы совпал).
 */
const UNSENT_KEY = 'bunker-unsent';
const stashUnsent = (state: PlayerState) => {
  try {
    localStorage.setItem(UNSENT_KEY, JSON.stringify({ writer: PAGE_ID, state }));
  } catch {
    // Хранилище недоступно (приватный режим) — останется только сказать игроку.
  }
};
const takeUnsent = (): { writer: string; state: PlayerState } | null => {
  try {
    const raw = localStorage.getItem(UNSENT_KEY);
    localStorage.removeItem(UNSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Одна вкладка с делом (R2-02): новая говорит «я здесь» и ждёт, пока прежняя дошлёт своё и
 * перестанет сохранять, — иначе прежняя дослала бы последнее уже после того, как новая заняла дело,
 * и оно пропало бы (RV-56). Прежняя сразу отвечает «есть» и потом «дослала»; «есть» не пришло за
 * 150 мс — прежней вкладки нет; «дослала» ждём не дольше 2 с.
 */
const TAB_CHANNEL = 'bunker-case';
const HELLO_MS = 150;
const HANDOVER_MS = 2000;

interface GameStore {
  materials: Material[];
  state: PlayerState | null;
  saveStatus: SaveStatus;
  /** Материал, открытый в просмотрщике (null — закрыт). */
  viewerId: string | null;
  /** Открыта папка формы заключения («Решить дело»). */
  folderOpen: boolean;
  /** Блокнот следователя выдвинут (DV-A). */
  notebookOpen: boolean;
  /** Выписка — на стену (A-272, DB-B): в поле версии, светится как новое. */
  pinExcerpt(x: WallExcerpt): void;
  /** Снять выписку со стены. */
  unpinExcerpt(id: string): void;
  /** «Открыть» у выписки: источник на этом месте (сайт — во вкладке, устройство — в руках). */
  openExcerpt(id: string): void;
  /** Вскрыли конверт 52: диск вынут — лежит на столе (сохраняется, A-272). */
  takeDiscOut(): void;
  /** Диск дотащили до дисковода: на столе играет вставка (лоток, раскрутка; DD-A). */
  discInserting: boolean;
  insertDisc(): void;
  /** Вставка доиграла — компьютер с новым значком программы. */
  discInserted(): void;
  setNotebookOpen(open: boolean): void;
  /** Сервер не ответил при загрузке — игра повторяет запрос. */
  loadFailed: boolean;
  /** Последнее поступление в дело (записка «Поступило»). */
  arrival: { ids: string[]; at: number } | null;
  dismissArrival(): void;
  /** Камера у телефона следователя на столе (6a-3, DP-A): кнопки нажимаются прямо на нём. */
  deskPhone: boolean;
  setDeskPhone(open: boolean): void;
  /** Компьютер следователя открыт крупно (щелчок по монитору на столе). */
  computerOpen: boolean;
  setComputerOpen(open: boolean): void;
  /** Компьютер следователя открыт на этом материале (поиск, 4c-3). */
  pcMaterial: string | null;
  openPc(material: string | null): void;
  /**
   * Вскрыть конверт архива или коробку (A-260): содержимое конвертов — на стол (3D-стол, автор
   * 24.11), коробок — на стену группой.
   */
  openContainer(id: ContainerId): void;
  /** 3D-стол: раскладка стола изменилась (положили, высыпали) — сохранить. */
  setDesk(items: DeskItem[]): void;
  /** 3D-стол: вещь со стола долетела до доски — висит на стене в этой точке (мир стены, угол). */
  hangFromDesk(id: string, x: number, y: number): void;
  /**
   * Вещь в руках (этап 4a): конверт, коробка или устройство — крупно, вертеть мышью, колесо —
   * ближе к точке под курсором, щелчок по самой вещи — вскрыть или включить.
   */
  held: Held | null;
  /**
   * Ноутбук руководителя вплотную, экраном к игроку (4c-1, SCR-C; WM-B — та же вещь в руках, камера
   * у экрана): живой экран. material — открыть файл из этого материала (поиск).
   */
  laptop: { material: string | null } | null;
  openLaptop(material?: string | null): void;
  /** Телефон Габриэля вплотную, экраном к игроку (4c-2, SCR-C; WM-B). */
  phone: { material: string | null } | null;
  openPhone(material?: string | null): void;
  /** Отойти от телефона: снова вещь в руках (или положить, toHands = false). */
  closePhone(toHands?: boolean): void;
  /** Камера инженера вплотную, экраном к игроку (A-268, как телефон — WM-B). */
  camera: boolean;
  openCamera(): void;
  closeCamera(toHands?: boolean): void;
  /** Ручка-диктофон лицом к игроку (4d-2). */
  pen: boolean;
  openPen(): void;
  closePen(toHands?: boolean): void;
  /** Отойти от экрана: ноутбук снова вещь в руках (или положить, toHands = false). */
  closeLaptop(toHands?: boolean): void;
  /** Поле ввода не примет значение до этого момента, мс (LK-A): по полю — «ноутбук». */
  fieldBlockedUntil: Record<string, number>;
  blockField(field: string, ms: number): void;
  hold(h: Held | null): void;
  /**
   * Прочитать лист, вынутый из вещи в руках (OP-D, EB-A): лист открыт, закрыли — вещь снова в
   * руках на том же месте (вскрытый конверт, коробка, пакет).
   */
  readFrom(materialId: string, back: Held): void;
  /** Куда вернуться, когда лист закрыт (readFrom). */
  backTo: Held | null;
  /**
   * Чтение со стола подряд (DC-B, автор 25.11): листы стола по порядку (с какого начали, дальше —
   * сверху вниз), какие уже открывали и какие оставить на столе. Закрыли — прочитанное, кроме
   * оставленного, висит на стене группой своего конверта.
   */
  deskRun: {
    ids: string[];
    read: string[];
    keep: string[];
    /**
     * Откуда читают подряд (RD-A, A-288: одно правило чтения «N из M» везде): стопка стола, лоток
     * «Входящие», группа на стене, пакеты коробки. Прочитанное само уходит на стену — только со стола.
     */
    source?: 'desk' | 'inbox' | 'wall' | 'box';
    /** Подпись полосы: «Входящие», название папки на стене, «Личные вещи». */
    label?: string;
  } | null;
  /** Щелчок по листу на столе: открыть и читать стол подряд (газета — просто открыть). */
  readDesk(materialId: string): void;
  /** Письмо из «Входящих»: открыть и читать лоток подряд (RD-A). */
  readInbox(materialId: string): void;
  /** Лист со стены: открыть и читать подряд листы той же папки на стене (RD-A). */
  readWall(materialId: string): void;
  /** Следующий (+1) или предыдущий (−1) лист стола. */
  deskStep(d: 1 | -1): void;
  /** Оставить открытый лист на столе (или снова отпустить на стену). */
  toggleKeep(): void;
  /** Открыть материал листом (экран устройства в 4a). */
  readMaterial(materialId: string): void;
  /** Повесить лист из «Входящих» на стену — в середину видимой части стены. */
  pinToWall(materialId: string): void;
  /** Движок открыл материалы: в дело и во «Входящие» на столе (правка автора 09.11). */
  addReleased(released: Material[]): void;
  /**
   * Найдено руками в предмете (AW-B, решение автора 10.11: вытащил, пролистал, перевернул) —
   * сразу на стену, рядом с вещью-источником; не во «Входящие».
   */
  addFound(released: Material[], near?: string, hang?: readonly string[]): void;
  /**
   * Что только что повесили на стену из найденного руками (AW-B): записка «На стене: … ·
   * Показать», когда вещь отложена; сама вещь на стене светится (foundId).
   */
  placed: { ids: string[]; text: string; at: number } | null;
  dismissPlaced(): void;
  /**
   * Повешено, но ещё не показано (правка автора 10.11): пока лист открыт или вещь в руках, на
   * стене этого не видно — появится и засветится, когда игрок их закроет. В сохранении — сразу.
   */
  pendingWall: string[];
  /** Показать отложенное на стене (лист и вещь закрыты). */
  showPendingWall(): void;
  /**
   * Новое на стене (правка автора 10.11): всё, что туда повесили — из конверта, «На стену»,
   * найденное руками, — светится, пока игрок не взялся за стену или не ушёл к столу от неё.
   */
  freshWall: string[];
  load(): Promise<void>;
  /** Дослать сохранение сейчас (перед «Новым делом»: иначе уход со страницы вернёт старое). */
  flushSave(): Promise<void>;
  /** Больше не сохранять (после flushSave: «Новое дело», выход); resumeSaving — если не вышло. */
  stopSaving(): void;
  resumeSaving(): void;
  /** Дело открыли в другой вкладке: здесь не сохраняется (R2-02). */
  elsewhere: boolean;
  setFolderOpen(open: boolean): void;
  /** Открыть материал; из поиска — с найденным словом (k — какое совпадение показать). */
  openViewer(materialId: string, find?: { q: string; k: number }, excerpt?: Excerpt): void;
  /**
   * Лист открыт выдержкой: только листы from–to описи пачки (папка, вытащенная из пачки) или
   * один раздел материала (обрывок, вынутый из него, — SRC-A).
   */
  excerpt: Excerpt | null;
  /** Вынуть обрывок из материала (SRC-A): он висит на стене своей карточкой. */
  takePiece(key: string): void;
  /**
   * Свели на стене края двух половин (WL-A, MG-A): движок отдаёт совмещённый лист, он висит
   * вместо половин (нити — к нему). false — не совместились.
   */
  joinOnWall(j: Join): Promise<boolean>;
  /** Лист открыт из поиска (RD-C): что подсветить. */
  /** Найденное: слова, номер совпадения и чьё (`for` — материал; RV-26: устройство берёт своё). */
  find: { q: string; k: number; for?: string } | null;
  /** Поиск по делу открыт (RD-C). */
  searchOpen: boolean;
  /** Карточка, найденная поиском, — подсвечена на стене (SR-D). */
  foundId: string | null;
  /** Перелёт камеры доски по поиску: меняется — камера стены плывёт к новой цели. */
  wallFly: number;
  /**
   * Показать вещь на стене (SR-D): вид «Стена», камера — вещь по центру свободной части экрана
   * (не под панелью поиска и папкой), приближение не меньше REVEAL_ZOOM; вещь подсвечена.
   * false — на стене её нет.
   */
  revealOnWall(id: string): boolean;
  clearFound(): void;
  setSearchOpen(open: boolean): void;
  closeViewer(): void;
  /** Сменить вид. К стене — в вид «как со стола» (ZM-B) или в данную камеру. */
  setView(view: View, wallCamera?: Camera): void;
  updateState(fn: (s: PlayerState) => PlayerState): void;
}

/** Выдержка листа: листы from–to описи пачки или один раздел материала (section). */
export type Excerpt = { title: string; from: number; to: number; section?: string };

const onWallNow = (s: PlayerState | null) => new Set((s?.wall.items ?? []).map((i) => i.id));

/** Пары половин, что сводятся сейчас (RV-18). */
const joining = new Set<string>();

/** Новая вкладка ждёт, пока прежняя дошлёт своё (см. TAB_CHANNEL). */
function handover(): Promise<void> {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const tab = new BroadcastChannel(TAB_CHANNEL);
    const done = () => {
      clearTimeout(timer);
      tab.close();
      resolve();
    };
    let timer = setTimeout(done, HELLO_MS);
    tab.onmessage = (e: MessageEvent<{ busy?: string; flushed?: string }>) => {
      if (e.data?.flushed === PAGE_ID) done();
      else if (e.data?.busy === PAGE_ID) {
        clearTimeout(timer);
        timer = setTimeout(done, HANDOVER_MS);
      }
    };
    tab.postMessage({ here: PAGE_ID });
  });
}

export const useGame = create<GameStore>((set, get) => {
  const saver = createSaver(putState, 500, (saveStatus) => {
    if (saveStatus === 'conflict') set({ saveStatus, elsewhere: true });
    else set({ saveStatus });
    const s = get().state;
    if (saveStatus === 'signedout' && s) stashUnsent(s);
  });
  if (typeof window !== 'undefined') {
    // Закрыли вкладку или перезагрузили раньше, чем истекла задержка, — дошлём сразу.
    window.addEventListener('pagehide', () => void saver.flush(true));
    // Не сохранилось — браузер переспросит, закрывать ли (R2-03).
    window.addEventListener('beforeunload', (e) => {
      const s = get().saveStatus;
      if (s === 'error' || s === 'saving') e.preventDefault();
    });
    // Выписки с сайтов (A-272, DB-B): ждут на сервере — повесить, сохранить, убрать из очереди.
    const takeExcerpts = async () => {
      const list = await getExcerpts();
      if (!list.length) return;
      for (const x of list) get().pinExcerpt(x);
      await saver.flush();
      // Подтвердить серверу — только когда стена с выписками сохранена (F10): иначе выписки
      // остаются в очереди и придут снова при следующем возвращении во вкладку.
      if (get().saveStatus !== 'saved') return;
      await ackExcerpts(list.map((x) => x.id));
    };
    // Игрок вернулся из вкладки сайта (A-272): открытое там — в игре (коробка банка, кабинет).
    let lookedAt = 0;
    let lookLater: ReturnType<typeof setTimeout> | null = null;
    const look = () => {
      const now = Date.now();
      if (document.hidden || !get().state || get().elsewhere) return;
      // Не чаще раза в 1,5 с; вернулись раньше — проверить чуть позже, а не пропустить: иначе
      // открытое на сайте (коробка банка) появится лишь при следующем возвращении.
      if (now - lookedAt < 1500) {
        if (!lookLater)
          lookLater = setTimeout(
            () => {
              lookLater = null;
              look();
            },
            1500 - (now - lookedAt),
          );
        return;
      }
      lookedAt = now;
      getMaterials()
        .then((m) => get().addReleased(m))
        .then(() => takeExcerpts())
        .catch(() => undefined);
    };
    window.addEventListener('focus', look);
    document.addEventListener('visibilitychange', look);
    // Одна вкладка с делом (R2-02): новая говорит «я здесь» — прежняя досылает своё и перестаёт
    // сохранять, иначе её старое состояние (таймер письма и т. п.) затёрло бы работу в новой.
    if ('BroadcastChannel' in window) {
      const tab = new BroadcastChannel(TAB_CHANNEL);
      tab.onmessage = (e: MessageEvent<{ here?: string }>) => {
        if (!e.data?.here || e.data.here === PAGE_ID) return;
        // Прежняя вкладка: «есть»; дослать своё, перестать сохранять и сказать новой «дослала».
        tab.postMessage({ busy: e.data.here });
        void saver.flush().then(() => {
          saver.stop();
          tab.postMessage({ flushed: e.data.here });
        });
        set({ elsewhere: true });
      };
    }
  }
  // Что повесили только что: прячется, пока лист или вещь открыты, и светится (правка автора 10.11).
  const markNew = (before: ReadonlySet<string>) => {
    const added = (get().state?.wall.items ?? []).map((i) => i.id).filter((id) => !before.has(id));
    if (!added.length) return;
    set({
      pendingWall: [...get().pendingWall, ...added],
      freshWall: [...get().freshWall, ...added],
    });
  };

  return {
    materials: [],
    state: null,
    saveStatus: 'saved',
    elsewhere: false,
    viewerId: null,
    folderOpen: false,
    notebookOpen: false,
    discInserting: false,
    loadFailed: false,
    arrival: null,
    computerOpen: false,
    deskPhone: false,
    pcMaterial: null,
    held: null,
    laptop: null,
    phone: null,
    camera: false,
    pen: false,
    fieldBlockedUntil: {},
    find: null,
    searchOpen: false,
    excerpt: null,
    placed: null,
    pendingWall: [],
    freshWall: [],
    foundId: null,
    wallFly: 0,
    backTo: null,
    deskRun: null,

    dismissArrival() {
      set({ arrival: null });
    },

    setDeskPhone(open) {
      set({ deskPhone: open, held: null, viewerId: null });
    },

    setComputerOpen(open) {
      set({ computerOpen: open, pcMaterial: null });
    },

    openPc(material) {
      set({ computerOpen: true, pcMaterial: material, held: null, viewerId: null });
    },

    openContainer(id) {
      const { materials } = get();
      const before = onWallNow(get().state);
      get().updateState((s) => openContainer(s, materials, id));
      markNew(before);
    },

    setDesk(items) {
      get().updateState((s) => ({ ...s, desk: items }));
    },

    hangFromDesk(id, x, y) {
      const before = onWallNow(get().state);
      get().updateState((s) => hangFromDesk(s, id, x, y));
      markNew(before);
    },

    openLaptop(material = null) {
      set({ laptop: { material }, held: { type: 'device', id: '47' }, viewerId: null });
    },

    openPhone(material = null) {
      set({ phone: { material }, held: { type: 'device', id: '48' }, viewerId: null });
    },

    openCamera() {
      set({ camera: true, held: { type: 'device', id: '24' }, viewerId: null });
    },

    closeCamera(toHands = true) {
      set({ camera: false, held: toHands ? { type: 'device', id: '24' } : null });
    },

    closePhone(toHands = true) {
      set({ phone: null, held: toHands ? { type: 'device', id: '48' } : null });
    },

    openPen() {
      set({ pen: true, held: null, viewerId: null });
    },

    closePen(toHands = true) {
      set({ pen: false, held: toHands ? { type: 'device', id: '49' } : null });
    },

    closeLaptop(toHands = true) {
      set({ laptop: null, held: toHands ? { type: 'device', id: '47' } : null });
    },

    blockField(field, ms) {
      set((g) => ({ fieldBlockedUntil: { ...g.fieldBlockedUntil, [field]: Date.now() + ms } }));
    },

    hold(h) {
      // Вещь (устройство, пакет) в руках — открывал (OP-A).
      if (h && h.type !== 'container') get().updateState((s) => markLooked(s, h.id));
      // Вплотную к экрану — только пока эта вещь в руках (WM-B).
      set((g) => ({
        held: h,
        laptop: h?.id === '47' ? g.laptop : null,
        phone: h?.id === '48' ? g.phone : null,
        camera: h?.id === '24' ? g.camera : false,
      }));
    },

    readDesk(materialId) {
      const s = get().state;
      if (!s) return;
      const sheet = (id: string) => !DEVICE_IDS.has(id) && id !== NEWSPAPER_ID;
      if (!sheet(materialId)) {
        get().openViewer(materialId);
        return;
      }
      // Подряд — по своей стопке (VZ-A): у каждой папки и у стартовых листов своя.
      const group = deskGroupOf(materialId);
      const rest = [...(s.desk ?? [])]
        .filter((d) => sheet(d.id) && d.id !== materialId && deskGroupOf(d.id) === group)
        .sort((a, b) => b.layer - a.layer)
        .map((d) => d.id);
      get().openViewer(materialId);
      if (get().viewerId === materialId)
        set({ deskRun: { ids: [materialId, ...rest], read: [materialId], keep: [] } });
    },

    deskStep(d) {
      const run = get().deskRun;
      const at = run ? run.ids.indexOf(get().viewerId ?? '') : -1;
      const next = run && at >= 0 ? run.ids[at + d] : undefined;
      if (!run || !next) return;
      // Следующий пакет из коробки — тоже пакет: закрыли лист — он в руках (BOX-B).
      if (run.source === 'box') {
        get().readFrom(next, { type: 'bag', id: next, inBox: true });
        set({
          deskRun: { ...run, read: run.read.includes(next) ? run.read : [...run.read, next] },
        });
        return;
      }
      get().openViewer(next);
      set({
        deskRun: { ...run, read: run.read.includes(next) ? run.read : [...run.read, next] },
      });
    },

    toggleKeep() {
      const run = get().deskRun;
      const id = get().viewerId;
      if (!run || !id || !run.ids.includes(id)) return;
      const keep = run.keep.includes(id) ? run.keep.filter((k) => k !== id) : [...run.keep, id];
      set({ deskRun: { ...run, keep } });
    },

    readFrom(materialId, back) {
      get().openViewer(materialId);
      if (get().viewerId === materialId) set({ held: null, backTo: back });
      // Пакет из коробки (BOX-B): дальше — «следующий пакет» стрелкой (RD-A).
      if (back.type === 'bag' && back.inBox) {
        const bags = [...BOX_KEEPS].filter((id) => get().materials.some((m) => m.id === id));
        if (bags.length > 1)
          set({
            deskRun: {
              ids: bags,
              read: [materialId],
              keep: [],
              source: 'box',
              label: 'Личные вещи',
            },
          });
      }
    },

    readInbox(materialId) {
      const s = get().state;
      if (!s) return;
      const ids = inboxIds(s, get().materials);
      get().openViewer(materialId);
      if (get().viewerId === materialId && ids.length > 1 && ids.includes(materialId))
        set({
          deskRun: { ids, read: [materialId], keep: [], source: 'inbox', label: 'Входящие' },
        });
    },

    readWall(materialId) {
      const s = get().state;
      get().openViewer(materialId);
      if (!s || get().viewerId !== materialId) return;
      const group = deskGroupOf(materialId);
      if (group === 'loose' || group === 'inventory') return;
      const ids = s.wall.items
        .map((i) => i.id)
        .filter((id) => deskGroupOf(id) === group && get().materials.some((m) => m.id === id))
        .sort();
      if (ids.length < 2) return;
      const label =
        group === 'start' ? 'Начало дела' : (CONTAINERS.find((c) => c.id === group)?.label ?? '');
      set({ deskRun: { ids, read: [materialId], keep: [], source: 'wall', label } });
    },

    readMaterial(materialId) {
      set({ viewerId: materialId, find: null });
    },

    pinToWall(materialId) {
      const before = onWallNow(get().state);
      get().updateState((s) => {
        if (s.wall.items.some((i) => i.id === materialId)) return s;
        const c = shownCamera(s);
        const cx = (window.innerWidth / 2 - c.x) / c.zoom;
        const cy = (window.innerHeight / 2 - c.y) / c.zoom;
        // У середины видимой стены, на свободное место (WALL-A): несколько подряд — не стопкой.
        return hangNear(s, materialId, { x: cx - CARD_W / 2, y: cy - CARD_H / 2 });
      });
      markNew(before);
    },

    addFound(released, near = '29', hang) {
      const { materials, state } = get();
      const known = new Set(materials.map((m) => m.id));
      const fresh = released.filter((m) => !known.has(m.id));
      const all = fresh.length ? [...materials, ...fresh] : materials;
      if (fresh.length) set({ materials: all });
      if (!state) return;
      // Что вешать: по умолчанию — всё найденное; папку из пачки — саму папку, без описи.
      const ids = hang ?? released.map((m) => m.id);
      const before = new Set(state.wall.items.map((i) => i.id));
      get().updateState((st) => {
        let s = fresh.length ? reconcile(st, all) : st;
        const anchor = s.wall.items.find((i) => i.id === near);
        // Рядом с вещью-источником, на свободное место (WALL-A); нет её на стене — у середины
        // видимой стены.
        const mid = () => {
          const c = shownCamera(s);
          return {
            x: (window.innerWidth / 2 - c.x) / c.zoom - CARD_W / 2,
            y: (window.innerHeight / 2 - c.y) / c.zoom - CARD_H / 2,
          };
        };
        const base = anchor ? { x: anchor.x + GRID_DX, y: anchor.y } : mid();
        for (const id of ids) s = hangNear(s, id, base);
        return s;
      });
      const added = ids.filter((id) => !before.has(id));
      if (!added.length) return;
      const title = (id: string) =>
        id.startsWith('F:')
          ? 'Папка'
          : (pieceOf(id)?.title ?? get().materials.find((m) => m.id === id)?.title ?? id);
      set({
        placed: { ids: added, text: added.map(title).join('; '), at: Date.now() },
        foundId: added[0] ?? null,
        pendingWall: [...get().pendingWall, ...added],
        freshWall: [...get().freshWall, ...added],
      });
    },

    showPendingWall() {
      if (get().pendingWall.length) set({ pendingWall: [] });
    },

    dismissPlaced() {
      set({ placed: null });
    },

    addReleased(released) {
      const { materials, state } = get();
      const known = new Set(materials.map((m) => m.id));
      const fresh = released.filter((m) => !known.has(m.id));
      if (fresh.length === 0) return;
      const all = [...materials, ...fresh];
      // Записка «Поступило» — о том, что легло в лоток; сайты, файлы устройств и содержимое
      // невскрытой коробки из банка — на своих местах (коробка сама подсвечена на столе).
      const boxed = state ? sealedIds(state) : new Set<string>();
      const ids = fresh.map((m) => m.id).filter((id) => deviceOf(id) === null && !boxed.has(id));
      set(ids.length ? { materials: all, arrival: { ids, at: Date.now() } } : { materials: all });
      if (state) get().updateState((s) => reconcile(s, all));
    },

    setNotebookOpen(open) {
      set({ notebookOpen: open });
    },

    pinExcerpt(x) {
      const before = onWallNow(get().state);
      get().updateState((s) => addExcerpt(s, x));
      markNew(before);
    },

    unpinExcerpt(id) {
      get().updateState((s) => removeExcerpt(s, id));
    },

    openExcerpt(id) {
      const x = get().state?.excerpts?.find((e) => e.id === id);
      if (!x) return;
      const find = { q: x.text, k: 0, for: x.material };
      // Полоска с бумаги (CMP-C): лист открыт на выписанной строке, как найденное поиском.
      if (x.place.kind === 'paper') {
        get().openViewer(x.material, find);
        return;
      }
      if (x.place.kind === 'site') {
        const hash = `#x=${encodeURIComponent(x.text)}${x.place.letter ? `&l=${x.place.letter}` : ''}`;
        openSite(x.place.address ?? '', window, hash);
        return;
      }
      const screen = x.place.screen;
      if (x.place.kind === 'pc')
        get().openPc(
          screen && /^L(21[45]|38[789]|390)$/.test(x.material)
            ? `${x.material}#${screen}`
            : x.material,
        );
      else if (x.place.kind === 'laptop') get().openLaptop(x.material);
      else if (x.place.kind === 'phone') {
        // Телефон — на том экране, где выписали (7.5): экран телефона живёт в сохранении.
        if (screen) get().updateState((s) => ({ ...s, phone: { screen } }));
        get().openPhone(x.material);
      } else get().openCamera();
      set({ find });
    },

    takeDiscOut() {
      get().updateState((s) => (s.discOut ? s : { ...s, discOut: true }));
    },
    insertDisc() {
      set({ discInserting: true, held: null });
    },
    discInserted() {
      // Компьютер открывается сам, только если игрок за эти секунды ничего не открыл (RV-33): раньше
      // он ложился поверх блокнота, листа или вещи в руках.
      const g = get();
      const busy =
        !!g.viewerId || !!g.held || g.notebookOpen || g.deskPhone || g.searchOpen || !!g.pen;
      set({ discInserting: false, ...(busy ? {} : { computerOpen: true, pcMaterial: null }) });
    },

    setFolderOpen(open) {
      set({ folderOpen: open });
    },

    openViewer(materialId, find, excerpt) {
      // Открывал — галочка в описи (OP-A).
      get().updateState((s) => markLooked(s, materialId));
      // Файл устройства открывают на самом устройстве (LW-A): ноутбук — экраном к игроку. Из поиска
      // найденное идёт с ним — устройство подсветит своё (RV-26).
      if (find && deviceOf(materialId)) set({ find: { ...find, for: materialId } });
      if (deviceOf(materialId) === '47') {
        get().openLaptop(materialId);
        return;
      }
      if (deviceOf(materialId) === '48') {
        get().openPhone(materialId);
        return;
      }
      if (deviceOf(materialId) === '24') {
        get().openCamera();
        return;
      }
      if (deviceOf(materialId) === 'pc') {
        get().openPc(materialId);
        return;
      }
      // Устройство берут в руки (этап 4a); из поиска — сразу текст.
      if (!find && DEVICE_IDS.has(materialId)) {
        set({ held: { type: 'device', id: materialId } });
        return;
      }
      // Новый лист поверх закрытого просмотрщика — не из вещи в руках: возвращаться некуда.
      set((g) => ({
        viewerId: materialId,
        find: find ?? null,
        excerpt: excerpt ?? null,
        backTo: g.viewerId ? g.backTo : null,
      }));
    },

    takePiece(key) {
      const p = PIECES.find((x) => x.key === key);
      const s = get().state;
      if (!p || !s || s.pieces?.includes(key)) return;
      get().updateState((st) => ({ ...st, pieces: [...(st.pieces ?? []), key] }));
      get().addFound([], p.from, [pieceItemId(key)]);
    },

    async joinOnWall(j) {
      // Один запуск на пару (RV-18): поправили половину, пока сервер отвечал, — второй запуск снимал
      // готовый лист со стены.
      if (joining.has(j.result) || get().state?.joined?.includes(j.result)) return false;
      joining.add(j.result);
      const r = await postAction('ОСМОТР', j.target, j.value)
        .catch(() => null)
        .finally(() => joining.delete(j.result));
      if (!r) return false;
      get().addFound(r.released, j.top, []);
      if (!get().materials.some((m) => m.id === j.result)) return false;
      const parts = new Set([j.top, j.bottom]);
      const was = get().state?.wall.items.find((i) => i.id === j.top);
      get().updateState((st) => {
        if (st.joined?.includes(j.result)) return st;
        const top = st.wall.items.find((i) => i.id === j.top) ?? was;
        const items = st.wall.items.filter((i) => !parts.has(i.id) && i.id !== j.result);
        // Нити половин — к совмещённому листу (без петель и повторов).
        const to = (id: string) => (parts.has(id) ? j.result : id);
        const seen = new Set<string>();
        const threads = st.wall.threads
          .map((t) => ({ ...t, from: to(t.from), to: to(t.to) }))
          .filter((t) => {
            const k = [t.from, t.to].sort().join('|');
            if (t.from === t.to || seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        const next = {
          ...st,
          joined: [...(st.joined ?? []), j.result],
          wall: { ...st.wall, items, threads },
        };
        return top ? moveItem(j.result, top.x, top.y)(next) : next;
      });
      set({
        foundId: j.result,
        freshWall: [...get().freshWall, j.result],
      });
      return true;
    },

    closeViewer() {
      // Читали стол подряд (DC-B): прочитанное, кроме оставленного, — на стену группой конверта.
      const run = get().deskRun;
      if (run) {
        set({ deskRun: null });
        // На стену само уходит только прочитанное со стола (DC-B); лоток и стена — как были.
        const file =
          (run.source ?? 'desk') === 'desk' ? run.read.filter((id) => !run.keep.includes(id)) : [];
        if (file.length) {
          const before = onWallNow(get().state);
          get().updateState((s) => fileFromDesk(s, file));
          markNew(before);
        }
      }
      // Лист вынут из вещи в руках (readFrom) — вещь снова в руках.
      const back = get().viewerId ? get().backTo : null;
      set({
        viewerId: null,
        find: null,
        excerpt: null,
        backTo: null,
        ...(back ? { held: back } : {}),
      });
    },

    revealOnWall(found) {
      const s = get().state;
      // Материал вынутой папки висит на стене папкой (DS-A): показать её.
      const folder = s?.taken?.find((t) => FOLDER_DOCS[t] === found);
      const id = folder ? folderItemId(folder) : found;
      const item = s?.wall.items.find((i) => i.id === id);
      if (!s || !item) return false;
      const vp = screen();
      const free = freeArea(vp);
      const cur = s.view === 'wall' ? s.wall.camera : boardCamera(vp);
      const zoom = Math.max(cur.zoom, REVEAL_ZOOM);
      const cx = item.x + CARD_W / 2;
      const cy = item.y + CARD_H / 2;
      const camera = clampToBounds(
        {
          zoom,
          x: Math.round((free.left + free.right) / 2 - cx * zoom),
          y: Math.round((free.top + free.bottom) / 2 - cy * zoom),
        },
        WALL_BOUNDS,
        vp,
      );
      set({ foundId: id, wallFly: get().wallFly + 1 });
      get().updateState((st) => ({ ...st, view: 'wall', wall: { ...st.wall, camera } }));
      return true;
    },

    clearFound() {
      if (get().foundId || get().freshWall.length) set({ foundId: null, freshWall: [] });
    },

    setSearchOpen(open) {
      set({ searchOpen: open });
    },

    flushSave() {
      return saver.flush();
    },
    stopSaving() {
      saver.stop();
    },
    resumeSaving() {
      saver.resume();
    },

    async load() {
      await handover();
      // Сервер мог ещё не подняться (503, пока база не готова) — повторяем раз в секунду.
      for (;;) {
        try {
          const [materials, { state, lastWriter }] = await Promise.all([
            getMaterials(),
            getState(),
          ]);
          set({ materials, state, loadFailed: false });
          // Недосланное при истёкшем входе (RV-57) — дослать, если дело с тех пор никто не писал.
          const unsent = takeUnsent();
          if (unsent && unsent.writer === lastWriter) get().updateState(() => unsent.state);
          // Первый день дела — для часов устройств (CL-D).
          if (state && !state.started) get().updateState((s) => ({ ...s, started: todayKey() }));
          // Только в разработке: «?opened=all» — все конверты вскрыты (автотесты и проверки).
          if (
            import.meta.env.DEV &&
            new URLSearchParams(window.location.search).get('opened') === 'all'
          )
            get().updateState((s) => openAll(s, materials));
          return;
        } catch {
          set({ loadFailed: true });
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    },

    setView(view, wallCamera) {
      // ZM-B (решение автора 10.11): к стене подходят в тот же вид, что со стола, — место
      // у стены не запоминается; переход — один полёт камеры, доска внутри не двигается.
      get().updateState((s) =>
        s.view === view
          ? s
          : view === 'wall'
            ? { ...s, view, wall: { ...s.wall, camera: wallCamera ?? boardCamera(screen()) } }
            : { ...s, view },
      );
    },

    updateState(fn) {
      const current = get().state;
      if (!current) return;
      const next = fn(current);
      // Ничего не изменилось — не перерисовывать и не сохранять (R2-09).
      if (next === current) return;
      set({ state: next });
      saver.schedule(next);
    },
  };
});

/**
 * Материалы, которые игрок видит: без невскрытых конвертов архива (A-260). По ним — поиск по
 * делу (A-196: «по открытым текстам»).
 */
export function useVisibleMaterials(): Material[] {
  const materials = useGame((g) => g.materials);
  const key = useGame((g) => (g.state ? openedOf(g.state).join(',') : ''));
  return useMemo(() => {
    const sealed = sealedIds({ opened: (key ? key.split(',') : []) as ContainerId[] });
    // Сайты — не материалы дела: поиск по делу их не находит (A-272, S5-A).
    return materials.filter((m) => !sealed.has(m.id) && !isWeb(m.id));
  }, [materials, key]);
}
