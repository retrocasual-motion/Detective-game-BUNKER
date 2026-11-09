import { describe, expect, it } from 'vitest';
import {
  arrangeWall,
  defaultState,
  GRID_TOP,
  inboxIds,
  onWall,
  reconcile,
  upgradeState,
  WALL_BOUNDS,
} from './layout.ts';
import { PERSONS } from './persons.ts';
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

  it('вид — «Стол»; на стене все 51 материал и все персонажи, записок и нитей нет', () => {
    expect(s.view).toBe('desk');
    expect(s.wall.items).toHaveLength(51 + PERSONS.length);
    expect(s.wall.notes).toEqual([]);
    expect(s.wall.threads).toEqual([]);
  });

  it('персонажи — ряд сверху, материалы — ниже, сеткой по описи; ничего не накрыто', () => {
    const at = new Map(s.wall.items.map((i) => [i.id, i]));
    for (const p of PERSONS) expect(at.get(p.id)?.y).toBe(0);
    expect(at.get('01')?.y).toBe(GRID_TOP);
    expect((at.get('02')?.x ?? 0) > (at.get('01')?.x ?? 0)).toBe(true);
    const keys = s.wall.items.map((i) => `${i.x},${i.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of s.wall.items) {
      expect(i.x).toBeGreaterThan(WALL_BOUNDS.left);
      expect(i.y + 220).toBeLessThan(WALL_BOUNDS.bottom);
    }
  });

  it('одинаковое у всех', () => {
    expect(defaultState(starting)).toEqual(s);
  });
});

describe('«Входящие» на столе', () => {
  const withL = [...starting, mat('L101'), mat('L102')];

  it('открытое по ходу дела само на стену не вешается — ждёт во «Входящих», свежее первым', () => {
    const s = defaultState(withL);
    expect(s.wall.items.some((i) => i.id.startsWith('L'))).toBe(false);
    expect(inboxIds(s, withL)).toEqual(['L102', 'L101']);
  });

  it('повешенное на стену из «Входящих» уходит', () => {
    const s = defaultState(withL);
    s.wall.items.push({ id: 'L101', x: 5, y: 5, z: 999, rot: 0 });
    expect(inboxIds(reconcile(s, withL), withL)).toEqual(['L102']);
  });
});

describe('reconcile', () => {
  it('не меняет корректное состояние', () => {
    const s = defaultState(starting);
    expect(reconcile(s, starting)).toEqual(s);
  });

  it('убирает неизвестное, дубли, записку без места и нити к пропавшему', () => {
    const s: PlayerState = defaultState(starting);
    s.wall.items.push(
      { id: '99', x: 0, y: 0, z: 1, rot: 0 },
      { id: 'n:a', x: 9, y: 9, z: 2, rot: 0 },
    );
    s.wall.notes = [
      { id: 'n:a', kind: 'note', text: 'кто?' },
      { id: 'n:b', kind: 'label', text: 'без места' },
    ];
    s.wall.threads = [
      { id: 't1', from: '01', to: '99', label: '' },
      { id: 't2', from: 'n:a', to: 'p:cole', label: 'x' },
    ];
    const got = reconcile(s, starting);
    expect(got.wall.items.some((i) => i.id === '99')).toBe(false);
    expect(got.wall.notes.map((n) => n.id)).toEqual(['n:a']);
    expect(got.wall.threads.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('upgradeState', () => {
  it('принимает текущую версию', () => {
    const s = defaultState(starting);
    expect(upgradeState(s, starting)).toEqual(s);
  });

  it('версия 4: снятое в поле и нити остаются, остальное — на начальных местах', () => {
    const v4 = {
      version: 4,
      view: 'wall',
      wall: {
        camera: { x: 1, y: 2, zoom: 1 },
        items: [{ materialId: '03', x: 2000, y: 1500, z: 5, rot: 1 }],
        threads: [{ id: 't', from: '03', to: '47', label: 'ключ' }],
        arrivals: [],
      },
    };
    const got = upgradeState(v4, starting);
    expect(got?.view).toBe('wall');
    expect(got?.wall.items.find((i) => i.id === '03')).toMatchObject({ x: 2000, y: 1500 });
    expect(got?.wall.items).toHaveLength(51 + PERSONS.length);
    expect(got?.wall.threads).toHaveLength(1);
  });

  it('версии 1–3 и мусор → null', () => {
    expect(upgradeState({ version: 3, view: 'desk' }, starting)).toBeNull();
    expect(upgradeState('мусор', starting)).toBeNull();
  });
});

describe('край доски', () => {
  it('вещь не уходит за край', () => {
    expect(onWall(-9999, 99999)).toEqual({ x: WALL_BOUNDS.left, y: WALL_BOUNDS.bottom - 80 });
  });
});

describe('разложить по порядку (служебная кнопка)', () => {
  it('стартовые — на начальные места, письма и записки — рядами ниже; нити остаются', () => {
    const mats = [...starting, mat('L214'), mat('M001')];
    const base = defaultState(mats);
    const moved: PlayerState = {
      ...base,
      wall: {
        ...base.wall,
        camera: { x: 999, y: 999, zoom: 1.5 },
        items: [
          ...base.wall.items.map((i) => ({ ...i, x: i.x + 777, y: -i.y, rot: 40 })),
          { id: 'M001', x: 5, y: 5, z: 90, rot: 0 },
          { id: 'L214', x: 6, y: 6, z: 91, rot: 0 },
          { id: 'n1', x: 7, y: 7, z: 92, rot: 0 },
        ],
        notes: [{ id: 'n1', text: 'версия', style: 'note', width: 200 } as never],
        threads: [{ id: 't1', from: '01', to: 'L214' } as never],
      },
    };
    const s = arrangeWall(moved, mats);
    const at = (id: string) => s.wall.items.find((i) => i.id === id);
    for (const i of base.wall.items) expect(at(i.id)).toMatchObject({ x: i.x, y: i.y, rot: i.rot });
    const below = Math.max(...base.wall.items.map((i) => i.y));
    expect(at('L214')?.y).toBeGreaterThan(below);
    expect(at('L214')?.x).toBeLessThan(at('M001')?.x ?? 0);
    expect(at('M001')?.x).toBeLessThan(at('n1')?.x ?? 0);
    expect(s.wall.threads).toEqual(moved.wall.threads);
    expect(s.wall.notes).toEqual(moved.wall.notes);
    expect(s.wall.camera).toEqual(base.wall.camera);
  });
});
