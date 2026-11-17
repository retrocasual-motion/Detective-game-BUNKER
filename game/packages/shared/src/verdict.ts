import { PERSONS } from './persons.ts';
import type { VerdictAnswer } from './schemas.ts';

/**
 * Форма заключения (L999, A-270): вопросы и варианты — из текста формы в пакете, чтобы текст
 * жил в одном месте. Что верно — знает только сервер (P-10).
 */
export interface FormQuestion {
  n: number;
  text: string;
  kind: 'person' | 'material' | 'choice';
  /** У «кто действовал» можно ответить «никто». */
  nobody: boolean;
  options: string[];
}

export const NOBODY_ID = 'nobody';

/** «1. Кто действовал…? (человек или «никто»)» и «   - вариант;» под вопросом. */
export function parseVerdictForm(body: string): FormQuestion[] {
  const out: FormQuestion[] = [];
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const q = /^(\d+)\.\s+(.+?)\s*\(([^)]*)\)\s*$/.exec(line);
    if (q) {
      const hint = q[3] ?? '';
      out.push({
        n: Number(q[1]),
        text: q[2] ?? '',
        kind: /человек/.test(hint) ? 'person' : /вариант/.test(hint) ? 'choice' : 'material',
        nobody: /никто/.test(hint),
        options: [],
      });
      continue;
    }
    const o = /^\s+-\s+(.+?)[;.]?\s*$/.exec(line);
    const last = out.at(-1);
    if (o && last?.kind === 'choice') last.options.push(o[1] ?? '');
  }
  return out;
}

/** Ответ словами — в «Проверьте заключение» и в письме бюро. */
export function answerLabel(q: FormQuestion | undefined, a: VerdictAnswer): string {
  if (a === null) return '—';
  if ('person' in a)
    return a.person === NOBODY_ID
      ? 'никто'
      : (PERSONS.find((p) => p.id === a.person)?.name ?? a.person);
  if ('card' in a) return `${a.card.file} — «${a.card.quote}»`;
  return q?.options[a.choice] ?? `вариант ${a.choice + 1}`;
}

export type VerdictMark = 'верно' | 'неверно' | 'пусто';

const MARK: Record<VerdictMark, string> = {
  верно: 'подтверждается',
  неверно: 'не подтверждается',
  пусто: 'ответа нет',
};

/** Ответ бюро на заключение (A-270; BA-A): по каждому вопросу и итог по частям. */
export function verdictLetterBody(p: {
  questions: FormQuestion[];
  answers: readonly VerdictAnswer[];
  marks: readonly VerdictMark[];
  groups: readonly { title: string; solved: boolean }[];
}): string {
  return [
    '# Ответ бюро на заключение специалиста',
    '',
    '**От:** Окружное бюро расследований округа Сильвер-Ридж',
    '**Кому:** вам',
    '',
    'Дело № 09-1128. Бюро рассмотрело ваше заключение.',
    '',
    ...p.questions.flatMap((q, i) => [
      `${q.n}. ${q.text}`,
      (p.answers[i] ?? null) === null
        ? 'Ответа нет.'
        : `Ваш ответ: ${answerLabel(q, p.answers[i] ?? null)} — ${MARK[p.marks[i] ?? 'пусто']}.`,
      '',
    ]),
    '---',
    '',
    ...p.groups.map((g) => `**${g.title}:** ${g.solved ? 'раскрыто' : 'не раскрыто'}.`),
  ].join('\n');
}
