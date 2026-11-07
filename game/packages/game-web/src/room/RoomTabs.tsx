import type { View } from '@bunker/shared';
import { useGame } from '../store.ts';
import { TAB_ORDER, VIEW_LABELS } from './views.ts';

export function RoomTabs({ view }: { view: View }) {
  const setView = useGame((g) => g.setView);
  const saveStatus = useGame((g) => g.saveStatus);
  return (
    <div className="room-tabs" role="tablist">
      {TAB_ORDER.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          className="room-tab"
          aria-selected={v === view}
          data-testid={`view-tab-${v}`}
          onClick={() => setView(v)}
        >
          {VIEW_LABELS[v]}
        </button>
      ))}
      {saveStatus === 'error' && (
        <span className="room-status" data-testid="save-error">
          Не сохранено
        </span>
      )}
    </div>
  );
}
