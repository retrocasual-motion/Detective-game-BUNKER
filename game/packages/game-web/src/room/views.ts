import type { View } from '@bunker/shared';

export const VIEW_LABELS: Record<View, string> = {
  room: 'Комната',
  left: 'Слева',
  desk: 'Стол',
  right: 'Справа',
};

export type Dir = 'left' | 'right' | 'up' | 'down';

/**
 * Куда ведёт каждая стрелка (TECH_PLAN 4.0): со стола — влево, вправо и назад в комнату;
 * из «Слева» и «Справа» — обратно к столу; из комнаты — к любой зоне.
 */
export const NAV: Record<View, Partial<Record<Dir, View>>> = {
  desk: { left: 'left', right: 'right', up: 'room' },
  left: { right: 'desk' },
  right: { left: 'desk' },
  room: { left: 'left', right: 'right', down: 'desk' },
};

export const KEY_DIR: Partial<Record<string, Dir>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};
