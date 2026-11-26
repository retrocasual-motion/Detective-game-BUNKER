import {
  answerLabel,
  type FormQuestion,
  NOBODY_ID,
  PERSONS,
  VERDICT_QUESTIONS,
  type VerdictAnswer,
} from '@bunker/shared';
import { useMemo } from 'react';
import { useGame } from '../store.ts';
import { formQuestions, REVIEW, useVerdict } from './verdict-store.ts';

const HINT_MATERIAL =
  'выделите строку в документе и нажмите «В заключение» или перетащите сюда лист со стены';

/** Ответ на вопрос о человеке: карточки людей дела (или перетащить карточку со стены). */
function PersonAnswer({ i, q, a }: { i: number; q: FormQuestion; a: VerdictAnswer }) {
  const answer = useVerdict((v) => v.answer);
  const chosen = a && 'person' in a ? a.person : null;
  const people = [...PERSONS.map((p) => ({ id: p.id, name: p.name }))];
  if (q.nobody) people.push({ id: NOBODY_ID, name: 'никто' });
  return (
    <div className="verdict-people" data-testid="verdict-people" data-petition-field="ask">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`verdict-person${chosen === p.id ? ' verdict-chosen' : ''}`}
          aria-pressed={chosen === p.id}
          data-testid={`verdict-person-${p.id}`}
          onClick={() => answer(i, chosen === p.id ? null : { person: p.id })}
        >
          {/* Карточка человека, как на стене: место фото и имя (автор 17.11). */}
          {p.id !== NOBODY_ID && <span className="verdict-person-photo" aria-hidden />}
          <span className="verdict-person-name">{p.name}</span>
        </button>
      ))}
    </div>
  );
}

/** Ответ на вопрос о материале: одна карточка — как поле «Прошу» в запросе (K-A). */
function MaterialAnswer({ i, a }: { i: number; a: VerdictAnswer }) {
  const answer = useVerdict((v) => v.answer);
  const droppable = useGame((g) => g.folderOpen);
  const card = a && 'card' in a ? a.card : null;
  return (
    <div
      className={`petition-field petition-field-active${droppable ? ' petition-field-droppable' : ''}`}
      data-petition-field="ask"
      data-testid="verdict-material"
    >
      <div className="petition-line">
        {card ? (
          <span className="petition-card" data-testid="verdict-card">
            <span className="petition-card-file">{card.file}</span>
            <span className="petition-card-quote">«{card.quote}»</span>
          </span>
        ) : (
          <span className="petition-blank">{HINT_MATERIAL}</span>
        )}
      </div>
      {card && (
        <button
          type="button"
          className="petition-clear"
          aria-label="Убрать карточку"
          data-testid="verdict-clear"
          onClick={() => answer(i, null)}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function ChoiceAnswer({ i, q, a }: { i: number; q: FormQuestion; a: VerdictAnswer }) {
  const answer = useVerdict((v) => v.answer);
  const chosen = a && 'choice' in a ? a.choice : null;
  return (
    <div className="verdict-options">
      {q.options.map((o, k) => (
        <button
          key={o}
          type="button"
          aria-pressed={chosen === k}
          className={`verdict-option${chosen === k ? ' verdict-chosen' : ''}`}
          data-testid={`verdict-option-${k}`}
          onClick={() => answer(i, { choice: k })}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Что сделать, чтобы ответить (без ответа «Далее» не нажимается). */
const NEED_ANSWER: Record<FormQuestion['kind'], string> = {
  person: 'Выберите человека, чтобы перейти дальше.',
  material: 'Приложите материал дела, чтобы перейти дальше.',
  choice: 'Выберите вариант, чтобы перейти дальше.',
};

function Question({ i, q, a }: { i: number; q: FormQuestion; a: VerdictAnswer }) {
  const go = useVerdict((v) => v.go);
  return (
    <>
      <p className="verdict-count">
        Вопрос {i + 1} из {VERDICT_QUESTIONS}
      </p>
      <h3 className="verdict-question" data-testid="verdict-question">
        {q.text}
      </h3>
      {q.kind === 'person' && <PersonAnswer i={i} q={q} a={a} />}
      {q.kind === 'material' && <MaterialAnswer i={i} a={a} />}
      {q.kind === 'choice' && <ChoiceAnswer i={i} q={q} a={a} />}
      <div className="petition-actions">
        {i > 0 && (
          <button
            type="button"
            className="petition-discard"
            data-testid="verdict-prev"
            onClick={() => go(i - 1)}
          >
            Назад
          </button>
        )}
        {/* Без ответа дальше нельзя (VER-A, правка автора 26.11): сразу на вопросе, а не в конце. */}
        <button
          type="button"
          className="petition-send"
          data-testid="verdict-next"
          disabled={!a}
          onClick={() => go(i + 1)}
        >
          {i === VERDICT_QUESTIONS - 1 ? 'Проверить заключение' : 'Далее'}
        </button>
      </div>
      {!a && (
        <p className="verdict-missing" data-testid="verdict-need-answer" role="status">
          {NEED_ANSWER[q.kind]}
        </p>
      )}
    </>
  );
}

/** «Не заполнены вопросы 3 и 5» (VER-A). */
export function missingText(missing: number[]): string {
  const list =
    missing.length === 1
      ? `вопрос ${missing[0]}`
      : `вопросы ${missing.slice(0, -1).join(', ')} и ${missing[missing.length - 1]}`;
  return `Не заполнен${missing.length === 1 ? '' : 'ы'} ${list}: заключение без ответа не принимается.`;
}

/** Ответы списком: «Проверьте заключение» (можно исправить) и отправленное (только читать). */
function Answers({
  questions,
  answers,
  edit,
}: {
  questions: FormQuestion[];
  answers: VerdictAnswer[];
  edit?: (i: number) => void;
}) {
  return (
    <ol className="verdict-review" data-testid="verdict-review">
      {questions.map((q, i) => (
        <li key={q.n}>
          <span className="verdict-review-q">{q.text}</span>
          <span className="verdict-review-a" data-testid={`verdict-answer-${i}`}>
            {answers[i] ? answerLabel(q, answers[i] ?? null) : 'ответа нет'}
          </span>
          {edit && (
            <button
              type="button"
              className="verdict-edit"
              data-testid={`verdict-edit-${i}`}
              onClick={() => edit(i)}
            >
              Изменить
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Папка заключения (A-270; FM-A, RT-B): после «Решить дело» → «Продолжить» встаёт на место папки
 * запроса. Вопросы по одному: человек — карточкой, материал — карточкой (выделить строку →
 * «В заключение» или перетащить лист со стены), «как» — выбором. В конце — «Проверьте
 * заключение»: любой ответ можно исправить до «Отправить в бюро». Ответ бюро — письмом (BA-A).
 */
export function VerdictCorner() {
  const status = useVerdict((v) => v.status);
  const open = useVerdict((v) => v.open);
  const error = useVerdict((v) => v.error);
  const sending = useVerdict((v) => v.sending);
  const stamped = useVerdict((v) => v.stamped);
  const { toggle, close, go, send, openResult } = useVerdict.getState();
  const l999 = useGame((g) => g.materials.find((m) => m.id === 'L999')?.body ?? '');
  // biome-ignore lint/correctness/useExhaustiveDependencies: вопросы — из текста L999
  const questions = useMemo(formQuestions, [l999]);
  const d = useGame((g) => g.state?.verdict) ?? { answers: [], step: 0 };
  const answers = Array.from({ length: VERDICT_QUESTIONS }, (_, k) => d.answers[k] ?? null);
  // Пустые ответы не принимаются (VER-A): какие вопросы не заполнены — номерами.
  const missing = answers.flatMap((a, k) => (a ? [] : [k + 1]));
  if (!status.form && !status.sent) return null;
  const step = Math.min(d.step, REVIEW);
  const q = questions[step];
  return (
    <div className={`petition verdict${open ? ' petition-open' : ''}`}>
      <div className="petition-stack">
        <div className="folder folder-front" style={{ ['--depth' as string]: 0, zIndex: 20 }}>
          <button
            type="button"
            className={`folder-tab${open ? ' folder-tab-active' : ''}`}
            data-testid="verdict-corner"
            aria-expanded={open}
            onClick={toggle}
          >
            Заключение
          </button>
          <section
            className="petition-folder verdict-folder"
            data-testid="verdict-folder"
            aria-label="Форма заключения"
            inert={!open}
          >
            <button
              type="button"
              className="tool tool-close petition-close"
              aria-label="Закрыть"
              title="Закрыть папку (ответы сохранятся)"
              onClick={close}
            >
              ✕
            </button>
            <header className="petition-head">
              <span className="petition-head-title">Заключение специалиста</span>
              <span className="petition-head-case">дело № 09-1128</span>
            </header>
            {status.sent ? (
              <>
                <Answers questions={questions} answers={answers} />
                {stamped ? (
                  <div className="petition-stamp verdict-stamp" data-testid="verdict-stamp">
                    Отправлено
                  </div>
                ) : (
                  <div className="petition-actions">
                    <button
                      type="button"
                      className="petition-send"
                      data-testid="verdict-open-result"
                      onClick={openResult}
                    >
                      Ответ бюро
                    </button>
                  </div>
                )}
              </>
            ) : step === REVIEW || !q ? (
              <>
                <h3 className="verdict-question">Проверьте заключение</h3>
                <Answers questions={questions} answers={answers} edit={go} />
                {missing.length > 0 ? (
                  <p className="verdict-missing" data-testid="verdict-missing" role="status">
                    {missingText(missing)}
                  </p>
                ) : (
                  <p className="verdict-note">После отправки изменить ответы нельзя.</p>
                )}
                {error && (
                  <p className="petition-error" data-testid="verdict-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="petition-actions">
                  <button type="button" className="petition-discard" onClick={() => go(REVIEW - 1)}>
                    Назад
                  </button>
                </div>
                {/* Отправка — не на месте «Далее» и другим видом: подпись и штамп (VER-A, RV-39). */}
                <button
                  type="button"
                  className="verdict-sign"
                  data-testid="verdict-send"
                  disabled={sending || missing.length > 0}
                  onClick={() => void send()}
                >
                  Подписать и отправить в бюро
                </button>
              </>
            ) : (
              <Question i={step} q={q} a={answers[step] ?? null} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
