import { FOLDER_DOCS } from '@bunker/shared';
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

/** Папка в пачке — обложка и два листа в ней (П-02: 18–20; П-09: по три листа на дело). */
export const FOLDER_SHEETS = 3;

/**
 * Что осталось в пачке, когда из неё вынули папки (taken: «П-02/18»): число листов, слои
 * картона и листы — по порядку, без вынутых; orig — номер листа в исходной пачке.
 */
export function remaining(
  b: Bundle,
  taken: readonly string[],
  sheets: Sheet[] | null,
  /** Перевёрнутые блоки листов «П-05/19» и лица этих листов (из пересканов, L957). */
  turned: readonly string[] = [],
  faceUp: ReadonlyMap<number, string> = new Map(),
) {
  const out = taken
    .filter((t) => t.startsWith(`${b.id}/`))
    .map((t) => Number(t.slice(b.id.length + 1)));
  const orig: number[] = [];
  for (let n = 1; n <= b.sheets; n++)
    if (!out.some((o) => n >= o && n < o + FOLDER_SHEETS)) orig.push(n);
  return {
    bundle: {
      ...b,
      sheets: orig.length,
      layers: b.layers.filter((n) => !out.includes(n)).map((n) => orig.indexOf(n) + 1),
    },
    sheets: sheets ? orig.map((n) => turnUp(sheets, n)) : null,
    orig,
  };

  // Блок листов текстом вниз, который уже перевернули, — лицом вверх (правка автора 10.11: дальше
  // листается, а не «перевернуть» снова).
  function turnUp(all: Sheet[], n: number): Sheet {
    const s = all[n - 1] ?? { text: '', faceDown: false, cover: null };
    if (!s.faceDown) return s;
    let first = n;
    while (first > 1 && all[first - 2]?.faceDown) first--;
    if (!turned.includes(`${b.id}/${first}`)) return s;
    return { text: faceUp.get(n) ?? 'Лист лицом вверх', faceDown: false, cover: null };
  }
}

/** Лица листов из пересканов («## Лист 19» и текст под ним цитатой): номер листа → текст. */
export function faceUpTexts(body: string): Map<number, string> {
  const out = new Map<number, string>();
  let n = 0;
  let buf: string[] = [];
  const flush = () => {
    if (n) out.set(n, buf.join(' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim());
  };
  for (const line of body.split('\n')) {
    const h = /^##\s+Лист\s+(\d+)/.exec(line);
    if (h) {
      flush();
      n = Number(h[1]);
      buf = [];
    } else if (n && line.startsWith('>')) buf.push(line.replace(/^>\s?/, ''));
  }
  flush();
  return out;
}

/** Материал папки, вынутой из пачки, — если он уже в деле (DS-A). */
export const docOf = (taken: string, materials: { id: string }[]) => {
  const id = FOLDER_DOCS[taken];
  return id && materials.some((m) => m.id === id) ? id : null;
};

/**
 * Папка, вынутая из пачки, на стене («F:П-02/18»): из какой пачки, с какого листа, опись пачки и
 * код дела на обложке. Открыть — листы папки из описи (до отдельного документа, DS-A).
 */
export function folderOnWall(
  id: string,
  materials: { id: string; title: string; body: string }[],
): {
  bundle: string;
  n: number;
  listing: string;
  code: string | null;
  title: string;
  /** Сама папка — отдельный материал, если он уже в деле (DS-A, A-263). */
  doc: string | null;
} | null {
  const m = /^F:(П-0\d)\/(\d+)$/.exec(id);
  if (!m) return null;
  const bundle = m[1] ?? '';
  const n = Number(m[2]);
  const listing = listingOf(bundle, materials);
  if (!listing) return null;
  const code = coverCode(materials.find((x) => x.id === listing)?.body ?? '', n);
  return {
    bundle,
    n,
    listing,
    code,
    title: `Папка ${code ?? ''} (пачка ${bundle}, листы ${n}–${n + FOLDER_SHEETS - 1})`,
    doc: docOf(`${bundle}/${n}`, materials),
  };
}
