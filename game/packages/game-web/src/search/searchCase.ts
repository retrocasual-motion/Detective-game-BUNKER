import type { Material } from '@bunker/shared';

/**
 * Поиск по делу (RD-C, решение автора 09.11): слово — по всем материалам, которые у игрока
 * уже есть. Регистр и «ё/е» не важны. Результат — строки с совпадением; игрок открывает лист
 * сразу на нужном месте. Поиск находит слово, а не смысл: сопоставлять — по-прежнему игроку.
 */

/** Для сравнения: строчные, «ё» как «е» (длина строки не меняется — индексы совпадают). */
export const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е');

/** Строка без разметки Markdown — как её видит игрок. */
export const plainLine = (line: string) =>
  line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/, '')
    .replace(/[*_`]+/g, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/^ · | · $/g, '')
    .trim();

export interface Hit {
  /** Какое по счёту совпадение в материале (с нуля) — чтобы открыть лист на нём. */
  k: number;
  before: string;
  match: string;
  after: string;
}

export interface Found {
  id: string;
  title: string;
  hits: Hit[];
}

export const MIN_QUERY = 2;
const AROUND = 48;

export function searchCase(
  materials: Pick<Material, 'id' | 'title' | 'body'>[],
  query: string,
): Found[] {
  const q = norm(query.trim().replace(/\s+/g, ' '));
  if (q.length < MIN_QUERY) return [];
  const out: Found[] = [];
  for (const m of materials) {
    const hits: Hit[] = [];
    let k = 0;
    for (const raw of m.body.split('\n')) {
      const line = plainLine(raw);
      if (!line || /^[-·\s]+$/.test(line)) continue;
      const n = norm(line);
      for (let i = n.indexOf(q); i >= 0; i = n.indexOf(q, i + q.length)) {
        const from = Math.max(0, i - AROUND);
        const to = Math.min(line.length, i + q.length + AROUND);
        hits.push({
          k: k++,
          before: (from > 0 ? '…' : '') + line.slice(from, i),
          match: line.slice(i, i + q.length),
          after: line.slice(i + q.length, to) + (to < line.length ? '…' : ''),
        });
      }
    }
    if (hits.length) out.push({ id: m.id, title: m.title, hits });
  }
  return out;
}
