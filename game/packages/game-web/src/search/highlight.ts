import { norm } from './searchCase.ts';

const NAME = 'case-find';

/**
 * Лист открыт из поиска: все совпадения в нём подсвечены (CSS Custom Highlight — разметку
 * листа не трогаем), к k-му совпадению лист прокручен. Возвращает, сколько найдено.
 */
export function highlightFind(paper: Element, query: string, k: number): number {
  const q = norm(query.trim().replace(/\s+/g, ' '));
  const ranges: Range[] = [];
  if (q) {
    const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = norm(n.textContent ?? '');
      for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + q.length);
        ranges.push(r);
      }
    }
  }
  const target = ranges[k] ?? ranges[0];
  target?.startContainer.parentElement?.scrollIntoView({ block: 'center' });
  if ('highlights' in CSS && typeof Highlight !== 'undefined') {
    if (ranges.length) CSS.highlights.set(NAME, new Highlight(...ranges));
    else CSS.highlights.delete(NAME);
  }
  return ranges.length;
}

export function clearFind() {
  if ('highlights' in CSS) CSS.highlights.delete(NAME);
}
