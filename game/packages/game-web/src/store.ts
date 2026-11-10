import {
  boardCamera,
  CARD_H,
  CARD_W,
  type Camera,
  type ContainerId,
  DEVICE_IDS,
  type Material,
  openAll,
  openContainer,
  openedOf,
  type PlayerState,
  reconcile,
  sealedIds,
  type View,
  WALL_BOUNDS,
} from '@bunker/shared';
import { useMemo } from 'react';
import { create } from 'zustand';
import { getMaterials, getPendingMail, getState, putState } from './api.ts';
import { clampToBounds } from './canvas/math.ts';
import { createSaver } from './save.ts';
import { type Binned, binLetter, moveItem, takeLetter, unbinLetter } from './wall/wall-actions.ts';

const screen = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Камера, с которой доска видна сейчас: со стола — вся целиком (WB-C), у стены — своя. */
export const shownCamera = (s: PlayerState) =>
  s.view === 'desk' ? boardCamera(screen()) : s.wall.camera;

/** Найденное поиском показывается не мельче этого (карточка ~100 px, заголовок читается). */
const REVEAL_ZOOM = 0.6;

/** Часть экрана, не закрытая панелью поиска (справа) и папкой ходатайства (слева). */
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
  /** Открыта папка ходатайства. */
  petitionOpen: boolean;
  /** Сервер не ответил при загрузке — игра повторяет запрос. */
  loadFailed: boolean;
  /** Последнее поступление в дело (записка «Поступило»). */
  arrival: { ids: string[]; at: number } | null;
  dismissArrival(): void;
  /** Компьютер следователя открыт крупно (щелчок по монитору на столе). */
  computerOpen: boolean;
  setComputerOpen(open: boolean): void;
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
  /** Через ms заглянуть, не пришёл ли ответ на ходатайство (MAIL-B: письмо во «Входящие»). */
  checkMailIn(ms: number): void;
  load(): Promise<void>;
  setPetitionOpen(open: boolean): void;
  /** Открыть материал; из поиска — с найденным словом (k — какое совпадение показать). */
  openViewer(
    materialId: string,
    find?: { q: string; k: number },
    excerpt?: { title: string; from: number; to: number },
  ): void;
  /** Лист открыт выдержкой: только листы from–to описи пачки (папка, вытащенная из пачки). */
  excerpt: { title: string; from: number; to: number } | null;
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

export const useGame = create<GameStore>((set, get) => {
  const saver = createSaver(putState, 500, (saveStatus) => set({ saveStatus }));
  if (typeof window !== 'undefined') {
    // Закрыли вкладку или перезагрузили раньше, чем истекла задержка, — дошлём сразу.
    window.addEventListener('pagehide', () => void saver.flush());
  }

  return {
    materials: [],
    state: null,
    saveStatus: 'saved',
    viewerId: null,
    petitionOpen: false,
    loadFailed: false,
    arrival: null,
    computerOpen: false,
    trashOpen: false,
    held: null,
    find: null,
    searchOpen: false,
    excerpt: null,
    placed: null,
    foundId: null,
    wallFly: 0,
    binned: null,

    dismissArrival() {
      set({ arrival: null });
    },

    setComputerOpen(open) {
      set({ computerOpen: open });
    },

    openContainer(id) {
      const { materials } = get();
      get().updateState((s) => openContainer(s, materials, id));
    },

    hold(h) {
      set({ held: h });
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
      get().updateState((s) => {
        if (s.wall.items.some((i) => i.id === materialId)) return s;
        const c = shownCamera(s);
        const cx = (window.innerWidth / 2 - c.x) / c.zoom;
        const cy = (window.innerHeight / 2 - c.y) / c.zoom;
        // Несколько подряд — не стопкой: каждый следующий чуть ниже и правее.
        const k = s.wall.items.filter((i) => i.id.startsWith('L')).length % 6;
        return moveItem(materialId, cx - 80 + k * 30, cy - 110 + k * 30)(s);
      });
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
        id.startsWith('F:') ? 'Папка' : (get().materials.find((m) => m.id === id)?.title ?? id);
      set({
        placed: { ids: added, text: added.map(title).join('; '), at: Date.now() },
        foundId: added[0] ?? null,
      });
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

    setPetitionOpen(open) {
      set({ petitionOpen: open });
    },

    openViewer(materialId, find, excerpt) {
      // Устройство берут в руки (этап 4a); из поиска — сразу текст.
      if (!find && DEVICE_IDS.has(materialId)) {
        set({ held: { type: 'device', id: materialId } });
        return;
      }
      set({ viewerId: materialId, find: find ?? null, excerpt: excerpt ?? null });
    },

    closeViewer() {
      set({ viewerId: null, find: null, excerpt: null });
    },

    revealOnWall(id) {
      const s = get().state;
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
      if (get().foundId) set({ foundId: null });
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
          // Только в разработке: «?opened=all» — все конверты вскрыты (автотесты и проверки).
          if (
            import.meta.env.DEV &&
            new URLSearchParams(window.location.search).get('opened') === 'all'
          )
            get().updateState((s) => openAll(s, materials));
          // Письма, которые ещё в пути (ходатайство отправили до перезагрузки).
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
 * делу (A-196: «по открытым текстам») и адресная книга ходатайства.
 */
export function useVisibleMaterials(): Material[] {
  const materials = useGame((g) => g.materials);
  const key = useGame((g) => (g.state ? openedOf(g.state).join(',') : ''));
  return useMemo(() => {
    const sealed = sealedIds({ opened: (key ? key.split(',') : []) as ContainerId[] });
    return materials.filter((m) => !sealed.has(m.id));
  }, [materials, key]);
}
