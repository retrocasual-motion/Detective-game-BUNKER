import type { View } from '@bunker/shared';

export const VIEW_LABELS: Record<View, string> = {
  desk: 'Стол',
  wall: 'Стена',
};

export type Dir = 'left' | 'right' | 'up' | 'down';

/**
 * Куда ведёт каждая стрелка (решение «Стена», 08.11): со стола — вверх, поднять взгляд на
 * стену; со стены — вниз, обратно к столу. Клавиши ↑ и ↓ дублируют стрелки.
 */
export const NAV: Record<View, Partial<Record<Dir, View>>> = {
  desk: { up: 'wall' },
  wall: { down: 'desk' },
};

export const KEY_DIR: Partial<Record<string, Dir>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};
