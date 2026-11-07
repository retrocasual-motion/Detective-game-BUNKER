import type { View } from '@bunker/shared';

export const VIEW_LABELS: Record<View, string> = {
  room: 'Комната',
  left: 'Слева',
  desk: 'Стол',
  right: 'Справа',
};

/** Порядок вкладок. Стрелки ходят по линии Слева ↔ Стол ↔ Справа. */
export const TAB_ORDER: View[] = ['room', 'left', 'desk', 'right'];
const LINE: View[] = ['left', 'desk', 'right'];

export function viewByArrow(view: View, key: 'ArrowLeft' | 'ArrowRight'): View {
  if (view === 'room') return key === 'ArrowLeft' ? 'left' : 'right';
  const i = LINE.indexOf(view);
  const next = key === 'ArrowLeft' ? Math.max(0, i - 1) : Math.min(LINE.length - 1, i + 1);
  return LINE[next] ?? view;
}
