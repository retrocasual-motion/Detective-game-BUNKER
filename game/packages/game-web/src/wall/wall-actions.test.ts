import { defaultState, type PlayerState } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import {
  addThread,
  placeOnField,
  removeThread,
  restoreThread,
  returnToColumn,
} from './wall-actions.ts';

const base = (): PlayerState => defaultState([]);

describe('поле и колонки', () => {
  it('снятый в поле лист — одна запись, поверх остальных; повторный перенос двигает её', () => {
    let s = placeOnField('01', 10, 20)(base());
    s = placeOnField('02', 30, 40)(s);
    s = placeOnField('01', 50, 60)(s);
    expect(s.wall.items.map((i) => [i.materialId, i.x, i.y])).toEqual([
      ['02', 30, 40],
      ['01', 50, 60],
    ]);
    const [a, b] = s.wall.items;
    expect((b?.z ?? 0) > (a?.z ?? 0)).toBe(true);
  });

  it('вернуть в колонку — запись поля исчезает, нити остаются', () => {
    let s = placeOnField('01', 10, 20)(base());
    s = addThread('01', '02')(s);
    s = returnToColumn('01')(s);
    expect(s.wall.items).toEqual([]);
    expect(s.wall.threads).toHaveLength(1);
  });
});

describe('нити', () => {
  it('нить к самому себе и вторая такая же нить не появляются', () => {
    let s = addThread('01', '01')(base());
    s = addThread('01', '02')(s);
    s = addThread('02', '01')(s);
    expect(s.wall.threads).toHaveLength(1);
  });

  it('удалить → вернуть — нить как была', () => {
    const s = addThread('01', '02')(base());
    const t = s.wall.threads[0];
    if (!t) throw new Error('нет нити');
    const back = restoreThread(t)(removeThread(t.id)(s));
    expect(back.wall.threads).toEqual(s.wall.threads);
  });
});
