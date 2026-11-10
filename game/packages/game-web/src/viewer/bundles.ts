/**
 * Пачки бумаг из помещений (этап 4b-2, решение автора 10.11 — PH-B, FV-A): коробка с девятью
 * пачками на столе, пачку берут в руки (hold/papers.tsx). Данные — таблица материала 29 (номер,
 * помещение, листов, верхний лист, вид сбоку); из канона сверх неё — только где лежат слои
 * картона, чтобы они были на торце:
 *  - П-02: «чуть выше середины стопки — ещё один слой картона» (29); лист 18 из 41 — опись
 *    пачки (L981) и правило card-p02 (A-231);
 *  - П-09: «через каждые три листа — слой картона (5 слоёв)» (29) — обложки папок (card-p09).
 */

/** Пачки бумаг из помещений — коробка на столе (PH-B). */
export const PAPERS_ID = '29';

/** Описи пачек (L981–L989): «листать П-0N». */
export const isBundleListing = (id: string) => /^L98[1-9]$/.test(id);

export interface Bundle {
  /** «П-02». */
  id: string;
  room: string;
  sheets: number;
  /** Текст верхнего листа (превью). */
  top: string;
  /** Как стопка видна сбоку — слова материала. */
  side: string;
  /** Слои картона на торце: перед каким листом сверху (1 — сверху). */
  layers: number[];
}

const LAYERS: Record<string, number[]> = {
  'П-02': [18],
  'П-09': [1, 4, 7, 10, 13],
};

const cells = (line: string) =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

/** Пачки из таблицы материала 29; текст до таблицы — вступление. */
export function parseBundles(body: string): { intro: string; bundles: Bundle[] } {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trimStart().startsWith('|'));
  const intro = (start < 0 ? lines : lines.slice(0, start)).join('\n').trim();
  const bundles: Bundle[] = [];
  for (const line of start < 0 ? [] : lines.slice(start)) {
    const c = cells(line);
    const id = c[0] ?? '';
    if (!/^П-\d\d$/.test(id)) continue;
    bundles.push({
      id,
      room: c[1] ?? '',
      sheets: Number(c[2]) || 0,
      top: c[3] ?? '',
      side: c[4] ?? '',
      layers: LAYERS[id] ?? [],
    });
  }
  return { intro, bundles };
}

/**
 * Опись пачки среди материалов — по названию («Листание: пачка П-05 …»): номера описей не
 * совпадают с номерами пачек (П-02 — L981, П-01 — L982).
 */
export const listingOf = (bundleId: string, materials: { id: string; title: string }[]) =>
  materials.find((m) => isBundleListing(m.id) && m.title.includes(bundleId))?.id ?? null;

/** Цель крупного плана строки описи: «L985 лист 19–24» (FV-A). */
export const rowTarget = (listingId: string, firstCell: string) =>
  `${listingId} лист ${firstCell.trim()}`;
