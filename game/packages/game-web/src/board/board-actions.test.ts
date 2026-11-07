import { defaultState, type PlayerState } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import { removeFromBoard, restoreToBoard, takeFromBoard } from './board-actions.ts';

const withBoard = (): PlayerState => {
  const s = defaultState([]);
  s.board.items = [
    { id: 'a', materialId: '01', x: 0, y: 0 },
    { id: 'b', materialId: '03', x: 200, y: 0 },
    { id: 'c', materialId: '05', x: 400, y: 0 },
  ];
  s.board.threads = [
    { id: 't1', from: 'a', to: 'b', label: 'дата' },
    { id: 't2', from: 'b', to: 'c', label: '' },
  ];
  return s;
};

describe('удалить и вернуть', () => {
  it('takeFromBoard отдаёт удаляемую копию вместе с её нитями', () => {
    const taken = takeFromBoard('b', withBoard());
    expect(taken.items.map((i) => i.id)).toEqual(['b']);
    expect(taken.threads.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('копия: удалить → вернуть — доска как была', () => {
    const s = withBoard();
    const taken = takeFromBoard('b', s);
    const back = restoreToBoard(taken)(removeFromBoard('b')(s));
    expect(new Set(back.board.items.map((i) => i.id))).toEqual(new Set(['a', 'b', 'c']));
    expect(back.board.threads.find((t) => t.id === 't1')?.label).toBe('дата');
    expect(back.board.threads).toHaveLength(2);
  });

  it('нить: удалить → вернуть', () => {
    const s = withBoard();
    const taken = takeFromBoard('t1', s);
    expect(taken).toEqual({ items: [], threads: [s.board.threads[0]] });
    const back = restoreToBoard(taken)(removeFromBoard('t1')(s));
    expect(back.board.threads.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('вернуть нить, чья копия уже удалена, нельзя — нить без концов не появляется', () => {
    const s = withBoard();
    const taken = takeFromBoard('t1', s);
    const back = restoreToBoard(taken)(removeFromBoard('a')(removeFromBoard('t1')(s)));
    expect(back.board.threads.map((t) => t.id)).toEqual(['t2']);
  });

  it('повторное «вернуть» не дублирует', () => {
    const s = withBoard();
    const taken = takeFromBoard('b', s);
    const once = restoreToBoard(taken)(removeFromBoard('b')(s));
    expect(restoreToBoard(taken)(once).board.items).toHaveLength(3);
  });
});
