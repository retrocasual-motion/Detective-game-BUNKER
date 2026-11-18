import { describe, expect, it } from 'vitest';
import { ddmmyyyy, formatWait, gameNow, hhmm } from './clock.ts';

describe('gameNow (CL-D)', () => {
  it('первый день — 16.11.2009, время — настоящее', () => {
    const now = new Date(2026, 10, 10, 14, 32);
    const g = gameNow('2026-11-10', now);
    expect(ddmmyyyy(g)).toBe('16.11.2009');
    expect(hhmm(g)).toBe('14:32');
  });
  it('дни идут вместе с настоящими (и через месяц)', () => {
    expect(ddmmyyyy(gameNow('2026-11-10', new Date(2026, 10, 11, 9, 0)))).toBe('17.11.2009');
    expect(ddmmyyyy(gameNow('2026-11-10', new Date(2026, 11, 1, 9, 0)))).toBe('07.12.2009');
  });
  it('нет дня начала — первый день', () => {
    expect(ddmmyyyy(gameNow(undefined, new Date(2030, 0, 1)))).toBe('16.11.2009');
  });
});

describe('formatWait — отсчёт паузы замка (R2-10)', () => {
  it('секунды вверх, без «1:00» за 0,4 с до двух минут', () => {
    expect(formatWait(120_000)).toBe('2:00');
    expect(formatWait(119_600)).toBe('2:00');
    expect(formatWait(119_000)).toBe('1:59');
    expect(formatWait(60_000)).toBe('1:00');
    expect(formatWait(59_600)).toBe('1:00');
    expect(formatWait(1)).toBe('0:01');
    expect(formatWait(0)).toBe('0:00');
    expect(formatWait(-5)).toBe('0:00');
  });
});
