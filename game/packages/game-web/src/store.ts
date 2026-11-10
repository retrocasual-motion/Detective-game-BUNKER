import {
  boardCamera,
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
} from '@bunker/shared';
import { useMemo } from 'react';
import { create } from 'zustand';
import { getMaterials, getPendingMail, getState, putState } from './api.ts';
import { createSaver } from './save.ts';
import { type Binned, binLetter, moveItem, takeLetter, unbinLetter } from './wall/wall-actions.ts';

const screen = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Камера, с которой доска видна сейчас: со стола — вся целиком (WB-C), у стены — своя. */
export const shownCamera = (s: PlayerState) =>
  s.view === 'desk' ? boardCamera(screen()) : s.wall.camera;

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
  /** Через ms заглянуть, не пришёл ли ответ на ходатайство (MAIL-B: письмо во «Входящие»). */
  checkMailIn(ms: number): void;
  load(): Promise<void>;
  setPetitionOpen(open: boolean): void;
  /** Открыть материал; из поиска — с найденным словом (k — какое совпадение показать). */
  openViewer(materialId: string, find?: { q: string; k: number }): void;
  /** Лист открыт из поиска (RD-C): что подсветить. */
  find: { q: string; k: number } | null;
  /** Поиск по делу открыт (RD-C). */
  searchOpen: boolean;
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

    openViewer(materialId, find) {
      // Устройство берут в руки (этап 4a); из поиска — сразу текст.
      if (!find && DEVICE_IDS.has(materialId)) {
        set({ held: { type: 'device', id: materialId } });
        return;
      }
      set({ viewerId: materialId, find: find ?? null });
    },

    closeViewer() {
      set({ viewerId: null, find: null });
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
