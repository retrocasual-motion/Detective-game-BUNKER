import { EvidenceShelf } from './EvidenceShelf.tsx';
import { InvestigatorComputer } from './InvestigatorComputer.tsx';

/**
 * Вид «Слева» (TECH_PLAN 4.0; решение автора 08.11, PC-A): левое крыло углового стола — стол
 * вещдоков, сверху. Голова повёрнута влево: вверху экрана — дальний край крыла (у стены),
 * внизу — ближний к игроку. На крыле лежат изъятые устройства с бирками, в дальнем углу стоит
 * монитор компьютера следователя. Серые заглушки: включение, замки, содержимое — этап 4.
 */
export function LeftView() {
  return (
    <div className="left-view" data-testid="view-left">
      <InvestigatorComputer />
      <EvidenceShelf />
    </div>
  );
}
