import { norm } from './searchCase.ts';

const NAME = 'case-find';

/**
 * Лист открыт из поиска: все совпадения в нём подсвечены (CSS Custom Highlight — разметку
 * листа не трогаем). Возвращает k-е совпадение (или первое) — лист откроется на его странице.
 *
 * Пробелы не в счёт, и совпадение может идти через несколько узлов текста: выписка со строки
 * журнала сервера (ячейки таблицы) или через перенос строки — тоже находится (7.4, автор 21.11).
 */
export function highlightFind(paper: Element, query: string, k: number, name = NAME): Range | null {
  const q = norm(query).replace(/\s+/g, '');
  const ranges: Range[] = [];
  if (q) {
    // Текст листа без пробелов и, для каждой буквы, её узел и место в нём.
    let flat = '';
    const at: { node: Text; i: number }[] = [];
    const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = norm(n.textContent ?? '');
      for (let i = 0; i < text.length; i++) {
        const ch = text[i] ?? '';
        if (/\s/.test(ch)) continue;
        flat += ch;
        at.push({ node: n as Text, i });
      }
    }
    for (let i = flat.indexOf(q); i >= 0; i = flat.indexOf(q, i + q.length)) {
      const a = at[i];
      const b = at[i + q.length - 1];
      if (!a || !b) continue;
      const r = document.createRange();
      r.setStart(a.node, a.i);
      r.setEnd(b.node, b.i + 1);
      ranges.push(r);
    }
  }
  const target = ranges[k] ?? ranges[0] ?? null;
  if ('highlights' in CSS && typeof Highlight !== 'undefined') {
    if (ranges.length) CSS.highlights.set(name, new Highlight(...ranges));
    else CSS.highlights.delete(name);
  }
  return target;
}

export function clearFind(name = NAME) {
  if ('highlights' in CSS) CSS.highlights.delete(name);
}

/** Подсветка на экране устройства (RV-26): своя — закрытый лист её не гасит. */
export const SCREEN_FIND = 'screen-find';
