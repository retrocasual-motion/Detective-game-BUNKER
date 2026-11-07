import type { View } from '@bunker/shared';
import { type ReactNode, useEffect } from 'react';
import { BoardView } from './board/BoardView.tsx';
import { pinToBoard } from './board/board-actions.ts';
import { DeskView } from './desk/DeskView.tsx';
import { LeftView } from './left/LeftView.tsx';
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
      return <LeftView />;
    case 'right':
      return <BoardView />;
  }
}

export function App() {
  const state = useGame((g) => g.state);
  const load = useGame((g) => g.load);
  const setView = useGame((g) => g.setView);
  const viewerId = useGame((g) => g.viewerId);
  const loadFailed = useGame((g) => g.loadFailed);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || isTyping(e.target)) return;
      const g = useGame.getState();
      if (g.viewerId || g.petitionOpen) return;
      const view = useGame.getState().state?.view;
      if (view) setView(viewByArrow(view, e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView]);

  if (!state) {
    return (
      <div className="placeholder">
        {loadFailed ? 'Сервер пока не отвечает, пробуем ещё…' : 'Загрузка…'}
      </div>
    );
  }

  return (
    <div className="room" data-testid="room">
      <RoomTabs view={state.view} />
      <div className="room-view">
        <CurrentView view={state.view} />
      </div>
      {viewerId && (
        <Viewer
          materialId={viewerId}
          onPin={(id) =>
            useGame
              .getState()
              .updateState(pinToBoard(id, { width: window.innerWidth, height: window.innerHeight }))
          }
        />
      )}
      <PetitionCorner />
    </div>
  );
}
