import { useMemo } from 'react';
import { useGame } from '../store.ts';
import type { Room } from './camera.ts';
import { deskObjects, screenRect } from './decor.ts';

const noColor = () => '#000000';

/**
 * Щелчок по предмету на столе (вид «Стол» в покое): монитор — компьютер следователя крупно;
 * изъятое устройство — «взять в руки» (OPEN-A: тот же просмотр, что у карточки на стене).
 * У устройств — бирка «Изъято» с номером описи. Остальное (лампа, телефон, коробка) — пока
 * только вид; звонки — этап 6.
 */
export function DeskHotspots({ room }: { room: Room }) {
  const openViewer = useGame((g) => g.openViewer);
  const setComputerOpen = useGame((g) => g.setComputerOpen);
  const spots = useMemo(
    () => deskObjects(room, noColor).map((o) => ({ o, r: screenRect(o, room.poses.desk, room) })),
    [room],
  );
  return (
    <div className="desk-hotspots">
      {spots.map(({ o, r }) =>
        o.hotspot ? (
          <button
            key={o.key}
            type="button"
            className="desk-spot"
            data-testid={o.hotspot.kind === 'computer' ? 'computer-monitor' : `device-${o.tag}`}
            aria-label={o.label}
            title={o.label}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            onClick={() => {
              const h = o.hotspot;
              if (h?.kind === 'computer') setComputerOpen(true);
              else if (h) openViewer(h.id);
            }}
          >
            {o.tag && <span className="device-tag">Изъято · {o.tag}</span>}
          </button>
        ) : null,
      )}
    </div>
  );
}
