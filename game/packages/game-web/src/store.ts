import {
  boardCamera,
  CARD_H,
  CARD_W,
  type Camera,
  type ContainerId,
  DEVICE_IDS,
  deviceOf,
  FOLDER_DOCS,
  folderItemId,
  type Join,
  type Material,
  openAll,
  openContainer,
  openedOf,
  PIECES,
  type PlayerState,
  pieceItemId,
  pieceOf,
  reconcile,
  sealedIds,
  type View,
  WALL_BOUNDS,
} from '@bunker/shared';
import { useMemo } from 'react';
import { create } from 'zustand';
import { getMaterials, getPendingMail, getState, postAction, putState } from './api.ts';
import { clampToBounds } from './canvas/math.ts';
import { todayKey } from './clock.ts';
import { createSaver } from './save.ts';
import { type Binned, binLetter, moveItem, takeLetter, unbinLetter } from './wall/wall-actions.ts';

const screen = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Камера, с которой доска видна сейчас: со стола — вся целиком (WB-C), у стены — своя. */
export const shownCamera = (s: PlayerState) =>
  s.view === 'desk' ? boardCamera(screen()) : s.wall.camera;

/** Найденное поиском показывается не мельче этого (карточка ~100 px, заголовок читается). */
const REVEAL_ZOOM = 0.6;

/** Часть экрана, не закрытая панелью поиска (справа) и папкой запроса (слева). */
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

/** Сколько можно «Вернуть» выброшенное письмо, мс. */
const UNDO_MS = 6000;

/** Что в руках: конверт или коробка архива — или изъятое устройство (по номеру материала). */
export type Held = { type: 'container'; id: ContainerId } | { type: 'device'; id: string };

export type SaveStatus = 'saved' | 'saving' | 'error';

interface GameStore {
  materials: Material[];
  state: PlayerState | null;
  saveStatus: SaveStatus;
  /** Материал, открытый в просмотрщике (null — закрыт). */
  viewerId: string | null;
  /** Открыта папка запроса. */
  petitionOpen: boolean;
  /** Блокнот следователя выдвинут (DV-A). */
  notebookOpen: boolean;
  setNotebookOpen(open: boolean): void;
  /** Сервер не ответил при загрузке — игра повторяет запрос. */
  loadFailed: boolean;
  /** Последнее поступление в дело (записка «Поступило»). */
  arrival: { ids: string[]; at: number } | null;
  dismissArrival(): void;
  /** Компьютер следователя открыт крупно (щелчок по монитору на столе). */
  computerOpen: boolean;
  setComputerOpen(open: boolean): void;
  /** Компьютер следователя открыт на этом материале (поиск, 4c-3). */
  pcMaterial: string | null;
  openPc(material: string | null): void;
  /** Вскрыть конверт архива или коробку (A-260): содержимое — на стену группой. */
  openContainer(id: ContainerId): void;
  /** Окно корзины у стола открыто (TR-A). */
  trashOpen: boolean;
  setTrashOpen(open: boolean): void;
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
  /** Открыть материал листом (экран устройства в 4a). */
  readMaterial(materialId: string): void;
  /** Только что выброшенное письмо — его можно «Вернуть» несколько секунд. */
  binned: Binned | null;
  /** Письмо-ответ — в корзину (со стены или из «Входящих»); остальное не выбрасывается. */
  throwAway(id: string): void;
  undoThrow(): void;
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
  /** Через ms заглянуть, не пришёл ли ответ на запрос (MAIL-B: письмо во «Входящие»). */
  checkMailIn(ms: number): void;
  load(): Promise<void>;
  setPetitionOpen(open: boolean): void;
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
  find: { q: string; k: number } | null;
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

export const useGame = create<GameStore>((set, get) => {
  const saver = createSaver(putState, 500, (saveStatus) => set({ saveStatus }));
  if (typeof window !== 'undefined') {
    // Закрыли вкладку или перезагрузили раньше, чем истекла задержка, — дошлём сразу.
    window.addEventListener('pagehide', () => void saver.flush());
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
    viewerId: null,
    petitionOpen: false,
    notebookOpen: false,
    loadFailed: false,
    arrival: null,
    computerOpen: false,
    pcMaterial: null,
    trashOpen: false,
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
    binned: null,

    dismissArrival() {
      set({ arrival: null });
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
      // Вплотную к экрану — только пока эта вещь в руках (WM-B).
      set((g) => ({
        held: h,
        laptop: h?.id === '47' ? g.laptop : null,
        phone: h?.id === '48' ? g.phone : null,
        camera: h?.id === '24' ? g.camera : false,
      }));
    },

    readMaterial(materialId) {
      set({ viewerId: materialId, find: null });
    },

    setTrashOpen(open) {
      set({ trashOpen: open });
    },

    throwAway(id) {
      const s = get().state;
      if (!s || s.trash.includes(id)) return;
      const taken = takeLetter(id, s);
      get().updateState(binLetter(id));
      if (!get().state?.trash.includes(id)) return;
      set({ binned: taken });
      setTimeout(() => set((g) => (g.binned === taken ? { binned: null } : g)), UNDO_MS);
    },

    undoThrow() {
      const b = get().binned;
      if (b) get().updateState(unbinLetter(b));
      set({ binned: null });
    },

    pinToWall(materialId) {
      const before = onWallNow(get().state);
      get().updateState((s) => {
        if (s.wall.items.some((i) => i.id === materialId)) return s;
        const c = shownCamera(s);
        const cx = (window.innerWidth / 2 - c.x) / c.zoom;
        const cy = (window.innerHeight / 2 - c.y) / c.zoom;
        // Несколько подряд — не стопкой: каждый следующий чуть ниже и правее.
        const k = s.wall.items.filter((i) => i.id.startsWith('L')).length % 6;
        return moveItem(materialId, cx - 80 + k * 30, cy - 110 + k * 30)(s);
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
        for (const id of ids) {
          const m = { id };
          if (s.wall.items.some((i) => i.id === m.id)) continue;
          // Правее вещи-источника, рядами по три; нет её на стене — в середину видимой стены.
          const k = s.wall.items.filter((i) => /^(L|F:)/.test(i.id)).length;
          const c = shownCamera(s);
          const base = anchor ?? {
            x: (window.innerWidth / 2 - c.x) / c.zoom - 200,
            y: (window.innerHeight / 2 - c.y) / c.zoom - 110,
          };
          s = moveItem(m.id, base.x + 220 + (k % 3) * 200, base.y + Math.floor(k / 3) * 270)(s);
        }
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
      set({ materials: all, arrival: { ids: fresh.map((m) => m.id), at: Date.now() } });
      if (state) get().updateState((s) => reconcile(s, all));
    },

    setNotebookOpen(open) {
      set({ notebookOpen: open });
    },

    setPetitionOpen(open) {
      set({ petitionOpen: open });
    },

    openViewer(materialId, find, excerpt) {
      // Файл устройства открывают на самом устройстве (LW-A): ноутбук — экраном к игроку.
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
      set({ viewerId: materialId, find: find ?? null, excerpt: excerpt ?? null });
    },

    takePiece(key) {
      const p = PIECES.find((x) => x.key === key);
      const s = get().state;
      if (!p || !s || s.pieces?.includes(key)) return;
      get().updateState((st) => ({ ...st, pieces: [...(st.pieces ?? []), key] }));
      get().addFound([], p.from, [pieceItemId(key)]);
    },

    async joinOnWall(j) {
      const r = await postAction('ОСМОТР', j.target, j.value).catch(() => null);
      if (!r) return false;
      get().addFound(r.released, j.top, []);
      if (!get().materials.some((m) => m.id === j.result)) return false;
      const parts = new Set([j.top, j.bottom]);
      const was = get().state?.wall.items.find((i) => i.id === j.top);
      get().updateState((st) => {
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
      set({ viewerId: null, find: null, excerpt: null });
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

    checkMailIn(ms) {
      setTimeout(async () => {
        try {
          get().addReleased(await getMaterials());
        } catch {
          // Сервер не ответил — заглянем ещё раз чуть позже.
          get().checkMailIn(3000);
        }
      }, Math.max(0, ms) + 300);
    },

    async load() {
      // Сервер мог ещё не подняться (503, пока база не готова) — повторяем раз в секунду.
      for (;;) {
        try {
          const [materials, state] = await Promise.all([getMaterials(), getState()]);
          set({ materials, state, loadFailed: false });
          // Первый день дела — для часов устройств (CL-D).
          if (state && !state.started) get().updateState((s) => ({ ...s, started: todayKey() }));
          // Только в разработке: «?opened=all» — все конверты вскрыты (автотесты и проверки).
          if (
            import.meta.env.DEV &&
            new URLSearchParams(window.location.search).get('opened') === 'all'
          )
            get().updateState((s) => openAll(s, materials));
          // Письма, которые ещё в пути (запрос отправили до перезагрузки).
          getPendingMail()
            .then((inMs) => {
              for (const ms of inMs) get().checkMailIn(ms);
            })
            .catch(() => undefined);
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
      set({ state: next });
      saver.schedule(next);
    },
  };
});

/**
 * Материалы, которые игрок видит: без невскрытых конвертов архива (A-260). По ним — поиск по
 * делу (A-196: «по открытым текстам») и адресная книга запроса.
 */
export function useVisibleMaterials(): Material[] {
  const materials = useGame((g) => g.materials);
  const key = useGame((g) => (g.state ? openedOf(g.state).join(',') : ''));
  return useMemo(() => {
    const sealed = sealedIds({ opened: (key ? key.split(',') : []) as ContainerId[] });
    return materials.filter((m) => !sealed.has(m.id));
  }, [materials, key]);
}
