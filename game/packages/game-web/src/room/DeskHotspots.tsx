import { CARD_W, type ContainerId, SERVER_DISC_ID } from '@bunker/shared';
import { useMemo } from 'react';
import { startGhostDrag } from '../canvas/ghostDrag.ts';
import { screenToWorld } from '../canvas/math.ts';
import { shownCamera, useGame } from '../store.ts';
import { folderFieldAt, toVerdict, useCardDrop, wholeCard } from '../verdict/cards.ts';
import { markEpilogueRead, verdictActive } from '../verdict/verdict-store.ts';
import { moveItem } from '../wall/wall-actions.ts';
import { type Room, screenToBoard } from './camera.ts';
import { type Bank, type DiscOnDesk, deskObjects, type Epilogue, screenRect } from './decor.ts';
import { insertServerDisc } from './drive.ts';

const noColor = () => '#000000';

/**
 * Щелчок по предмету на столе (вид «Стол» в покое): монитор — компьютер следователя крупно;
 * изъятое устройство — «взять в руки» (OPEN-A: тот же просмотр, что у карточки на стене).
 * У устройств — бирка «Изъято» с номером описи. Остальное (лампа, телефон, коробка) — пока
 * только вид; звонки — этап 6.
 */
/** Цель щелчка не тоньше MIN_HIT px: ручка 49 на столе была 105×16 — мала для тачпада (R5-14). */
const MIN_HIT = 28;
function grow(r: { left: number; top: number; width: number; height: number }) {
  const h = Math.max(r.height, MIN_HIT);
  const w = Math.max(r.width, MIN_HIT);
  return { left: r.left - (w - r.width) / 2, top: r.top - (h - r.height) / 2, width: w, height: h };
}

export function DeskHotspots({
  room,
  inbox,
  opened,
  epilogue = 'none',
  disc = 'none',
  bank = 'none',
}: {
  room: Room;
  inbox: string[];
  opened: readonly ContainerId[];
  epilogue?: Epilogue;
  disc?: DiscOnDesk;
  bank?: Bank;
}) {
  const openViewer = useGame((g) => g.openViewer);
  const setComputerOpen = useGame((g) => g.setComputerOpen);
  const updateState = useGame((g) => g.updateState);
  const spots = useMemo(
    () =>
      deskObjects(room, noColor, inbox, opened, epilogue, disc, bank).map((o) => ({
        o,
        r: screenRect(o, room.poses.desk, room),
      })),
    [room, inbox, opened, epilogue, disc, bank],
  );
  // Дисковод под монитором (A-272): сюда отпускают диск.
  const driveAt = spots.find((x) => x.o.key === 'drive')?.r;
  return (
    <div className="desk-hotspots">
      {spots.map(({ o, r }) =>
        o.hotspot ? (
          <button
            key={o.key}
            type="button"
            className={`desk-spot${o.fresh ? ' desk-spot-fresh' : ''}`}
            data-testid={o.hotspot.kind === 'computer' && !o.testId ? 'computer-monitor' : o.testId}
            aria-label={o.label}
            title={o.label}
            style={grow(r)}
            onPointerDown={(e) => {
              const h = o.hotspot;
              // Вынутый диск (A-272, DD-A): зажать и дотащить до дисковода под монитором — он
              // вставится сам; щелчок без сдвига — диск в руки (прочитать надпись).
              if (h?.kind === 'disc' && disc === 'out') {
                e.preventDefault();
                const overDrive = (pt: { x: number; y: number }) =>
                  !!driveAt &&
                  pt.x >= driveAt.left &&
                  pt.x <= driveAt.left + driveAt.width &&
                  pt.y >= driveAt.top - 30 &&
                  pt.y <= driveAt.top + driveAt.height + 20;
                startGhostDrag(e.nativeEvent, {
                  label: 'Диск «Прил. 7»',
                  className: 'drag-ghost-disc',
                  canDrop: overDrive,
                  onDrop: () => void insertServerDisc(),
                  onClick: () => useGame.getState().hold({ type: 'device', id: SERVER_DISC_ID }),
                });
                return;
              }
              // Лист из «Входящих» можно утащить прямо на доску (правка автора 09.11).
              if (h?.kind !== 'material' || !o.key.startsWith('inbox-')) return;
              e.preventDefault();
              const id = h.id;
              startGhostDrag(e.nativeEvent, {
                label: id,
                className: 'drag-ghost-paper',
                canDrop: (pt) => {
                  const f = folderFieldAt(pt.x, pt.y) && verdictActive();
                  useCardDrop.getState().setOver(f);
                  if (f) return true;
                  return screenToBoard(pt, room.poses.desk, room) !== null;
                },
                onEnd: () => useCardDrop.getState().setOver(false),
                onDrop: (pt) => {
                  // В поле открытой формы заключения — карточка «лист целиком» (K-A); лист
                  // остаётся в лотке.
                  const m = useGame.getState().materials.find((mm) => mm.id === id);
                  if (folderFieldAt(pt.x, pt.y) && verdictActive() && m) {
                    toVerdict(wholeCard(m));
                    return;
                  }
                  const b = screenToBoard(pt, room.poses.desk, room);
                  const st = useGame.getState().state;
                  const cam = st ? shownCamera(st) : null;
                  if (!b || !cam) return;
                  const w = screenToWorld(b, cam);
                  updateState(moveItem(id, w.x - CARD_W / 2, w.y - 20));
                },
                onClick: () => openViewer(id),
              });
            }}
            onClick={(e) => {
              const h = o.hotspot;
              // Лист мышью открывает перетаскивание (щелчок без сдвига — там же); здесь —
              // только клавиатура.
              if (o.key.startsWith('inbox-') && e.detail > 0) return;
              if (h?.kind === 'computer') setComputerOpen(true);
              else if (h?.kind === 'deskphone') useGame.getState().setDeskPhone(r);
              else if (h?.kind === 'disc') {
                // Вынутый диск мышью — перетаскивание (щелчок без сдвига — там же); здесь —
                // клавиатура.
                if (!(disc === 'out' && e.detail > 0))
                  useGame.getState().hold({ type: 'device', id: SERVER_DISC_ID });
              } else if (h?.kind === 'container')
                useGame.getState().hold({ type: 'container', id: h.id });
              else if (h) {
                // Эпилог открыт — подсветка снята.
                if (o.key === 'epilogue') markEpilogueRead();
                openViewer(h.id);
              }
            }}
          >
            {o.tag && (
              <span
                className={`device-tag${o.tagInside ? ' device-tag-inside' : ''}${o.tagLine ? ' device-tag-line' : ''}`}
              >
                {o.tag}
              </span>
            )}
          </button>
        ) : o.tag ? (
          <div
            key={o.key}
            className="desk-label"
            data-testid={o.testId}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
          >
            <span className="device-tag">{o.tag}</span>
          </div>
        ) : null,
      )}
    </div>
  );
}
