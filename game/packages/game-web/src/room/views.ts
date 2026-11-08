import type { View } from '@bunker/shared';

export const VIEW_LABELS: Record<View, string> = {
  room: 'Комната',
  left: 'Слева',
  desk: 'Стол',
  right: 'Справа',
};

export type Dir = 'left' | 'right' | 'up' | 'down';

/**
 * Куда ведёт каждая стрелка (TECH_PLAN 4.0): со стола — влево и вправо; из «Слева» и
 * «Справа» — обратно к столу. Стрелка внизу по центру — на каждом виде, ведёт в комнату
 * (решение автора 08.11.2026); в комнате та же стрелка возвращает к столу.
 */
export const NAV: Record<View, Partial<Record<Dir, View>>> = {
  desk: { left: 'left', right: 'right', down: 'room' },
  left: { right: 'desk', down: 'room' },
  right: { left: 'desk', down: 'room' },
  room: { left: 'left', right: 'right', down: 'desk' },
};

export const KEY_DIR: Partial<Record<string, Dir>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};
