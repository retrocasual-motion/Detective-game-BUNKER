import { type ContainerId, inboxIds, openedOf } from '@bunker/shared';
import { useEffect, useMemo } from 'react';
import { ComputerScreen } from './computer/ComputerScreen.tsx';
import { ArrivalNote } from './desk/ArrivalNote.tsx';
import { Notebook } from './desk/Notebook.tsx';
import { PlacedNote } from './desk/PlacedNote.tsx';
import { ThrowToast, TrashView } from './desk/TrashBin.tsx';
import { DevActionLine } from './dev/DevActionLine.tsx';
import { HeldView } from './hold/HeldView.tsx';
import { LaptopView } from './laptop/LaptopView.tsx';
import { PetitionCorner } from './petition/PetitionCorner.tsx';
import { PhoneView } from './phone/PhoneView.tsx';
import { RoomScene } from './room/RoomScene.tsx';
import { KEY_DIR, NAV } from './room/views.ts';
import { SearchPanel } from './search/SearchPanel.tsx';
import { useGame } from './store.ts';
import { Viewer } from './viewer/Viewer.tsx';
import { WallView } from './wall/WallView.tsx';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName));

export function App() {
  // Только вид: стена подписана на своё сама, App не перерисовывает её на каждый сдвиг.
  const view = useGame((g) => g.state?.view);
  const load = useGame((g) => g.load);
  const setView = useGame((g) => g.setView);
  const viewerId = useGame((g) => g.viewerId);
  const computerOpen = useGame((g) => g.computerOpen);
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
      if (g.viewerId || g.computerOpen || !g.state) return;
      const to = NAV[g.state.view][dir];
      if (to) setView(to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView]);

  const wall = useMemo(() => <WallView />, []);
  // Строкой: новый массив на каждое изменение стора перерисовывал бы комнату без нужды.
  const inboxKey = useGame((g) => (g.state ? inboxIds(g.state, g.materials).join(',') : ''));
  const inbox = useMemo(() => (inboxKey ? inboxKey.split(',') : []), [inboxKey]);
  const trash = useGame((g) => g.state?.trash.length ?? 0);
  // Строкой — по той же причине, что и «Входящие».
  const openedKey = useGame((g) => (g.state ? openedOf(g.state).join(',') : ''));
  const opened = useMemo(
    () => (openedKey ? (openedKey.split(',') as ContainerId[]) : []),
    [openedKey],
  );

  if (!view) {
    return (
      <div className="placeholder">
        {loadFailed ? 'Сервер пока не отвечает, пробуем ещё…' : 'Загрузка…'}
      </div>
    );
  }

  return (
    <div className="room" data-testid="room">
      <RoomScene
        view={view}
        onGo={setView}
        hideNav={viewerId !== null || computerOpen}
        wall={wall}
        inbox={inbox}
        trash={trash}
        opened={opened}
      />
      {saveStatus === 'error' && (
        <div className="save-error" data-testid="save-error">
          Не сохранено
        </div>
      )}
      <ArrivalNote />
      <PlacedNote />
      <ComputerScreen />
      <LaptopView />
      <PhoneView />
      <TrashView />
      <HeldView />
      <SearchPanel />
      <ThrowToast />
      {viewerId && <Viewer key={viewerId} materialId={viewerId} />}
      <PetitionCorner />
      <Notebook />
      {import.meta.env.DEV && <DevActionLine />}
    </div>
  );
}
