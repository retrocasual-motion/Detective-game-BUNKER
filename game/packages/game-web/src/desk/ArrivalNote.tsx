import { wallColumns, wallLayout } from '@bunker/shared';
import { useEffect } from 'react';
import { useGame } from '../store.ts';

/** Сколько висит записка «Поступило». */
const ARRIVAL_MS = 10000;

/**
 * Записка о поступлении (IN-B): новые материалы уже висят на стене новой колонкой.
 * Щелчок — к стене, камера показывает эту колонку. Подсветки на самих листах нет (P-1).
 */
export function ArrivalNote() {
  const arrival = useGame((g) => g.arrival);
  const dismiss = useGame((g) => g.dismissArrival);

  useEffect(() => {
    if (!arrival) return;
    const t = setTimeout(dismiss, ARRIVAL_MS);
    return () => clearTimeout(t);
  }, [arrival, dismiss]);

  if (!arrival) return null;

  const show = () => {
    const g = useGame.getState();
    const s = g.state;
    if (!s) return;
    const layout = wallLayout(wallColumns(g.materials, s.wall.arrivals));
    const col = layout.columns.find((c) => c.ids.includes(arrival.ids[0] ?? ''));
    g.updateState((st) => {
      if (!col) return { ...st, view: 'wall' };
      const zoom = st.wall.camera.zoom;
      const camera = {
        zoom,
        x: Math.round(window.innerWidth / 2 - (col.x + 80) * zoom),
        y: Math.round(window.innerHeight * 0.18 - col.y * zoom),
      };
      return { ...st, view: 'wall', wall: { ...st.wall, camera } };
    });
    dismiss();
  };

  return (
    <button type="button" className="arrival-note" data-testid="arrival-note" onClick={show}>
      Поступило на стену: {arrival.ids.join(', ')}
    </button>
  );
}
