import { EvidenceShelf } from './EvidenceShelf.tsx';
import { InvestigatorComputer } from './InvestigatorComputer.tsx';

/**
 * Вид «Слева» (TECH_PLAN 4.0, LEFT-B): стол вещдоков. На нём монитор компьютера следователя и
 * изъятые устройства с бирками. Серые заглушки: включение, замки и содержимое — этап 4.
 */
export function LeftView() {
  return (
    <div className="left-view" data-testid="view-left">
      <div className="evidence-table" aria-hidden />
      <InvestigatorComputer />
      <EvidenceShelf />
    </div>
  );
}
