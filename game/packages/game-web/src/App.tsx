import { type ContainerId, EPILOGUE_ID, inboxIds, openedOf } from '@bunker/shared';
import { useEffect, useMemo } from 'react';

import { ArrivalNote } from './desk/ArrivalNote.tsx';
import { Notebook } from './desk/Notebook.tsx';
import { PlacedNote } from './desk/PlacedNote.tsx';
import { ThrowToast, TrashView } from './desk/TrashBin.tsx';
import { DevActionLine } from './dev/DevActionLine.tsx';
import { HeldView } from './hold/HeldView.tsx';
import { Credits, MainMenu, MenuTab } from './menu/MainMenu.tsx';
import { PcView } from './pc/PcView.tsx';
import { PetitionCorner } from './petition/PetitionCorner.tsx';
import { PenView } from './player/PenView.tsx';
import { RoomScene } from './room/RoomScene.tsx';
import { KEY_DIR, NAV } from './room/views.ts';
import { SearchPanel } from './search/SearchPanel.tsx';
import { useGame } from './store.ts';
import { SolveCase } from './verdict/SolveCase.tsx';
import { VerdictCorner } from './verdict/VerdictCorner.tsx';
import { EpilogueNote, VerdictResult } from './verdict/VerdictResult.tsx';
import { useVerdict } from './verdict/verdict-store.ts';
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
  // Вещь в руках, компьютер или ручка вплотную — их слой закрывает верхние кнопки.
  const holding = useGame((g) => g.held !== null || g.computerOpen || !!g.pen);
  const loadFailed = useGame((g) => g.loadFailed);
  // Только то, что видно игроку: каждое «сохраняю → сохранено» не перерисовывает комнату (R3-06).
  const saveProblem = useGame((g) =>
    g.saveStatus === 'error' || g.saveStatus === 'rejected' ? g.saveStatus : null,
  );
  const elsewhere = useGame((g) => g.elsewhere);
  // После «Решить дело» папка запроса уступает место форме заключения (P-9).
  const closed = useVerdict((v) => v.status.form || v.status.sent);
  // Эпилог после заключения — конвертом на столе; пока не открыт — подсвечен (автор 17.11).
  const epilogue = useGame((g) =>
    !g.materials.some((m) => m.id === EPILOGUE_ID)
      ? 'none'
      : g.state?.verdict?.epilogueRead
        ? 'read'
        : 'fresh',
  );

  useEffect(() => {
    load();
    // Где дело (A-270): форма заключения открыта или заключение отправлено.
    void useVerdict.getState().load();
  }, [load]);

  // Клавиши дублируют стрелки на экране (основной способ — мышь).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (!dir || isTyping(e.target)) return;
      const g = useGame.getState();
      // Вещь в руках — стрелки её (меню фотоаппарата), не комнаты (R3-01).
      if (g.viewerId || g.computerOpen || g.held || !g.state) return;
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
    // По центру и прямо: что случилось и что игра делает сама (R5-11).
    return (
      <div className="placeholder placeholder-center" role="status" data-testid="loading">
        {loadFailed ? (
          <>
            <p>Нет связи с сервером игры.</p>
            <p className="placeholder-note">
              Пробуем снова каждую секунду — дело не потеряно. Проверьте интернет.
            </p>
          </>
        ) : (
          'Загрузка…'
        )}
      </div>
    );
  }

  return (
    // Вещь в руках — верхние кнопки и стрелки комнаты прячутся, как у компьютера: слой вещи их
    // закрывает, щелчок по ним молчал или только клал вещь (R5-03, R5-04).
    <div className={holding ? 'room room-holding' : 'room'} data-testid="room">
      <RoomScene
        view={view}
        onGo={setView}
        hideNav={viewerId !== null || computerOpen || holding}
        wall={wall}
        inbox={inbox}
        trash={trash}
        opened={opened}
        epilogue={epilogue}
      />
      {saveProblem === 'error' && (
        <div className="save-error" data-testid="save-error" role="status">
          Не сохранено — пробуем ещё раз
        </div>
      )}
      {saveProblem === 'rejected' && !elsewhere && (
        <div className="save-error save-error-hard" data-testid="save-rejected" role="alert">
          Сервер не принял сохранение: дело изменилось в другом месте.{' '}
          <button type="button" onClick={() => window.location.reload()}>
            Обновить
          </button>
        </div>
      )}
      {elsewhere && (
        <div
          className="elsewhere"
          data-testid="elsewhere"
          role="alertdialog"
          aria-label="Дело открыто в другой вкладке"
        >
          <div className="elsewhere-card">
            <p>Дело открыто в другой вкладке. Здесь изменения не сохраняются.</p>
            <button
              type="button"
              className="main-menu-main"
              onClick={() => window.location.reload()}
            >
              Играть здесь
            </button>
          </div>
        </div>
      )}
      <ArrivalNote />
      <PlacedNote />
      <PcView />
      <PenView />
      <TrashView />
      <HeldView />
      <SearchPanel />
      <ThrowToast />
      {viewerId && <Viewer key={viewerId} materialId={viewerId} />}
      {closed ? <VerdictCorner /> : <PetitionCorner />}
      <MenuTab />
      <SolveCase />
      <EpilogueNote />
      <VerdictResult />
      <Notebook />
      {import.meta.env.DEV && <DevActionLine />}
      <MainMenu />
      <Credits />
    </div>
  );
}
