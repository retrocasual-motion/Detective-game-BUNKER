/**
 * Кадры камеры инженера (24; A-268 — изъята сама камера, с картой внутри; A-269 — 11 кадров, у
 * каждого свой смысл, без дублей). Описания — из 24, время съёмки — из L973 (только когда
 * «свойства» открыты движком), крупные детали — из L905 (когда открыто «увеличить»).
 */

export const FRAME_COUNT = 11;

export interface Frame {
  n: number;
  /** Серия: «Кадры 16–55 (13.10): …» — заголовок раздела (для своего кадра — тоже). */
  series: string;
  text: string;
}

const range = (s: string): [number, number] | null => {
  const m = /(\d+)\s*[–—-]\s*(\d+)/.exec(s);
  if (m) return [Number(m[1]), Number(m[2])];
  const one = /(\d+)/.exec(s);
  return one ? [Number(one[1]), Number(one[1])] : null;
};

const clean = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

/** Разделы «## …» тела материала. */
function sections(body: string): { head: string; text: string }[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n(?=## )/)
    .filter((s) => s.startsWith('## '))
    .map((s) => ({ head: /^## ([^\n]*)/.exec(s)?.[1] ?? '', text: s.replace(/^##[^\n]*\n+/, '') }));
}

/** Пункты «14. …» внутри раздела. */
function items(text: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const p of text.split(/\n(?=\d+\.\s)/)) {
    const m = /^(\d+)\.\s+([\s\S]*)$/.exec(p.trim());
    if (m) out.set(Number(m[1]), clean(m[2] ?? ''));
  }
  return out;
}

/** Все кадры по порядку: описание своего кадра (или общее у раздела без пунктов). */
export function parseFrames(body24: string): Frame[] {
  const frames: Frame[] = [];
  for (const s of sections(body24)) {
    const r = range(s.head);
    if (!r) continue;
    const own = items(s.text);
    const common = own.size ? '' : clean(s.text);
    for (let n = r[0]; n <= r[1]; n++)
      frames[n - 1] = { n, series: s.head, text: own.get(n) ?? common };
  }
  return Array.from(
    { length: FRAME_COUNT },
    (_, k) => frames[k] ?? { n: k + 1, series: '', text: '' },
  );
}

/** Время съёмки кадра n по L973: своё время или время серии. */
export function frameTime(bodyL973: string, n: number): string | null {
  for (const line of bodyL973.split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    const r = range(c[1] ?? '');
    if (!r || n < r[0] || n > r[1] || !/\d{4}/.test(c[2] ?? '')) continue;
    const cell = c[2] ?? '';
    // «кадр 13 — 10.10.2009, 15:20» — своё время кадра внутри серии.
    const own = new RegExp(`кадр ${n} — ([^)]+)`).exec(cell);
    if (own) return own[1]?.trim() ?? null;
    const date = /\d{2}\.\d{2}\.\d{4}/.exec(cell)?.[0] ?? '';
    // «13.10.2009, 08:56:12 и 08:56:40» — по кадру на время.
    const times = cell.match(/\d{1,2}:\d{2}(?::\d{2})?/g) ?? [];
    if (/\sи\s/.test(cell) && times.length === r[1] - r[0] + 1)
      return `${date}, ${times[n - r[0]]}`;
    return cell.replace(/\s*\(кадр \d+[^)]*\)/, '');
  }
  return null;
}

/** Крупные детали кадра n по L905: строки «Кадр N: …» — своему кадру, прочие — всей серии. */
export function frameDetails(bodyL905: string, n: number): string[] {
  for (const s of sections(bodyL905)) {
    const r = range(s.head);
    if (!r || n < r[0] || n > r[1]) continue;
    const lines = s.text
      .split(/\n(?=- )/)
      .map((l) => clean(l.replace(/^-\s*/, '')))
      .filter(Boolean);
    const own = lines.filter((l) => /^Кадр \d+:/.test(l));
    if (!own.length) return lines;
    return own
      .filter((l) => Number(/^Кадр (\d+):/.exec(l)?.[1]) === n)
      .map((l) => l.replace(/^Кадр \d+:\s*/, ''));
  }
  return [];
}
