import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  captionAt,
  clock,
  fromClock,
  listenLine,
  parseRecord,
  RECORD_LENGTH,
  windows,
} from './record.ts';

const dir = '../../../playtest/packs/v3.3-2026-10-29/player';
const f = readdirSync(dir).find((x) => x.startsWith('50__')) ?? '';
const body = readFileSync(`${dir}/${f}`, 'utf8').replace(/\r\n?/g, '\n');

describe('запись радиопоста — из файла 50', () => {
  const ev = parseRecord(body);
  it('строки таблицы — во времени от начала записи; полночь и даты учтены', () => {
    expect(ev[0]?.start).toBe(0);
    expect(clock(0)).toBe('12.10 21:43:12');
    const strike = ev.find((e) => /удар у подножия/.test(e.text));
    expect(strike && clock(strike.start)).toBe('13.10 08:45:02');
    const night = ev.find((e) => /^Шаги одного человека у подножия/.test(e.text));
    expect(night && clock(night.start)).toBe('13.10 01:13:20');
    const tail = ev.at(-1);
    expect(tail?.end).toBe(RECORD_LENGTH);
    // Порядок сохранён (отрезки начинаются с округлённой минуты — допуск 60 с).
    for (let i = 1; i < ev.length; i++)
      expect(ev[i]?.start ?? 0).toBeGreaterThanOrEqual((ev[i - 1]?.start ?? 0) - 60);
  });
  it('подпись по месту: удар в 08:45:02, между событиями — фон, «Лондон» в 08:44:31', () => {
    expect(captionAt(ev, fromClock(13, 8 * 3600 + 45 * 60 + 3))?.text).toMatch(/удар/);
    expect(captionAt(ev, fromClock(13, 8 * 3600 + 20 * 60))?.text).toMatch(/^Фон/);
    expect(captionAt(ev, fromClock(13, 8 * 3600 + 44 * 60 + 33))?.text).toMatch(/Лондон/);
  });
  it('окна шкалы: отрезок с тревоги и сутки до 28.10; строка для движка', () => {
    const w = windows();
    expect(w[0]?.label).toBe('12.10 21:43 — 13.10 11:00');
    expect(w.at(-1)?.label).toBe('28.10');
    expect(listenLine(fromClock(13, 9 * 3600))).toBe('прослушать 13.10 09:00:00');
  });
});
