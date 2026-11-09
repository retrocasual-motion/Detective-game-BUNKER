import { useEffect } from 'react';
import { useGame } from '../store.ts';

/** Сколько висит записка «Поступило». */
const ARRIVAL_MS = 10000;

/**
 * Записка о поступлении: новое легло во «Входящие» на столе (правка автора 09.11). Видна,
 * пока игрок у стены; щелчок — к столу, где письмо стоит в лотке. За столом записка не нужна:
 * лоток виден сам. Подсветки на самих материалах нет (P-1).
 */
export function ArrivalNote() {
  const arrival = useGame((g) => g.arrival);
  const atWall = useGame((g) => g.state?.view === 'wall');
  const dismiss = useGame((g) => g.dismissArrival);
  const setView = useGame((g) => g.setView);

  useEffect(() => {
    if (!arrival) return;
    const t = setTimeout(dismiss, ARRIVAL_MS);
    return () => clearTimeout(t);
  }, [arrival, dismiss]);

  if (!arrival || !atWall) return null;

  return (
    <button
      type="button"
      className="arrival-note"
      data-testid="arrival-note"
      onClick={() => {
        setView('desk');
        dismiss();
      }}
    >
      Поступило во «Входящие» на столе: {arrival.ids.join(', ')}
    </button>
  );
}
