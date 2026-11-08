import { describe, expect, it } from 'vitest';
import { DESK_BOUNDS, defaultState, reconcile, SCATTER_ROT_MAX, upgradeState } from './layout.ts';
import type { Material, PlayerState } from './schemas.ts';

const mat = (id: string, placement: Material['placement'] = 'desk'): Material => ({
  id,
  title: `Материал ${id}`,
  placement,
  kind: 'sheet',
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

  it('россыпь одинаковая у всех: два вызова дают одно и то же', () => {
    expect(defaultState(materials)).toEqual(s);
  });

  it('бумаги слегка повёрнуты, повороты разные и в пределах ±SCATTER_ROT_MAX', () => {
    const rots = s.desk.items.map((i) => i.rot);
    for (const r of rots) expect(Math.abs(r)).toBeLessThanOrEqual(SCATTER_ROT_MAX);
    expect(new Set(rots.map((r) => r.toFixed(1))).size).toBeGreaterThan(20);
  });

  it('не ровная сетка: строки сдвинуты и разбросаны', () => {
    const xs = new Set(s.desk.items.map((i) => Math.round(i.x)));
    expect(xs.size).toBeGreaterThan(30);
  });

  it('ни одна бумага не закрыта другой целиком: центры разнесены', () => {
    const items = s.desk.items;
    for (const a of items)
      for (const b of items) {
        if (a === b) continue;
        const far = Math.abs(a.x - b.x) >= 100 || Math.abs(a.y - b.y) >= 150;
        expect(far, `${a.materialId} и ${b.materialId}`).toBe(true);
      }
  });
});

describe('столешница (UX-B1)', () => {
  it('вся начальная россыпь лежит на столе с отступом от края', () => {
    for (const i of defaultState(materials).desk.items) {
      expect(i.x).toBeGreaterThan(DESK_BOUNDS.left + 100);
      expect(i.y).toBeGreaterThan(DESK_BOUNDS.top + 100);
      expect(i.x + 200).toBeLessThan(DESK_BOUNDS.right);
      expect(i.y + 260).toBeLessThan(DESK_BOUNDS.bottom);
    }
  });

  it('сдвиг рядов разный — не «через один»', () => {
    const items = defaultState(materials).desk.items;
    const firstX = [0, 10, 20, 30, 40].map((k) => items[k]?.x ?? 0);
    expect(new Set(firstX.map((x) => Math.round(x / 20))).size).toBeGreaterThan(3);
  });
});

describe('upgradeState', () => {
  it('принимает текущую версию как есть', () => {
    const s = defaultState(materials);
    expect(upgradeState(s, materials)).toEqual(s);
  });

  it('версия 1: стол раскладывается заново, доска и вид сохраняются', () => {
    const board = {
      camera: { x: 10, y: 20, zoom: 1.5 },
      items: [{ id: 'a', materialId: '01', x: 1, y: 2 }],
      threads: [],
    };
    const v1 = {
      version: 1,
      view: 'right',
      desk: { camera: { x: 0, y: 0, zoom: 1 }, items: [{ materialId: '01', x: 0, y: 0, z: 1 }] },
      board,
    };
    const up = upgradeState(v1, materials);
    expect(up?.version).toBe(3);
    expect(up?.view).toBe('right');
    expect(up?.board).toEqual(board);
    expect(up?.desk).toEqual(defaultState(materials).desk);
  });

  it('версия 2 (россыпь 1b): стол раскладывается заново, доска и вид сохраняются', () => {
    const cur = defaultState(materials);
    const board = { camera: { x: 1, y: 2, zoom: 1 }, items: [], threads: [] };
    const v2 = {
      ...cur,
      version: 2,
      view: 'left',
      desk: { camera: cur.desk.camera, items: [{ materialId: '01', x: 9, y: 9, z: 1, rot: 0 }] },
      board,
    };
    const up = upgradeState(v2, materials);
    expect(up?.version).toBe(3);
    expect(up?.view).toBe('left');
    expect(up?.board).toEqual(board);
    expect(up?.desk).toEqual(cur.desk);
  });

  it('мусор → null', () => {
    expect(upgradeState({ version: 7 }, materials)).toBeNull();
    expect(upgradeState(null, materials)).toBeNull();
  });
});

describe('reconcile', () => {
  it('не меняет корректное состояние', () => {
    const s = defaultState(materials);
    expect(reconcile(s, materials)).toEqual(s);
  });

  it('убирает неизвестный материал вместе с его копиями и нитями', () => {
    const s: PlayerState = defaultState(materials);
    s.desk.items.push({ materialId: '99', x: 5000, y: 5000, z: 999, rot: 0 });
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
    expect(added).toMatchObject({ x: original?.x, y: original?.y, rot: original?.rot });
    expect(r.desk.items).toHaveLength(46);
  });
});
