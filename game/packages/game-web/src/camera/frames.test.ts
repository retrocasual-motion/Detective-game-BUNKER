import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRAME_COUNT, frameDetails, frameTime, parseFrames } from './frames.ts';

const pack = '../../../playtest/packs/v3.4-2026-11-18';
const read = (dir: string, id: string) => {
  const f = readdirSync(`${pack}/${dir}`).find((x) => x.startsWith(`${id}__`)) ?? '';
  return readFileSync(`${pack}/${dir}/${f}`, 'utf8');
};

describe('кадры камеры инженера (24)', () => {
  const frames = parseFrames(read('player', '24'));

  it('11 кадров, у каждого своё описание (A-269: без дублей)', () => {
    expect(frames).toHaveLength(FRAME_COUNT);
    expect(frames.every((f) => f.text)).toBe(true);
    expect(new Set(frames.map((f) => f.text)).size).toBe(FRAME_COUNT);
    expect(frames[2]?.text).toContain('Подножие сверху');
    expect(frames[1]?.text).toContain('файл 12');
    expect(frames[8]?.text).toContain('Шкаф');
  });

  it('время — из свойств L973, у каждого кадра своё', () => {
    const p = read('locked', 'L973');
    expect(frameTime(p, 3)).toBe('13.10.2009, 08:56:12');
    expect(frameTime(p, 4)).toBe('13.10.2009, 08:56:40');
    expect(frameTime(p, 2)).toBe('10.10.2009, 15:20:05');
    for (let n = 1; n <= FRAME_COUNT; n++) expect(frameTime(p, n)).toMatch(/^\d{2}\.10\.2009, /);
  });

  it('крупно — из L905: у кадра 3 — ключи, у 9 — корешки, у 1 — ничего', () => {
    const z = read('locked', 'L905');
    expect(frameDetails(z, 3).join(' ')).toContain('МЕДКАБ');
    expect(frameDetails(z, 9).join(' ')).toContain('A-23');
    expect(frameDetails(z, 10).join(' ')).not.toContain('A-23');
    expect(frameDetails(z, 6).join(' ')).toContain('Излом');
    expect(frameDetails(z, 1)).toEqual([]);
  });
});
