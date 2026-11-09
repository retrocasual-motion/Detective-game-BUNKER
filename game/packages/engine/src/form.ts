import { type Content, resolvePetition } from './engine.ts';
import type { Card, Progress } from './types.ts';

/**
 * Правила-отказы, которые в игре — ошибки оформления, а не ход расследования (E-A, FORM-B,
 * решение автора 09.11): несколько кодов в одной карточке, не указан номер программы,
 * ячейки. Их ловит сама папка: письмо не уходит, попытка не тратится.
 */
export const FORM_RULE_IDS: ReadonlySet<string> = new Set([
  'pet-bureau-multi-users',
  'pet-vl-multi-codes',
  'pet-vl-archive-a24-nocode',
  'pet-vl-archive-nocode',
  'pet-vl-registry-nocode',
  'pet-hx-archive-nocode',
  'pet-bank-kind-nonumber',
]);

/**
 * Ошибка оформления ходатайства (текст для папки) или null — можно отправлять. Только
 * чтение: прогресс не меняется. Лимит попыток проверяет `act` (итог «лимит»).
 */
export function petitionFormError(
  c: Content,
  progress: Progress,
  target: string,
  cards: [Card, Card],
): string | null {
  const r = resolvePetition(c, progress, target, cards);
  if (!r.hit) return r.result === 'не оформлено' ? r.reply : null;
  return FORM_RULE_IDS.has(r.hit.id)
    ? (r.hit.ok ?? r.hit.fail ?? 'Ходатайство не оформлено.')
    : null;
}
