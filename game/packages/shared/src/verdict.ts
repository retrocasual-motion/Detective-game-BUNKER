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

/** Как бюро отвечает по вопросу (BA-A): «подтверждается / не подтверждается». */
export const MARK_LABEL: Record<VerdictMark, string> = {
  верно: 'подтверждается',
  неверно: 'не подтверждается',
  пусто: 'ответа нет',
};

/** Итог заключения: ответы, пометки по вопросам и части — «гибель Адама», «программа». */
export interface VerdictResult {
  answers: VerdictAnswer[];
  marks: VerdictMark[];
  groups: { id: string; title: string; solved: boolean }[];
}

/** Эпилог (Ф-3): приходит конвертом на стол после заключения; текст — автора (A6-D). */
export const EPILOGUE_ID = 'L997';
