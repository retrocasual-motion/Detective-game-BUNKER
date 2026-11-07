import { describe, expect, it } from 'vitest';
import { defaultState, GRID_DY, reconcile } from './layout.ts';
import type { Material, PlayerState } from './schemas.ts';

const mat = (id: string, placement: Material['placement'] = 'desk'): Material => ({
  id,
  title: `Материал ${id}`,
  placement,
  body: '',
  sourceFile: `${id}__x.md`,
});
const materials: Material[] = [
  ...Array.from({ length: 51 }, (_, i) => String(i + 1).padStart(2, '0')).map((id) =>
    mat(id, ['24', '47', '48', '49', '50'].includes(id) ? 'evidence' : 'desk'),
  ),
];

describe('defaultState', () => {
  const s = defaultState(materials);

  it('кладёт на стол только материалы стола, вид — «Стол», доска пустая', () => {
    expect(s.view).toBe('desk');
    expect(s.desk.items).toHaveLength(46);
    expect(s.board.items).toEqual([]);
    expect(s.board.threads).toEqual([]);
  });

  it('раскладывает сеткой в 10 колонок', () => {
    expect(s.desk.items[0]).toMatchObject({ materialId: '01', x: 0, y: 0 });
    expect(s.desk.items[10]?.y).toBe(GRID_DY);
    expect(s.desk.items[10]?.x).toBe(0);
  });
});

describe('reconcile', () => {
  it('не меняет корректное состояние', () => {
    const s = defaultState(materials);
    expect(reconcile(s, materials)).toEqual(s);
  });

  it('убирает неизвестный материал вместе с его копиями и нитями', () => {
    const s: PlayerState = defaultState(materials);
    s.desk.items.push({ materialId: '99', x: 5000, y: 5000, z: 999 });
    s.board.items.push(
      { id: 'a', materialId: '99', x: 0, y: 0 },
      { id: 'b', materialId: '01', x: 100, y: 0 },
    );
    s.board.threads.push({ id: 't', from: 'a', to: 'b', label: 'x' });
    const r = reconcile(s, materials);
    expect(r.desk.items.some((i) => i.materialId === '99')).toBe(false);
    expect(r.board.items.map((i) => i.id)).toEqual(['b']);
    expect(r.board.threads).toEqual([]);
  });

  it('добавляет недостающий материал в свободную ячейку', () => {
    const s = defaultState(materials);
    const original = s.desk.items.find((i) => i.materialId === '07');
    s.desk.items = s.desk.items.filter((i) => i.materialId !== '07');
    const r = reconcile(s, materials);
    const added = r.desk.items.find((i) => i.materialId === '07');
    expect(added).toMatchObject({ x: original?.x, y: original?.y });
    expect(r.desk.items).toHaveLength(46);
  });
});
