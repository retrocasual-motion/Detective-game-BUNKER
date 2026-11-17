/**
 * Записи дела для плеера (этап 4d; PL-A — слушают там, где лежат). Два вида разметки в пакете:
 * — «файлы»: разделы `## \`REC001.wav\` — 0:25` (диктофон 49, ролики 14) или
 *   `## Сообщение 1 — 07:02, 0:14` (голосовая почта 21) — у каждого своя расшифровка;
 * — «по времени»: таблица `| 0:00–0:06 | … |` (фильм 13, кассета L462) — подпись той строки,
 *   где стоит перемотка (K8: звука в сборке нет, описание — по месту).
 */

export interface MediaFile {
  name: string;
  /** Секунды. */
  dur: number;
  text: string;
}
export interface TimedRow {
  start: number;
  end: number;
  cells: string[];
}
export type Media =
  | { kind: 'files'; intro: string; files: MediaFile[] }
  | { kind: 'timed'; intro: string; dur: number; head: string[]; rows: TimedRow[] };

/** Записи, которые в просмотрщике открываются плеером. */
export const MEDIA_IDS: ReadonlySet<string> = new Set(['13', '14', '21', 'L462']);

/**
 * Записи внутри страницы: материал — страница, а в одном её разделе — запись (старый фильм HEXON на
 * сайте hexon-bio.com, L163). Страница читается как есть, раздел — плеером на своём месте.
 */
export const EMBEDDED_MEDIA: Readonly<Record<string, string>> = { L163: 'Архив и медиа' };

/** Страница до раздела, сам раздел (без заголовка) и после него; нет раздела — null. */
export function splitEmbedded(
  body: string,
  heading: string,
): { before: string; section: string; after: string } | null {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return null;
  let end = lines.findIndex((l, k) => k > start && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  return {
    before: lines.slice(0, start + 1).join('\n'),
    section: lines
      .slice(start + 1, end)
      .join('\n')
      .trim(),
    after: lines.slice(end).join('\n'),
  };
}

const sec = (m: string, s: string) => Number(m) * 60 + Number(s);
const stripTitle = (body: string) => body.replace(/^#\s[^\n]*\n+/, '');

export function parseMedia(body: string): Media | null {
  const text = body.replace(/\r\n?/g, '\n');
  const sections = stripTitle(text).split(/\n(?=## )/);
  const intro = (sections[0]?.startsWith('## ') ? '' : (sections[0] ?? '')).trim();
  const files = sections
    .filter((s) => s.startsWith('## '))
    .map((s) => {
      const head = /^## ([^\n]*)/.exec(s)?.[1] ?? '';
      const times = [...head.matchAll(/(\d{1,2}):(\d{2})/g)];
      const last = times.at(-1);
      const name = /`([^`]+)`/.exec(head)?.[1] ?? head.replace(/\s*—.*$/, '').trim();
      return {
        name,
        dur: last ? sec(last[1] ?? '0', last[2] ?? '0') : 0,
        text: s.replace(/^##[^\n]*\n+/, '').trim(),
        head,
      };
    })
    .filter((f) => f.dur > 0);
  if (files.length) {
    // «Сообщение 1 — 07:02, 0:14»: имя — до тире, время — часть имени.
    return {
      kind: 'files',
      intro,
      files: files.map((f) => ({
        name: /`/.test(f.head) ? f.name : f.head.replace(/,\s*\d{1,2}:\d{2}\s*$/, ''),
        dur: f.dur,
        text: f.text,
      })),
    };
  }
  // Таблица по времени.
  const lines = text.split('\n').filter((l) => /^\|/.test(l));
  const headLine = lines.find((l) => /^\|\s*Время/.test(l));
  if (!headLine) return null;
  const head = headLine
    .split('|')
    .slice(2, -1)
    .map((c) => c.trim());
  const raw = lines
    .filter((l) => !/^\|\s*(Время|---)/.test(l))
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    )
    .map((c) => {
      const m = /(\d{1,2}):(\d{2})(?:\s*[–—-]\s*(\d{1,2}):(\d{2}))?/.exec(c[0] ?? '');
      return m
        ? {
            start: sec(m[1] ?? '0', m[2] ?? '0'),
            end: m[3] ? sec(m[3], m[4] ?? '0') : -1,
            cells: c.slice(1),
          }
        : null;
    })
    .filter((r): r is TimedRow => r !== null);
  const durM = /(\d+)\s*мин\s*(\d+)\s*с/.exec(intro + text.slice(0, 300));
  const durC = /(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/.exec(intro);
  const last = raw.at(-1);
  const dur = durM
    ? Number(durM[1]) * 60 + Number(durM[2])
    : durC
      ? sec(durC[1] ?? '0', durC[2] ?? '0')
      : Math.max(last?.end ?? 0, (last?.start ?? 0) + 5);
  const rows = raw.map((r, i) => ({ ...r, end: r.end >= 0 ? r.end : (raw[i + 1]?.start ?? dur) }));
  return { kind: 'timed', intro: intro.split(/\n\s*\n/)[0] ?? '', dur, head, rows };
}

/** Строка таблицы в точке t. */
export const rowAt = (rows: readonly TimedRow[], t: number) =>
  rows.find((r) => r.start <= t && t < r.end) ?? null;

/** «1:05». */
export const mmss = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
