import type { Card } from './schemas.ts';

/**
 * Письмо-ответ на запрос (этап 3): тело собирает сервер, а «Повторить запрос»
 * (RP-A, решение автора 09.11) читает из него адрес и копию запроса. Формат — здесь,
 * в одном месте для обеих сторон.
 */
export interface LetterParts {
  n: number;
  to: string;
  reply: string;
  /** Вложения: «L452 — Экспорт ящика»… */
  attached: string[];
  ask: Card;
  basis: Card;
}

const FILE = String.raw`\d{2}|L\d{3}|M\d{3}`;

export function letterBody({ n, to, reply, attached, ask, basis }: LetterParts): string {
  return [
    `# Ответ на запрос № ${n}`,
    '',
    `**От:** ${to}`,
    '**Кому:** вам',
    '',
    reply,
    '',
    ...(attached.length ? [`**Вложения:** ${attached.join('; ')}`, ''] : []),
    '---',
    '',
    `Ваш запрос № ${n}`,
    `Прошу: ${ask.file} — «${ask.quote}»`,
    `На основании: ${basis.file} — «${basis.quote}»`,
  ].join('\n');
}

/** Запрос, на который пришло письмо: адрес и обе карточки (null — это не письмо-ответ). */
export function letterPetition(body: string): { to: string; ask: Card; basis: Card } | null {
  const to = /^\*\*От:\*\* (\S+)$/m.exec(body)?.[1];
  const card = (head: string): Card | null => {
    const m = new RegExp(`^${head}: (${FILE}) — «(.+)»$`, 'm').exec(body);
    return m?.[1] && m[2] ? { file: m[1], quote: m[2] } : null;
  };
  const ask = card('Прошу');
  const basis = card('На основании');
  return to && ask && basis ? { to, ask, basis } : null;
}
