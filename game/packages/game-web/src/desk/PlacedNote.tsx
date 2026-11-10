import { useEffect } from 'react';
import { useGame } from '../store.ts';

/** Сколько висит записка «На стене», мс. */
const PLACED_MS = 9000;

/**
 * Найденное руками ушло на стену (AW-B, правка автора 10.11): когда вещь отложили и лист закрыли —
 * записка «На стене: … · Показать»; на самой стене вещь светится, пока за стену не взялись.
 * Камера к стене сама не летит — только по «Показать».
 */
export function PlacedNote() {
  const placed = useGame((g) => g.placed);
  const busy = useGame((g) => g.held !== null || g.viewerId !== null);
  const dismiss = useGame((g) => g.dismissPlaced);

  useEffect(() => {
    if (!placed || busy) return;
    const t = setTimeout(dismiss, PLACED_MS);
    return () => clearTimeout(t);
  }, [placed, busy, dismiss]);

  if (!placed || busy) return null;
  return (
    <div className="arrival-note placed-note" data-testid="placed-note" role="status">
      На стене: {placed.text}
      <button
        type="button"
        className="placed-show"
        data-testid="placed-show"
        onClick={() => {
          const id = placed.ids[0];
          if (id) useGame.getState().revealOnWall(id);
          dismiss();
        }}
      >
        Показать
      </button>
    </div>
  );
}
