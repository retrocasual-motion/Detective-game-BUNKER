import type { View } from '@bunker/shared';
import { useGame } from '../store.ts';
import { VIEW_LABELS } from './views.ts';

const ZONES: View[] = ['left', 'desk', 'right'];

/** Общий вид комнаты. Пока зоны-кнопки; отрисованная комната — позже, без переделки. */
export function RoomOverview() {
  const setView = useGame((g) => g.setView);
  return (
    <div className="room-overview" data-testid="view-room">
      {ZONES.map((v) => (
        <button key={v} type="button" className="room-zone" onClick={() => setView(v)}>
          {VIEW_LABELS[v]}
        </button>
      ))}
    </div>
  );
}
