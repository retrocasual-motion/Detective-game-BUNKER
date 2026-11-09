/**
 * Время чтения (RD-A, решение автора 09.11) — только в режиме разработки: сколько секунд каждый
 * материал был открыт в просмотрщике. Считаются только секунды, когда вкладка видна и игрок
 * что-то делал за последнюю минуту (ушёл от компьютера — не читает). Хранится в браузере;
 * служебная кнопка «Время чтения» показывает таблицу, копирует её и сбрасывает.
 */

export interface ReadingEntry {
  ms: number;
  opens: number;
}
export type ReadingLog = Record<string, ReadingEntry>;

const KEY = 'bunker.reading.v1';
/** Без действий дольше — время не идёт. */
export const IDLE_MS = 60_000;
const TICK_MS = 1000;
/** Открыт короче — не считается открытием. */
const OPEN_MS = 300;

export const addReading = (log: ReadingLog, id: string, ms: number, opens = 0): ReadingLog => {
  const was = log[id] ?? { ms: 0, opens: 0 };
  return { ...log, [id]: { ms: was.ms + ms, opens: was.opens + opens } };
};

export function loadReading(): ReadingLog {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as ReadingLog) : {};
  } catch {
    return {};
  }
}

function save(log: ReadingLog) {
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Хранилище недоступно — учёт просто не ведётся.
  }
}

export const clearReading = () => save({});

/** Строки таблицы: дольше всего читали — сверху. */
export function readingRows(log: ReadingLog, titles: Map<string, string>) {
  return Object.entries(log)
    .map(([id, e]) => ({
      id,
      title: titles.get(id) ?? '',
      seconds: Math.round(e.ms / 1000),
      opens: e.opens,
    }))
    .sort((a, b) => b.seconds - a.seconds || a.id.localeCompare(b.id));
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Таблица для вставки в чат или таблицу: номер, название, минуты:секунды, сколько раз открыт. */
export const readingTsv = (rows: ReturnType<typeof readingRows>) =>
  [
    'Материал\tНазвание\tВремя\tОткрыт раз',
    ...rows.map((r) => `${r.id}\t${r.title}\t${mmss(r.seconds)}\t${r.opens}`),
  ].join('\n');

let lastActivity = Date.now();
let listening = false;
const touch = () => {
  lastActivity = Date.now();
};

/** Начать учёт для открытого материала; вернуть «стоп» (закрыли просмотрщик). */
export function trackReading(id: string): () => void {
  if (!listening) {
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll'])
      window.addEventListener(ev, touch, { passive: true, capture: true });
    listening = true;
  }
  touch();
  const startedAt = Date.now();
  let pending = 0;
  const flush = (opens = 0) => {
    if (pending || opens) save(addReading(loadReading(), id, pending, opens));
    pending = 0;
  };
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastActivity < IDLE_MS)
      pending += TICK_MS;
    if (pending >= 10 * TICK_MS) flush();
  }, TICK_MS);
  return () => {
    window.clearInterval(timer);
    // Открытие засчитывается при закрытии: мгновенный перезапуск эффекта (StrictMode
    // в разработке) — не второе открытие.
    flush(Date.now() - startedAt > OPEN_MS ? 1 : 0);
  };
}
