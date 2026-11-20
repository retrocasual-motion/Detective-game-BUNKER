import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { answerFits, scoreVerdict, type VerdictRubric } from './verdict.ts';

const rubric = JSON.parse(
  readFileSync('../../../playtest/packs/v3.4-2026-11-18/gm/verdict.json', 'utf8'),
) as VerdictRubric;

describe('оценка заключения (A-270)', () => {
  it('всё верно — раскрыты и гибель Адама, и программа', () => {
    const s = scoreVerdict(rubric, [
      { person: 'p:moreau' },
      { material: 'L981' },
      { choice: 2 },
      { material: 'L736' },
      { person: 'p:hale' },
    ]);
    expect(s.marks).toEqual(['верно', 'верно', 'верно', 'верно', 'верно']);
    expect(s.groups.map((g) => g.solved)).toEqual([true, true]);
  });

  it('мотив — любой материал со смертью прежнего участника; газета и папка A-24 (L991, PT-4) тоже', () => {
    for (const m of ['L991', 'L619', '15', 'L832', 'L388', 'L957', 'L461', 'L462'])
      expect(scoreVerdict(rubric, [null, { material: m }]).marks[1]).toBe('верно');
    expect(scoreVerdict(rubric, [null, { material: '31' }]).marks[1]).toBe('неверно');
  });

  it('Эмма, «никто» и «намеренно» не засчитываются; пустое — пусто', () => {
    const s = scoreVerdict(rubric, [{ person: 'p:pierce' }, null, { choice: 1 }, null, null]);
    expect(s.marks).toEqual(['неверно', 'пусто', 'неверно', 'пусто', 'пусто']);
    expect(scoreVerdict(rubric, [{ person: 'nobody' }]).marks[0]).toBe('неверно');
    expect(s.groups.every((g) => !g.solved)).toBe(true);
  });

  it('только гибель Адама — программа не раскрыта', () => {
    const s = scoreVerdict(rubric, [
      { person: 'p:moreau' },
      { material: 'L957' },
      { choice: 2 },
      { material: '13' },
      { person: 'p:cole' },
    ]);
    expect(s.groups).toMatchObject([{ solved: true }, { solved: false }]);
  });

  it('ответ не того вида не подходит («никто» — только в первом вопросе)', () => {
    const [who, why, how, , behind] = rubric.questions;
    expect(who && answerFits(who, { person: 'nobody' })).toBe(true);
    expect(behind && answerFits(behind, { person: 'nobody' })).toBe(false);
    expect(why && answerFits(why, { person: 'p:moreau' })).toBe(false);
    expect(how && answerFits(how, { choice: 3 })).toBe(false);
  });
});
