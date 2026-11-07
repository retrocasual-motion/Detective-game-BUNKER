import type { Material, PlayerState, View } from '@bunker/shared';
import { create } from 'zustand';
import { getMaterials, getState, putState } from './api.ts';

export type SaveStatus = 'saved' | 'saving' | 'error';

interface GameStore {
  materials: Material[];
  state: PlayerState | null;
  saveStatus: SaveStatus;
  load(): Promise<void>;
  setView(view: View): void;
  updateState(fn: (s: PlayerState) => PlayerState): void;
}

export const useGame = create<GameStore>((set, get) => ({
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
    set({ state: next, saveStatus: 'saving' });
    putState(next).then(
      () => set({ saveStatus: 'saved' }),
      () => set({ saveStatus: 'error' }),
    );
  },
}));
