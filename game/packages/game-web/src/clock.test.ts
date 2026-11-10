import { describe, expect, it } from 'vitest';
import { ddmmyyyy, gameNow, hhmm } from './clock.ts';

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
