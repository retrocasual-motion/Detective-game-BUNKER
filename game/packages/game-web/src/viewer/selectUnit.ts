/**
 * Выделение «для ходатайства» (SEL-C, решение автора 09.11): щелчок отмечает строку целиком —
 * строку таблицы, пункт списка, абзац или строку внутри абзаца (между переносами); протягивание
 * выделяет слова — края выделения дотягиваются до целых слов.
 */

/** Блок, который отмечается щелчком целиком. Ячейка таблицы — вся строка таблицы. */
const BLOCK = 'tr, p, li, h1, h2, h3, h4, h5, h6, dt, dd, pre';
/** Вложенные блоки (список в пункте списка) — их текст в строку не берётся. */
const NESTED = new Set(['UL', 'OL', 'TABLE', 'P', 'PRE', 'BLOCKQUOTE']);

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) return { node: p.offsetNode, offset: p.offset };
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** Строка под точкой экрана — диапазон её текста (или null: мимо текста). */
export function unitRangeAt(paper: Element, x: number, y: number): Range | null {
  const caret = caretAt(x, y);
  if (!caret || !paper.contains(caret.node)) return null;
  const el = caret.node instanceof Element ? caret.node : caret.node.parentElement;
  const block = el?.closest(BLOCK);
  if (!block || !paper.contains(block)) return null;

  // Текстовые узлы блока, разбитые на строки переносами <br> и вложенными блоками. Строка
  // таблицы — целиком, со всеми ячейками.
  const row = block.tagName === 'TR';
  const lines: Text[][] = [[]];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      !row && n instanceof Element && NESTED.has(n.tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let hit = -1;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n instanceof Element) {
      if (!row && n.tagName === 'BR') lines.push([]);
      continue;
    }
    if (!n.textContent?.trim()) continue;
    lines.at(-1)?.push(n as Text);
    if (n === caret.node) hit = lines.length - 1;
  }
  // Щелчок мимо текста внутри блока (поле ячейки, отступ): блок, если строка в нём одна.
  const nonEmpty = lines.filter((l) => l.length);
  const line = row || nonEmpty.length === 1 ? nonEmpty[0] : hit >= 0 ? lines[hit] : null;
  const first = line?.[0];
  const last = line?.at(-1);
  if (!first || !last) return null;
  const r = document.createRange();
  r.setStart(first, first.data.length - first.data.trimStart().length);
  r.setEnd(last, last.data.trimEnd().length);
  return r;
}

const SPACE = /\s/u;

/** Края выделения — до целых слов (слово — всё между пробелами, со знаками при нём). */
export function snapToWords(r: Range): void {
  const { startContainer: a, endContainer: b } = r;
  if (a instanceof Text) {
    let i = r.startOffset;
    while (i > 0 && !SPACE.test(a.data[i - 1] as string)) i--;
    // Выделение, начатое на пробеле, — с первого слова.
    while (i < a.data.length && SPACE.test(a.data[i] as string) && (a !== b || i < r.endOffset))
      i++;
    r.setStart(a, i);
  }
  if (b instanceof Text) {
    let j = r.endOffset;
    while (j < b.data.length && !SPACE.test(b.data[j] as string)) j++;
    while (j > 0 && SPACE.test(b.data[j - 1] as string) && (a !== b || j > r.startOffset)) j--;
    r.setEnd(b, j);
  }
}

/** Одна и та же строка: щелчок по отмеченной строке снимает отметку. */
export const sameRange = (x: Range | null, y: Range | null): boolean =>
  !!x &&
  !!y &&
  x.startContainer === y.startContainer &&
  x.startOffset === y.startOffset &&
  x.endContainer === y.endContainer &&
  x.endOffset === y.endOffset;
