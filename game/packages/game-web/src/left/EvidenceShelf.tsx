import { useGame } from '../store.ts';

/** Изъятые устройства с бирками (TECH_PLAN 4.0, 4.6). Серый прототип: бирка — номер и название. */
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
          className="evidence-item"
          data-testid={`evidence-${m.id}`}
          onClick={() => openViewer(m.id)}
        >
          <span className="evidence-tag">Изъято · {m.id}</span>
          <span className="card-title">{m.title}</span>
        </button>
      ))}
    </section>
  );
}
