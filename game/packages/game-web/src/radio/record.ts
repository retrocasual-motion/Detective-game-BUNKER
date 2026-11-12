/**
 * Запись регистратора радиопоста (файл 50, этап 4d-1): таблица «время регистратора — что слышно»
 * переводится во время от начала записи. Это описание звука для изготовления и для серого
 * прототипа (K8): игроку показывается только строка той точки, где стоит перемотка.
 * Часы регистратора (L975): запись создана 12.10.2009 21:43:12, длится 15 сут 13 ч 35 мин.
 */

/** Секунды от 12.10.2009 00:00 до начала записи (21:43:12). */
const START_OF_DAY = 21 * 3600 + 43 * 60 + 12;
/** Первый день записи — 12.10. */
const FIRST_DAY = 12;
/** Длительность: 15 сут 13 ч 35 мин. */
export const RECORD_LENGTH = 15 * 86400 + 13 * 3600 + 35 * 60;
/** Сколько секунд держится подпись точечного события (шаги, удар). */
const POINT_HOLD = 6;

export interface RecEvent {
  /** Секунды от начала записи. */
  start: number;
  end: number;
  text: string;
  /** «Фон…» — тишина эфира; на шкале полосой не показывается. */
  background: boolean;
  point: boolean;
}

/** Абсолютное время (день октября, секунды суток) → секунды от начала записи. */
export const fromClock = (day: number, sec: number) =>
  (day - FIRST_DAY) * 86400 + sec - START_OF_DAY;

/** Секунды от начала записи → «13.10 08:44:31» (часы регистратора). */
export function clock(t: number, withSeconds = true): string {
  const abs = Math.round(t) + START_OF_DAY;
  const day = FIRST_DAY + Math.floor(abs / 86400);
  const s = ((abs % 86400) + 86400) % 86400;
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}`;
  return `${p(day)}.10 ${withSeconds ? `${hm}:${p(s % 60)}` : hm}`;
}

const TIME = /(?:(\d{1,2})\.(\d{2})\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/;

/** Разбор таблицы записи из файла 50. */
export function parseRecord(body: string): RecEvent[] {
  const part = body.split(/^## Запись/m)[1] ?? '';
  const rows = part
    .split('\n')
    .filter((l) => /^\|/.test(l) && !/^\|\s*(Время|---)/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()))
    .map((c) => [c[1] ?? '', c[2] ?? ''] as const);
  const out: RecEvent[] = [];
  let day = FIRST_DAY;
  let last = -1;
  const at = (m: RegExpExecArray, ref: { day: number }) => {
    if (m[1]) ref.day = Number(m[1]);
    const sec = Number(m[3]) * 3600 + Number(m[4]) * 60 + Number(m[5] ?? 0);
    return { day: ref.day, sec };
  };
  for (const [cell, text] of rows) {
    const [a = '', b] = cell.split(/\s*[–—]\s*/);
    const ma = TIME.exec(a);
    if (!ma) continue;
    const ref = { day };
    let s = at(ma, ref);
    // Без даты время меньше прежнего — уже следующие сутки.
    if (!ma[1] && last >= 0 && fromClock(s.day, s.sec) < last - 60) {
      ref.day += 1;
      s = { day: ref.day, sec: s.sec };
    }
    day = ref.day;
    const start = Math.max(0, fromClock(s.day, s.sec));
    let end = start;
    let point = true;
    if (b) {
      point = false;
      const mb = TIME.exec(b);
      if (mb) {
        const r2 = { day };
        const e = at(mb, r2);
        end = fromClock(e.day, e.sec);
        if (end < start) end += 86400;
      } else if (/^\d{1,2}\.\d{2}$/.test(b.trim())) end = RECORD_LENGTH;
    }
    last = start;
    out.push({
      start,
      end: point ? start + POINT_HOLD : end,
      text,
      background: /^Фон/.test(text),
      point,
    });
  }
  return out;
}

/** Что слышно в точке t: точечное событие рядом, иначе отрезок, который её покрывает. */
export function captionAt(events: readonly RecEvent[], t: number): RecEvent | null {
  let best: RecEvent | null = null;
  for (const e of events) if (e.point && e.start <= t && t < e.end) best = e;
  if (best) return best;
  for (const e of events) if (!e.point && e.start <= t && t < e.end) best = e;
  return best;
}

/** Окна шкалы: отрезок с тревоги (12.10 21:43 — 13.10 11:00) и сутки 13.10 … 28.10. */
export interface RecWindow {
  key: string;
  label: string;
  from: number;
  to: number;
}
export function windows(): RecWindow[] {
  const out: RecWindow[] = [
    { key: 'alarm', label: '12.10 21:43 — 13.10 11:00', from: 0, to: fromClock(13, 11 * 3600) },
  ];
  for (let d = 13; d <= 28; d++) {
    const from = Math.max(0, fromClock(d, 0));
    const to = Math.min(RECORD_LENGTH, fromClock(d + 1, 0));
    if (to > from) out.push({ key: `d${d}`, label: `${d}.10`, from, to });
  }
  return out;
}

/** Строка для движка: «прослушать 13.10 08:44:31» (правила listen-50-*). */
export const listenLine = (t: number) => `прослушать ${clock(t)}`;

/** Метки часов на шкале: каждые step часов по часам регистратора. */
export function hourTicks(from: number, to: number, stepHours: number): number[] {
  const step = stepHours * 3600;
  const abs = from + START_OF_DAY;
  const out: number[] = [];
  for (let a = Math.ceil(abs / step) * step; a - START_OF_DAY <= to; a += step)
    out.push(a - START_OF_DAY);
  return out;
}
