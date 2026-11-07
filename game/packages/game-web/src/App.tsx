import type { View } from '@bunker/shared';
import { type ReactNode, useEffect } from 'react';
import { DeskView } from './desk/DeskView.tsx';
import { PetitionCorner } from './petition/PetitionCorner.tsx';
import { RoomOverview } from './room/RoomOverview.tsx';
import { RoomTabs } from './room/RoomTabs.tsx';
import { viewByArrow } from './room/views.ts';
import { useGame } from './store.ts';
import { Viewer } from './viewer/Viewer.tsx';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName));

function CurrentView({ view }: { view: View }): ReactNode {
  switch (view) {
    case 'room':
      return <RoomOverview />;
    case 'desk':
      return <DeskView onOpen={useGame.getState().openViewer} />;
    case 'left':
      return <div data-testid="view-left" className="placeholder" />;
    case 'right':
      return <div data-testid="view-right" className="placeholder" />;
  }
}

export function App() {
  const state = useGame((g) => g.state);
  const load = useGame((g) => g.load);
  const setView = useGame((g) => g.setView);
  const viewerId = useGame((g) => g.viewerId);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || isTyping(e.target)) return;
      if (useGame.getState().viewerId) return;
      const view = useGame.getState().state?.view;
      if (view) setView(viewByArrow(view, e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView]);

  if (!state) return <div className="placeholder">Загрузка…</div>;

  return (
    <div className="room" data-testid="room">
      <RoomTabs view={state.view} />
      <div className="room-view">
        <CurrentView view={state.view} />
      </div>
      {viewerId && <Viewer materialId={viewerId} />}
      <PetitionCorner />
    </div>
  );
}
