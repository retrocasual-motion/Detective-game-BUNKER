import { useEffect } from 'react';
import { BoardView } from './board/BoardView.tsx';
import { pinToBoard } from './board/board-actions.ts';
import { DeskView } from './desk/DeskView.tsx';
import { LeftView } from './left/LeftView.tsx';
import { PetitionCorner } from './petition/PetitionCorner.tsx';
import { RoomScene } from './room/RoomScene.tsx';
import { KEY_DIR, NAV } from './room/views.ts';
import { useGame } from './store.ts';
import { Viewer } from './viewer/Viewer.tsx';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName));

export function App() {
  const state = useGame((g) => g.state);
  const load = useGame((g) => g.load);
  const setView = useGame((g) => g.setView);
  const openViewer = useGame((g) => g.openViewer);
  const viewerId = useGame((g) => g.viewerId);
  const loadFailed = useGame((g) => g.loadFailed);
  const saveStatus = useGame((g) => g.saveStatus);

  useEffect(() => {
    load();
  }, [load]);

  // Клавиши дублируют стрелки на экране (основной способ — мышь).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (!dir || isTyping(e.target)) return;
      const g = useGame.getState();
      if (g.viewerId || !g.state) return;
      const to = NAV[g.state.view][dir];
      if (to) setView(to);
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
      <RoomScene
        view={state.view}
        onGo={setView}
        hideNav={viewerId !== null}
        faces={{
          desk: <DeskView onOpen={openViewer} />,
          left: <LeftView />,
          right: <BoardView />,
        }}
      />
      {saveStatus === 'error' && (
        <div className="save-error" data-testid="save-error">
          Не сохранено
        </div>
      )}
      {viewerId && (
        <Viewer
          key={viewerId}
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
