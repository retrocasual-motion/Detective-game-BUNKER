import { EvidenceShelf } from './EvidenceShelf.tsx';
import { InvestigatorComputer } from './InvestigatorComputer.tsx';

/** Вид «Слева»: компьютер следователя и стол вещдоков (TECH_PLAN 4.0). */
export function LeftView() {
  return (
    <div className="left-view" data-testid="view-left">
      <InvestigatorComputer />
      <EvidenceShelf />
    </div>
  );
}
