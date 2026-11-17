import { answerLabel, MARK_LABEL } from '@bunker/shared';
import { useMemo } from 'react';
import { useGame } from '../store.ts';
import { formQuestions, useVerdict, useVerdictResult } from './verdict-store.ts';

/**
 * Ответ бюро на заключение (A-270; автор 17.11): сразу после «Отправить в бюро» — по каждому
 * вопросу «подтверждается / не подтверждается» и итог по частям. «Дальше» — стол, на нём
 * конверт с эпилогом. Оформление — на этапе дизайна.
 */
export function VerdictResult() {
  const show = useVerdict((v) => v.showResult);
  const result = useVerdictResult();
  const l999 = useGame((g) => g.materials.find((m) => m.id === 'L999')?.body ?? '');
  // biome-ignore lint/correctness/useExhaustiveDependencies: вопросы — из текста L999
  const questions = useMemo(formQuestions, [l999]);
  if (!show || !result) return null;
  const solvedAll = result.groups.every((g) => g.solved);
  return (
    <div className="solve-backdrop">
      <div
        className="solve-dialog verdict-result"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verdict-result-title"
        data-testid="verdict-result"
      >
        <p className="verdict-result-from">Окружное бюро расследований · дело № 09-1128</p>
        <h2 id="verdict-result-title">Ответ бюро на заключение</h2>
        <ol className="verdict-result-list">
          {questions.map((q, i) => {
            const mark = result.marks[i] ?? 'пусто';
            return (
              <li key={q.n} className={`verdict-mark-${mark === 'верно' ? 'ok' : 'no'}`}>
                <span className="verdict-review-q">{q.text}</span>
                <span>
                  {result.answers[i] ? (
                    <b>{answerLabel(q, result.answers[i] ?? null)}</b>
                  ) : (
                    <b>ответа нет</b>
                  )}
                  {result.answers[i] ? ` — ${MARK_LABEL[mark]}` : ''}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="verdict-result-total" data-testid="verdict-result-total">
          {result.groups.map((g) => (
            <p key={g.id}>
              {g.title}: <b>{g.solved ? 'раскрыто' : 'не раскрыто'}</b>
            </p>
          ))}
          {solvedAll && <p className="verdict-result-closed">Дело № 09-1128 раскрыто.</p>}
        </div>
        <div className="solve-actions">
          <button
            type="button"
            className="solve-go"
            data-testid="verdict-result-next"
            onClick={() => useVerdict.getState().finish()}
          >
            Дальше
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Эпилог пришёл и ещё не открыт (автор 17.11: «боюсь, что игрок пропустит»): на столе —
 * подсвеченный конверт и записка, пока его не откроют.
 */
export function EpilogueNote() {
  const has = useGame((g) => g.materials.some((m) => m.id === 'L997'));
  const read = useGame((g) => g.state?.verdict?.epilogueRead === true);
  const atDesk = useGame((g) => g.state?.view === 'desk' && !g.viewerId);
  const result = useVerdict((v) => v.showResult);
  if (!has || read || !atDesk || result) return null;
  return (
    <div className="epilogue-note" data-testid="epilogue-note" role="status">
      На столе — конверт от бюро: эпилог дела. Откройте его.
    </div>
  );
}
