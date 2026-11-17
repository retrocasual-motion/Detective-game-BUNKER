/**
 * Оценка заключения (A-270; FM-A): пять вопросов формы L999 — человек, материал или вариант.
 * Своего текста нет, поэтому оценка точная: ответ либо совпадает с рубрикой, либо нет.
 * Рубрика (`gm/verdict.json` пакета) — только на сервере (P-10).
 */

export type VerdictKind = 'person' | 'material' | 'choice';

export interface VerdictQuestion {
  kind: VerdictKind;
  /** Верные ответы: id человека, номер материала или номер варианта (с нуля). */
  correct: (string | number)[];
  /** У вопроса «кто» можно ответить «никто». */
  nobody?: boolean;
  /** Сколько вариантов у вопроса с выбором. */
  options?: number;
}

export interface VerdictRubric {
  questions: VerdictQuestion[];
  /** Итог по частям: «гибель Адама» (1–3), «программа» (4–5). */
  groups: { id: string; title: string; questions: number[] }[];
}

/** Ответ на вопрос: человек (id или «nobody»), материал (номер) или вариант; null — пусто. */
export type VerdictAnswer = { person: string } | { material: string } | { choice: number } | null;

export type VerdictMark = 'верно' | 'неверно' | 'пусто';

export interface VerdictScore {
  marks: VerdictMark[];
  groups: { id: string; title: string; solved: boolean }[];
}

export const NOBODY = 'nobody';

/** Подходит ли ответ к виду вопроса (иначе сервер его не примет). */
export function answerFits(q: VerdictQuestion, a: VerdictAnswer): boolean {
  if (a === null) return true;
  if (q.kind === 'person') return 'person' in a && (a.person !== NOBODY || q.nobody === true);
  if (q.kind === 'material') return 'material' in a;
  return 'choice' in a && a.choice >= 0 && a.choice < (q.options ?? 0);
}

const answerValue = (a: Exclude<VerdictAnswer, null>): string | number =>
  'person' in a ? a.person : 'material' in a ? a.material : a.choice;

export function scoreVerdict(r: VerdictRubric, answers: readonly VerdictAnswer[]): VerdictScore {
  const marks = r.questions.map((q, i): VerdictMark => {
    const a = answers[i] ?? null;
    if (a === null) return 'пусто';
    return answerFits(q, a) && q.correct.includes(answerValue(a)) ? 'верно' : 'неверно';
  });
  return {
    marks,
    groups: r.groups.map((g) => ({
      id: g.id,
      title: g.title,
      solved: g.questions.every((i) => marks[i] === 'верно'),
    })),
  };
}
