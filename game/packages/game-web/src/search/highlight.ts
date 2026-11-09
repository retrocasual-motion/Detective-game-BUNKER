import { norm } from './searchCase.ts';

const NAME = 'case-find';

/**
 * Лист открыт из поиска: все совпадения в нём подсвечены (CSS Custom Highlight — разметку
 * листа не трогаем). Возвращает k-е совпадение (или первое) — лист откроется на его странице.
 */
export function highlightFind(paper: Element, query: string, k: number): Range | null {
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
  const target = ranges[k] ?? ranges[0] ?? null;
  if ('highlights' in CSS && typeof Highlight !== 'undefined') {
    if (ranges.length) CSS.highlights.set(NAME, new Highlight(...ranges));
    else CSS.highlights.delete(NAME);
  }
  return target;
}

export function clearFind() {
  if ('highlights' in CSS) CSS.highlights.delete(NAME);
}
