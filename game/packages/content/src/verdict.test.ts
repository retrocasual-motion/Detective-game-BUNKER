import { readdirSync, readFileSync } from 'node:fs';
import { answerLabel, parseVerdictForm } from '@bunker/shared';
import { describe, expect, it } from 'vitest';

const dir = '../../../playtest/packs/v3.3-2026-10-29/locked';
const L999 = readFileSync(
  `${dir}/${readdirSync(dir).find((f: string) => f.startsWith('L999__'))}`,
  'utf8',
);

describe('форма заключения L999 (A-270)', () => {
  const qs = parseVerdictForm(L999);

  it('пять вопросов: человек, материал, вариант, материал, человек', () => {
    expect(qs.map((q) => q.kind)).toEqual(['person', 'material', 'choice', 'material', 'person']);
    expect(qs.map((q) => q.nobody)).toEqual([true, false, false, false, false]);
    expect(qs[0]?.text).toBe('Кто действовал в момент гибели Адама Коула?');
  });

  it('три варианта «как», без «не установлено»', () => {
    expect(qs[2]?.options).toEqual([
      'упал сам, несчастный случай',
      'столкнули намеренно',
      'убили не специально, без умысла',
    ]);
  });

  it('ответ словами', () => {
    expect(answerLabel(qs[0], { person: 'nobody' })).toBe('никто');
    expect(answerLabel(qs[0], { person: 'p:moreau' })).toBe('Лея Моро');
    expect(answerLabel(qs[2], { choice: 2 })).toBe('убили не специально, без умысла');
    expect(answerLabel(qs[1], { card: { file: '15', quote: 'Газета' } })).toBe('15 — «Газета»');
  });
});
