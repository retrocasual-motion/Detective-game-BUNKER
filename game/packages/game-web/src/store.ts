import { type Material, type PlayerState, reconcile, type View } from '@bunker/shared';
import { create } from 'zustand';
import { getMaterials, getState, putState } from './api.ts';
import { createSaver } from './save.ts';

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
  /** Движок открыл материалы: в дело и новой колонкой на стену (IN-B). */
  addReleased(released: Material[]): void;
  load(): Promise<void>;
  setPetitionOpen(open: boolean): void;
  openViewer(materialId: string): void;
  closeViewer(): void;
  setView(view: View): void;
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

    dismissArrival() {
      set({ arrival: null });
    },

    setComputerOpen(open) {
      set({ computerOpen: open });
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

    openViewer(materialId) {
      set({ viewerId: materialId });
    },

    closeViewer() {
      set({ viewerId: null });
    },

    async load() {
      // Сервер мог ещё не подняться (503, пока база не готова) — повторяем раз в секунду.
      for (;;) {
        try {
          const [materials, state] = await Promise.all([getMaterials(), getState()]);
          set({ materials, state, loadFailed: false });
          return;
        } catch {
          set({ loadFailed: true });
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    },

    setView(view) {
      get().updateState((s) => ({ ...s, view }));
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
