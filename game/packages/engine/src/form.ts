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
 * Общие отказы адресатов (карточки не подошли ни к одному правилу по существу): ответ виден
 * сразу в папке, без письма, но попытка засчитана (PRE-B, решение автора 09.11). Частные
 * адреса и Pinecell по-прежнему отвечают письмом.
 */
export const GENERAL_REFUSAL_IDS: ReadonlySet<string> = new Set([
  'pet-bureau-fail',
  'pet-vl-fail',
  'pet-hx-fail',
  'pet-mailbridge-fail',
  'pet-bank-fail',
]);

/**
 * Ошибка оформления запроса (текст для папки) или null — можно отправлять. Только
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
  return FORM_RULE_IDS.has(r.hit.id) ? (r.hit.ok ?? r.hit.fail ?? 'Запрос не оформлен.') : null;
}
