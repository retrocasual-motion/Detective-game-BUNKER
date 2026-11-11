import {
  type Card,
  type Draft,
  type DraftField,
  MAX_DRAFTS,
  type Material,
  type PlayerState,
} from '@bunker/shared';

type Update = (s: PlayerState) => PlayerState;

export const emptyDraft = (id: string): Draft => ({ id, to: null, ask: null, basis: null });

export const isEmptyDraft = (d: Draft) => !d.to && !d.ask && !d.basis;

/** Новый черновик — не больше MAX_DRAFTS (уголков папки рядом). */
export const addDraft =
  (id: string): Update =>
  (s) =>
    s.drafts.length >= MAX_DRAFTS ? s : { ...s, drafts: [...s.drafts, emptyDraft(id)] };

export const removeDraft =
  (id: string): Update =>
  (s) => ({ ...s, drafts: s.drafts.filter((d) => d.id !== id) });

/** Убрать пустые черновики (закрыли папку, ничего не положив). */
export const dropEmptyDrafts: Update = (s) =>
  s.drafts.some(isEmptyDraft) ? { ...s, drafts: s.drafts.filter((d) => !isEmptyDraft(d)) } : s;

/** Положить в поле: адрес — в «Кому», карточку — в «Прошу» или «На основании» (новая заменяет). */
export const setField =
  (draftId: string, field: DraftField, value: string | Card | null): Update =>
  (s) => ({
    ...s,
    drafts: s.drafts.map((d) => (d.id === draftId ? { ...d, [field]: value } : d)),
  });

/**
 * Перетащить карточку между «Прошу» и «На основании» (правка автора 09.11): в пустое поле она
 * переходит, с занятым — карточки меняются местами.
 */
export const swapCards =
  (draftId: string, from: 'ask' | 'basis'): Update =>
  (s) => ({
    ...s,
    drafts: s.drafts.map((d) =>
      d.id === draftId && d[from] ? { ...d, ask: d.basis, basis: d.ask } : d,
    ),
  });

/** Пустые поля черновика — их подсвечивает папка при отправке (E-A). */
export const missingFields = (d: Draft): DraftField[] =>
  (['to', 'ask', 'basis'] as const).filter((f) => !d[f]);

/** Карточка «материал целиком» (из медиа, листа со стены, письма из лотка): цитата — название. */
export const wholeCard = (m: Pick<Material, 'id' | 'title'>): Card => ({
  file: m.id,
  quote: m.title,
});

/** Карточка из выделенной строки: переводы строк — пробел, длина — в пределах. */
export const quoteCard = (file: string, text: string): Card | null => {
  const quote = text.replace(/\s+/gu, ' ').trim().slice(0, 2000);
  return quote ? { file, quote } : null;
};

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

/** Первый адрес почты в тексте (выделение в «Кому»). */
export const emailIn = (text: string): string | null =>
  (text.match(EMAIL)?.[0] ?? null)?.toLowerCase().replace(/\.$/, '') ?? null;

/**
 * Адресная книга (4.7): каждый адрес почты из материалов, которые у игрока есть, попадает
 * в неё сам. Пометок «для официальных запросов» нет (A-249). Адрес с нелатинскими буквами —
 * образец формата («имя@mailbridge.net» на сайте почты), а не настоящий ящик: в книгу
 * не попадает (ADDR-A, 09.11).
 */
export function addressBook(materials: Pick<Material, 'body'>[]): string[] {
  const all = new Set<string>();
  for (const m of materials)
    for (const a of m.body.match(EMAIL) ?? [])
      if (/^[\x21-\x7e]+$/.test(a)) all.add(a.toLowerCase().replace(/\.$/, ''));
  return [...all].sort();
}

/**
 * «Повторить запрос» (RP-A, решение автора 09.11): новый черновик с тем же адресом и
 * карточками — в пустой черновик, если он есть, иначе новым (если есть место).
 * Возвращает id черновика или null, если все черновики заняты.
 */
export function repeatDraft(
  s: PlayerState,
  id: string,
  p: { to: string; ask: Card; basis: Card },
): { state: PlayerState; id: string } | null {
  const empty = s.drafts.find(isEmptyDraft);
  const target = empty?.id ?? id;
  const filled: Draft = { id: target, to: p.to, ask: p.ask, basis: p.basis };
  if (empty)
    return { state: { ...s, drafts: s.drafts.map((d) => (d === empty ? filled : d)) }, id: target };
  if (s.drafts.length >= MAX_DRAFTS) return null;
  return { state: { ...s, drafts: [...s.drafts, filled] }, id: target };
}
