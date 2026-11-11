/**
 * Страницы блокнота (правка автора 11.11): блокнот листают, как настоящий, — на странице столько
 * строк, сколько видно, дальше — следующая страница. Сохраняется в состоянии игрока
 * (`notebookPages`); прежний сплошной текст (`notebook`) — первой страницей.
 */

/** Строк на странице — одинаково на любом экране, чтобы запись не переезжала. */
export const PAGE_LINES = 15;
/** Высота строки, px (линейка страницы). */
export const LINE_PX = 30;

export function pagesOf(s: { notebook?: string; notebookPages?: string[] } | null): string[] {
  if (s?.notebookPages?.length) return s.notebookPages;
  return [s?.notebook ?? ''];
}

/** Страницы с новой записью на странице i (новая страница — в конец). */
export function withPage(pages: readonly string[], i: number, text: string): string[] {
  const out = [...pages];
  while (out.length <= i) out.push('');
  out[i] = text;
  // Пустые страницы в конце не копятся: остаётся одна чистая, если на неё перелистнули.
  while (
    out.length > 1 &&
    out[out.length - 1] === '' &&
    out[out.length - 2] === '' &&
    out.length - 1 > i
  )
    out.pop();
  return out;
}

/** Можно ли листать вперёд: дальше есть страница или эта не пустая (тогда откроется чистая). */
export const canNext = (pages: readonly string[], i: number) =>
  i < pages.length - 1 || (pages[i] ?? '') !== '';
