import { defaultState, type PlayerState, WALL_BOUNDS } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import {
  addNote,
  addThread,
  editNote,
  moveItem,
  removeNote,
  removeThread,
  restoreNote,
  restoreThread,
  styleNote,
  takeNote,
} from './wall-actions.ts';

const base = (): PlayerState => defaultState([]);

describe('вещи на стене', () => {
  it('куда отпустили, там и висит; поверх остальных; повторный перенос двигает ту же запись', () => {
    let s = moveItem('01', 10, 20)(base());
    s = moveItem('02', 30, 40)(s);
    s = moveItem('01', 50, 60)(s);
    expect(s.wall.items.filter((i) => i.id === '01')).toHaveLength(1);
    const a = s.wall.items.find((i) => i.id === '01');
    const b = s.wall.items.find((i) => i.id === '02');
    expect([a?.x, a?.y]).toEqual([50, 60]);
    expect((a?.z ?? 0) > (b?.z ?? 0)).toBe(true);
  });

  it('за край доски не уходит', () => {
    const s = moveItem('01', -99999, 99999)(base());
    const a = s.wall.items.find((i) => i.id === '01');
    expect(a?.x).toBe(WALL_BOUNDS.left);
    expect(a?.y).toBeLessThan(WALL_BOUNDS.bottom);
  });
});

describe('записки и ярлыки', () => {
  it('новая записка висит, текст правится; удалить → вернуть — с нитями', () => {
    let s = addNote('note', 100, 100, 'n:1')(base());
    s = editNote('n:1', 'кто звонил в 23:10?')(s);
    s = addThread('n:1', 'p:cole')(s);
    expect(s.wall.notes).toEqual([{ id: 'n:1', kind: 'note', text: 'кто звонил в 23:10?' }]);
    const taken = takeNote('n:1', s);
    if (!taken) throw new Error('нет записки');
    const gone = removeNote('n:1')(s);
    expect(gone.wall.notes).toEqual([]);
    expect(gone.wall.threads).toEqual([]);
    const back = restoreNote(taken)(gone);
    expect(back.wall.notes).toEqual(s.wall.notes);
    expect(back.wall.threads).toEqual(s.wall.threads);
  });

  it('размер шрифта и ширина меняются в пределах', () => {
    let s = addNote('note', 0, 0, 'n:s')(base());
    s = styleNote('n:s', { size: 22, width: 300 })(s);
    expect(s.wall.notes[0]).toMatchObject({ size: 22, width: 300 });
    s = styleNote('n:s', { size: 999, width: 1 })(s);
    expect(s.wall.notes[0]).toMatchObject({ size: 64, width: 80 });
  });

  it('ярлык висит ровно', () => {
    const s = addNote('label', 0, 0, 'n:l')(base());
    expect(s.wall.items.find((i) => i.id === 'n:l')?.rot).toBe(0);
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
    expect(restoreThread(t)(removeThread(t.id)(s)).wall.threads).toEqual(s.wall.threads);
  });
});
