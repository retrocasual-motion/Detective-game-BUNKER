/**
 * Часы устройств (CL-D, решение автора 10.11): время — настоящее, у игрока; дата — игровая:
 * 16.11.2009 (день, когда специалист получил дело, — газета на столе, A-260) в первый день игры,
 * дальше идёт вместе с настоящими днями.
 */
const FIRST = { y: 2009, m: 10, d: 16 };

/** Сегодняшняя дата игрока: «ГГГГ-ММ-ДД» по его часам. */
export const todayKey = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
};

/** Игровые дата и время сейчас. */
export function gameNow(started: string | undefined, now = new Date()): Date {
  const days = started ? Math.max(0, dayNumber(todayKey(now)) - dayNumber(started)) : 0;
  return new Date(FIRST.y, FIRST.m, FIRST.d + days, now.getHours(), now.getMinutes());
}

export const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
