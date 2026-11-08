import { describe, expect, it } from 'vitest';
import {
  CARD_H,
  COL_W,
  defaultState,
  isOverOwnColumn,
  reconcile,
  SHINGLE_STEP,
  upgradeState,
  wallColumns,
  wallLayout,
} from './layout.ts';
import type { Material, PlayerState } from './schemas.ts';

const mat = (id: string, placement: Material['placement'] = 'desk'): Material => ({
  id,
  title: `Материал ${id}`,
  placement,
  kind: 'sheet',
  body: '',
  sourceFile: `${id}__x.md`,
});
const starting: Material[] = Array.from({ length: 51 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
).map((id) => mat(id, ['24', '47', '48', '49', '50'].includes(id) ? 'evidence' : 'desk'));

describe('defaultState', () => {
  const s = defaultState(starting);

  it('вид — «Стол», поле пустое, нитей и поступлений нет', () => {
    expect(s.view).toBe('desk');
    expect(s.wall.items).toEqual([]);
    expect(s.wall.threads).toEqual([]);
    expect(s.wall.arrivals).toEqual([]);
  });

  it('одинаковое у всех', () => {
    expect(defaultState(starting)).toEqual(s);
  });
});

describe('колонки «как пришло» (HANG-A)', () => {
  const columns = wallColumns(starting, []);
  const layout = wallLayout(columns);

  it('все 51 стартовый материал висят ровно в одной колонке, по порядку описи', () => {
    const ids = columns.flatMap((c) => c.ids);
    expect(ids).toHaveLength(51);
    expect(new Set(ids).size).toBe(51);
    expect(ids).toEqual([...ids].sort());
  });

  it('подписи колонок — только номера описи', () => {
    expect(columns[0]?.title).toBe('Опись № 1–5');
    for (const c of columns) expect(c.title).toMatch(/^Опись № \d+–\d+$/);
  });

  it('лесенка: каждый следующий лист ниже на шаг и лежит поверх', () => {
    const a = layout.slots.get('22');
    const b = layout.slots.get('23');
    expect(a && b && b.y - a.y).toBe(SHINGLE_STEP);
    expect(a && b && b.z > a.z).toBe(true);
    expect(a?.x).toBe(b?.x);
  });

  it('колонки не заходят друг на друга, поле — ниже колонок', () => {
    const xs = layout.columns.filter((c) => c.y === 0).map((c) => c.x);
    for (let i = 1; i < xs.length; i++) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBe(COL_W);
    for (const c of layout.columns) expect(c.y + c.h).toBeLessThanOrEqual(layout.bandBottom);
    expect(layout.fieldTop).toBeGreaterThan(layout.bandBottom);
    expect(layout.bounds.bottom).toBeGreaterThan(layout.fieldTop + CARD_H);
  });

  it('лист, отпущенный у своей колонки, возвращается; в поле — нет', () => {
    const s = layout.slots.get('31');
    expect(s && isOverOwnColumn(layout, '31', s.x + 10, s.y + 30)).toBe(true);
    expect(isOverOwnColumn(layout, '31', 0, layout.fieldTop + 200)).toBe(false);
  });
});

describe('поступления (IN-B)', () => {
  const withL = [...starting, mat('L101'), mat('L102')];

  it('открытое по ходу дела вешается новой колонкой «Поступление № 1»', () => {
    const s = defaultState(withL);
    expect(s.wall.arrivals).toEqual([{ ids: ['L101', 'L102'] }]);
    const cols = wallColumns(withL, s.wall.arrivals);
    expect(cols.at(-1)).toMatchObject({ title: 'Поступление № 1', ids: ['L101', 'L102'] });
  });

  it('следующее поступление — следующая колонка, прежние не трогаются', () => {
    const s1 = defaultState(withL);
    const s2 = reconcile(s1, [...withL, mat('L205')]);
    expect(s2.wall.arrivals).toEqual([{ ids: ['L101', 'L102'] }, { ids: ['L205'] }]);
  });

  it('одиннадцатая колонка начинает новый ряд', () => {
    const arrivals = ['L101', 'L102', 'L103'].map((id) => ({ ids: [id] }));
    const mats = [...starting, ...['L101', 'L102', 'L103'].map((id) => mat(id))];
    const layout = wallLayout(wallColumns(mats, arrivals));
    const second = layout.columns[10];
    expect(second?.x).toBe(0);
    expect(second?.y).toBeGreaterThan(0);
  });
});

describe('reconcile', () => {
  it('не меняет корректное состояние', () => {
    const s = defaultState(starting);
    expect(reconcile(s, starting)).toEqual(s);
  });

  it('убирает неизвестный материал, его нити и дубли', () => {
    const s: PlayerState = defaultState(starting);
    s.wall.items = [
      { materialId: '99', x: 0, y: 0, z: 1, rot: 0 },
      { materialId: '01', x: 5, y: 5, z: 2, rot: 0 },
      { materialId: '01', x: 9, y: 9, z: 3, rot: 0 },
    ];
    s.wall.threads = [
      { id: 't1', from: '01', to: '99', label: '' },
      { id: 't2', from: '01', to: '02', label: 'x' },
      { id: 't3', from: '02', to: '02', label: '' },
    ];
    const got = reconcile(s, starting);
    expect(got.wall.items.map((i) => [i.materialId, i.x])).toEqual([['01', 5]]);
    expect(got.wall.threads.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('upgradeState', () => {
  it('принимает текущую версию', () => {
    const s = defaultState(starting);
    expect(upgradeState(s, starting)).toEqual(s);
  });

  it('стол сверху и доска с копиями (версия 3) — раскладка начинается заново', () => {
    expect(upgradeState({ version: 3, view: 'desk' }, starting)).toBeNull();
    expect(upgradeState('мусор', starting)).toBeNull();
  });
});
