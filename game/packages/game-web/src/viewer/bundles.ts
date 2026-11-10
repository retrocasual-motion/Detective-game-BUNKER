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

/** Строка описи пачки, где лежит лист n: первая ячейка — «18» или «1–3». */
export function rowOfSheet(listingBody: string, n: number): string | null {
  for (const line of listingBody.split('\n')) {
    const c = cells(line);
    const m = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(c[0] ?? '');
    if (!m) continue;
    const from = Number(m[1]);
    const to = Number(m[2] ?? m[1]);
    if (n >= from && n <= to) return line;
  }
  return null;
}

/** Код дела на обложке папки, вытащенной из пачки (лист n): «A-24». */
export const coverCode = (listingBody: string, n: number) =>
  /A-\d+/.exec(rowOfSheet(listingBody, n) ?? '')?.[0] ?? null;

/**
 * Выдержка из описи пачки — только листы from–to (папка, вытащенная из пачки): заголовок, шапка
 * таблицы, строки этих листов и разделы «## Лист N …» с N в этих листах.
 */
export function excerptBody(body: string, title: string, from: number, to: number): string {
  const lines = body.split('\n');
  const out: string[] = [`# ${title}`, ''];
  const head = lines.findIndex((l) => l.trimStart().startsWith('|'));
  if (head >= 0) {
    out.push(lines[head] ?? '', lines[head + 1] ?? '');
    for (const line of lines.slice(head + 2)) {
      const m = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(cells(line)[0] ?? '');
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[2] ?? m[1]);
      if (a <= to && b >= from) out.push(line);
    }
  }
  let keep = false;
  for (const line of lines) {
    const h = /^##\s+Лист\s+(\d+)/.exec(line);
    if (/^#{1,2}\s/.test(line)) keep = !!h && Number(h[1]) >= from && Number(h[1]) <= to;
    if (keep) out.push(line);
  }
  return out.join('\n');
}

/** Лист пачки при листании в руках (LF-A): что на нём, лежит ли текстом вниз, обложка ли папки. */
export interface Sheet {
  text: string;
  faceDown: boolean;
  /** Код дела на обложке, если это обложка папки (слой картона). */
  cover: string | null;
}

/**
 * Листы пачки по описи (LF-A, решение автора 10.11) — без новых фактов: строка описи на каждый
 * лист своего диапазона («1–17 — чистый бланк» — 17 одинаковых листов). П-01 описан сводкой по
 * людям — 96 анкет «день, имя» (сверху день 12, внутри дня — по порядку сводки), свободная строка —
 * где сводка её даёт.
 */
export function sheetPages(listingBody: string, b: Pick<Bundle, 'sheets' | 'layers'>): Sheet[] {
  const lines = listingBody.split('\n');
  const pages: Sheet[] = [];
  const header = lines.find((l) => l.trimStart().startsWith('|')) ?? '';
  if (/Имя/.test(header) && /Дни/.test(header)) {
    const people = lines
      .map(cells)
      .filter((c) => c[0] && /^\S\.\s/.test(c[0]) && /\d/.test(c[1] ?? ''));
    for (let day = 12; day >= 1; day--)
      for (const c of people) {
        const free = new RegExp(`д\\.\\s*${day}:\\s*«([^»]*)»`).exec(c[2] ?? '')?.[1];
        pages.push({
          text: `Ежедневная анкета самооценки VAULTLINE. День ${day}. ${c[0]}.${free ? ` Что хотите добавить: «${free}»` : ''}`,
          faceDown: false,
          cover: null,
        });
      }
  } else
    for (let n = 1; n <= b.sheets; n++) {
      const row = rowOfSheet(listingBody, n);
      const c = row ? cells(row).slice(1) : [];
      const text = c.join(' · ');
      pages.push({
        text,
        faceDown: /текстом вниз/.test(text),
        cover: b.layers.includes(n) ? (/A-\d+/.exec(text)?.[0] ?? '') : null,
      });
    }
  while (pages.length < b.sheets) pages.push({ text: '', faceDown: false, cover: null });
  return pages.slice(0, b.sheets);
}
