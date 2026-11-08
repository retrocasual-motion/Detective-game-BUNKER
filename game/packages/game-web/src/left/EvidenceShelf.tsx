import { useGame } from '../store.ts';

/**
 * Изъятые устройства на столе вещдоков (TECH_PLAN 4.0, 4.6; LEFT-B): предмет своего вида и
 * бирка «Изъято». Щелчок пока открывает описание; осмотр и «Включить» — этап 4.
 */
export function EvidenceShelf() {
  const materials = useGame((g) => g.materials);
  const openViewer = useGame((g) => g.openViewer);
  const evidence = materials.filter((m) => m.placement === 'evidence');
  return (
    <section className="evidence" aria-label="Изъятые устройства">
      {evidence.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`evidence-item device-${m.id}`}
          data-testid={`evidence-${m.id}`}
          onClick={() => openViewer(m.id)}
        >
          <span className="device" aria-hidden />
          <span className="evidence-tag">
            <span className="evidence-tag-id">Изъято · {m.id}</span>
            <span className="evidence-tag-title">{m.title}</span>
          </span>
        </button>
      ))}
    </section>
  );
}
