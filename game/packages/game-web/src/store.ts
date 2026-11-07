import type { Material, PlayerState, View } from '@bunker/shared';
import { create } from 'zustand';
import { getMaterials, getState, putState } from './api.ts';
import { createSaver } from './save.ts';

export type SaveStatus = 'saved' | 'saving' | 'error';

interface GameStore {
  materials: Material[];
  state: PlayerState | null;
  saveStatus: SaveStatus;
  load(): Promise<void>;
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

    async load() {
      const [materials, state] = await Promise.all([getMaterials(), getState()]);
      set({ materials, state });
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
