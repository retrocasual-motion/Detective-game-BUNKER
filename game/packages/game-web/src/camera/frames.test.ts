import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRAME_COUNT, frameDetails, frameTime, parseFrames } from './frames.ts';

const pack = '../../../playtest/packs/v3.3-2026-10-29';
const read = (dir: string, id: string) => {
  const f = readdirSync(`${pack}/${dir}`).find((x) => x.startsWith(`${id}__`)) ?? '';
  return readFileSync(`${pack}/${dir}/${f}`, 'utf8');
};

describe('кадры камеры инженера (24)', () => {
  const frames = parseFrames(read('player', '24'));

  it('61 кадр: свои описания у 14, 15, 56–61, общее — у серий 1–13 и 16–55', () => {
    expect(frames).toHaveLength(FRAME_COUNT);
    expect(frames[13]?.text).toContain('Подножие сверху');
    expect(frames[14]?.text).toContain('очки');
    expect(frames[56]?.text).toContain('Шкаф');
    expect(frames[0]?.text).toContain('Более ранние');
    expect(frames[29]?.text).toBe(frames[15]?.text);
    expect(frames[29]?.text).toContain('плита крепления');
    expect(frames.every((f) => f.text)).toBe(true);
  });

  it('время — из свойств L973: своё у 13, 14, 15; у серии — время серии', () => {
    const p = read('locked', 'L973');
    expect(frameTime(p, 14)).toBe('13.10.2009, 08:56:12');
    expect(frameTime(p, 15)).toBe('13.10.2009, 08:56:40');
    expect(frameTime(p, 13)).toBe('10.10.2009, 15:20');
    expect(frameTime(p, 30)).toBe('13.10.2009, 08:58:05 — 09:06:31');
    expect(frameTime(p, 5)).toBe('01.10.2009 — 10.10.2009');
  });

  it('крупно — из L905: у 57 — своё, у серии 16–55 — общее, у 13 — ничего', () => {
    const z = read('locked', 'L905');
    expect(frameDetails(z, 14).join(' ')).toContain('МЕДКАБ');
    expect(frameDetails(z, 57).join(' ')).toContain('A-23');
    expect(frameDetails(z, 58).join(' ')).not.toContain('A-23');
    expect(frameDetails(z, 30).join(' ')).toContain('Излом');
    expect(frameDetails(z, 13)).toEqual([]);
  });
});
