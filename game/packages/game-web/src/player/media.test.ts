import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMedia, rowAt } from './media.ts';

const pack = '../../../playtest/packs/v3.3-2026-10-29';
const read = (dir: string, id: string) => {
  const f = readdirSync(`${pack}/${dir}`).find((x) => x.startsWith(`${id}__`)) ?? '';
  return readFileSync(`${pack}/${dir}/${f}`, 'utf8');
};

describe('записи дела для плеера', () => {
  it('диктофон 49 — семь файлов с длительностью; REC004 — «Тоффи»', () => {
    const m = parseMedia(read('player', '49'));
    if (m?.kind !== 'files') throw new Error('не файлы');
    expect(m.files.map((f) => f.name)).toEqual([
      'REC001.wav',
      'REC002.wav',
      'REC003.wav',
      'REC004.wav',
      'REC005.wav',
      'REC006.wav',
      'REC007.wav',
    ]);
    expect(m.files[6]?.dur).toBe(60);
    expect(m.files[3]?.text).toContain('Тоффи');
  });
  it('голосовая почта 21 — три сообщения; ролики 14 — восемь файлов', () => {
    const v = parseMedia(read('player', '21'));
    if (v?.kind !== 'files') throw new Error('не файлы');
    expect(v.files.map((f) => [f.name, f.dur])).toEqual([
      ['Сообщение 1 — 07:02', 14],
      ['Сообщение 2 — 07:35', 11],
      ['Сообщение 3 — 08:20', 9],
    ]);
    const r = parseMedia(read('player', '14'));
    expect(r?.kind === 'files' && r.files.length).toBe(8);
  });
  it('фильм 13 и кассета L462 — по времени; подпись по месту', () => {
    const f = parseMedia(read('player', '13'));
    if (f?.kind !== 'timed') throw new Error('не по времени');
    expect(f.dur).toBe(100);
    expect(f.head).toEqual(['Кадр', 'Звук']);
    expect(rowAt(f.rows, 10)?.cells[0]).toContain('Р. Хейл');
    const c = parseMedia(read('locked', 'L462'));
    if (c?.kind !== 'timed') throw new Error('не по времени');
    expect(c.dur).toBe(36);
    expect(rowAt(c.rows, 0)?.cells[0]).toBe('голос 1');
  });
});
