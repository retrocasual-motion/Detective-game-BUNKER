import { CARD_W, type ContainerId } from '@bunker/shared';
import { useMemo } from 'react';
import { startGhostDrag } from '../canvas/ghostDrag.ts';
import { screenToWorld } from '../canvas/math.ts';
import { wholeCard } from '../petition/drafts.ts';
import { petitionFieldAt } from '../petition/fieldAt.ts';
import { usePetition } from '../petition/petition-store.ts';
import { shownCamera, useGame } from '../store.ts';
import { markEpilogueRead } from '../verdict/verdict-store.ts';
import { isLetter, moveItem } from '../wall/wall-actions.ts';
import { type Room, screenToBoard } from './camera.ts';
import { deskObjects, type Epilogue, screenRect } from './decor.ts';

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
  trash,
  opened,
  epilogue = 'none',
}: {
  room: Room;
  inbox: string[];
  trash: number;
  opened: readonly ContainerId[];
  epilogue?: Epilogue;
}) {
  const openViewer = useGame((g) => g.openViewer);
  const setComputerOpen = useGame((g) => g.setComputerOpen);
  const updateState = useGame((g) => g.updateState);
  const spots = useMemo(
    () =>
      deskObjects(room, noColor, inbox, trash, opened, epilogue).map((o) => ({
        o,
        r: screenRect(o, room.poses.desk, room),
      })),
    [room, inbox, trash, opened, epilogue],
  );
  // Письмо-ответ из лотка можно бросить прямо в корзину (TR-A).
  const bin = spots.find((s) => s.o.key === 'trash')?.r;
  const overBin = (pt: { x: number; y: number }) =>
    !!bin &&
    pt.x >= bin.left &&
    pt.x <= bin.left + bin.width &&
    pt.y >= bin.top &&
    pt.y <= bin.top + bin.height;
  return (
    <div className="desk-hotspots">
      {spots.map(({ o, r }) =>
        o.hotspot ? (
          <button
            key={o.key}
            type="button"
            className={`desk-spot${o.fresh ? ' desk-spot-fresh' : ''}`}
            data-testid={o.hotspot.kind === 'computer' ? 'computer-monitor' : o.testId}
            aria-label={o.label}
            title={o.label}
            style={grow(r)}
            onPointerDown={(e) => {
              const h = o.hotspot;
              // Письмо из «Входящих» можно утащить прямо на доску (правка автора 09.11).
              if (h?.kind !== 'material' || !o.key.startsWith('inbox-')) return;
              e.preventDefault();
              const id = h.id;
              startGhostDrag(e.nativeEvent, {
                label: id,
                className: 'drag-ghost-paper',
                canDrop: (pt) => {
                  const f = petitionFieldAt(pt.x, pt.y);
                  usePetition
                    .getState()
                    .setDrag(useGame.getState().petitionOpen, f === 'to' ? null : f);
                  if (f) return f !== 'to';
                  if (overBin(pt)) return isLetter(id);
                  return screenToBoard(pt, room.poses.desk, room) !== null;
                },
                onEnd: () => usePetition.getState().setDrag(false, null),
                onDrop: (pt) => {
                  // В поле открытой папки — карточка «письмо целиком» (K-A); письмо остаётся в лотке.
                  const f = petitionFieldAt(pt.x, pt.y);
                  const m = useGame.getState().materials.find((mm) => mm.id === id);
                  if (f && m) {
                    usePetition.getState().setActiveField(f);
                    usePetition.getState().addCard(wholeCard(m));
                    return;
                  }
                  if (overBin(pt)) {
                    if (isLetter(id)) useGame.getState().throwAway(id);
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
              // Письмо мышью открывает перетаскивание (щелчок без сдвига — там же); здесь —
              // только клавиатура.
              if (o.key.startsWith('inbox-') && e.detail > 0) return;
              if (h?.kind === 'computer') setComputerOpen(true);
              else if (h?.kind === 'trash') useGame.getState().setTrashOpen(true);
              else if (h?.kind === 'container')
                useGame.getState().hold({ type: 'container', id: h.id });
              else if (h) {
                // Эпилог открыт — подсветка снята.
                if (o.key === 'epilogue') markEpilogueRead();
                openViewer(h.id);
              }
            }}
          >
            {o.tag && (
              <span className={`device-tag${o.tagInside ? ' device-tag-inside' : ''}`}>
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
