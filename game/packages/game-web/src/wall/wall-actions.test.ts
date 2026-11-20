import { defaultState, type PlayerState, WALL_BOUNDS } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import {
  addNote,
  addThread,
  editNote,
  moveItem,
  moveItems,
  removeNote,
  removeThread,
  restoreNote,
  restoreThread,
  styleNote,
  takeNote,
} from './wall-actions.ts';

const base = (): PlayerState => defaultState([]);

describe('выделенные вещи — вместе (MS-D)', () => {
  it('сдвигаются на одно и то же, остальные на месте; группа поверх, порядок внутри прежний', () => {
    let s = moveItem('01', 100, 100)(base());
    s = moveItem('02', 300, 100)(s);
    s = moveItem('03', 500, 500)(s);
    const z01 = s.wall.items.find((i) => i.id === '01')?.z ?? 0;
    const z02 = s.wall.items.find((i) => i.id === '02')?.z ?? 0;
    s = moveItems(['02', '01'], 40, -20)(s);
    const at = (id: string) => s.wall.items.find((i) => i.id === id);
    expect([at('01')?.x, at('01')?.y]).toEqual([140, 80]);
    expect([at('02')?.x, at('02')?.y]).toEqual([340, 80]);
    expect([at('03')?.x, at('03')?.y]).toEqual([500, 500]);
    expect(at('01')?.z).toBeGreaterThan(at('03')?.z ?? 0);
    expect((at('02')?.z ?? 0) - (at('01')?.z ?? 0)).toBe(Math.sign(z02 - z01));
  });

  it('у края доски каждая вещь останавливается сама', () => {
    let s = moveItem('01', 0, 0)(base());
    s = moveItem('02', 400, 0)(s);
    s = moveItems(['01', '02'], -99999, 0)(s);
    expect(s.wall.items.find((i) => i.id === '01')?.x).toBe(WALL_BOUNDS.left);
    expect(s.wall.items.find((i) => i.id === '02')?.x).toBe(WALL_BOUNDS.left);
  });
});

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
