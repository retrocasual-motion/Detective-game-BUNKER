import { create } from 'zustand';

/** Что на экране поверх игры (MM-A): главное меню, титры или само дело. */
export type Screen = 'menu' | 'game' | 'credits';

/** `?play` — сразу в дело, без меню (автотесты и проверки). */
const skipMenu = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('play');

interface MenuStore {
  screen: Screen;
  go(screen: Screen): void;
}

export const useMenu = create<MenuStore>((set) => ({
  screen: skipMenu() ? 'game' : 'menu',
  go(screen) {
    set({ screen });
  },
}));
