import { describe, expect, it } from 'vitest';
import { sealedIds } from './archive.ts';
import {
  arrangeWall,
  BOARD_PAD,
  boardCamera,
  CARD_H,
  CARD_W,
  containerLabelId,
  defaultState,
  GRID_TOP,
  inboxIds,
  onWall,
  openAll,
  openContainer,
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
// Как в контенте: 01…51 без 16 (лента объявлений снята, A-262).
const starting: Material[] = Array.from({ length: 52 }, (_, i) => String(i + 1).padStart(2, '0'))
  .filter((id) => id !== '16')
  .map((id) => mat(id, ['24', '47', '48', '49', '50'].includes(id) ? 'evidence' : 'desk'));

describe('defaultState', () => {
  const s = defaultState(starting);

  it('вид — «Стол»; на стене персонажи и 01–07, остальное в конвертах (A-260)', () => {
    expect(s.view).toBe('desk');
    expect(s.opened).toEqual([]);
    expect(s.wall.items.map((i) => i.id).filter((id) => /^\d/.test(id))).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
    ]);
    expect(s.wall.items).toHaveLength(7 + PERSONS.length);
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
  const withL = [...starting, mat('L945'), mat('L946')];

  it('открытое по ходу дела само на стену не вешается — ждёт во «Входящих», свежее первым', () => {
    const s = defaultState(withL);
    expect(s.wall.items.some((i) => i.id.startsWith('L'))).toBe(false);
    expect(inboxIds(s, withL)).toEqual(['L946', 'L945']);
  });

  it('повешенное на стену из «Входящих» уходит', () => {
    const s = defaultState(withL);
    s.wall.items.push({ id: 'L945', x: 5, y: 5, z: 999, rot: 0 });
    expect(inboxIds(reconcile(s, withL), withL)).toEqual(['L946']);
  });

  it('сайты дела (A-272) во «Входящие» не ложатся: они в браузере игрока', () => {
    const web = [...withL, mat('L101'), mat('L620')];
    expect(inboxIds(defaultState(web), web)).toEqual(['L946', 'L945']);
  });
});

describe('reconcile', () => {
  it('обрывок висит, только если вынут; сложенные половины не возвращаются (WL-A, MG-A)', () => {
    const withL = [...starting, mat('L990')];
    const s: PlayerState = defaultState(withL);
    s.wall.items.push({ id: 'S:42/1', x: 0, y: 0, z: 90, rot: 0 });
    expect(reconcile(s, withL).wall.items.some((i) => i.id === 'S:42/1')).toBe(false);
    const taken = reconcile({ ...s, pieces: ['42/1'] }, withL);
    expect(taken.wall.items.some((i) => i.id === 'S:42/1')).toBe(true);
    const joined = reconcile(
      {
        ...taken,
        joined: ['L990'],
        wall: {
          ...taken.wall,
          items: [...taken.wall.items, { id: 'L990', x: 0, y: 0, z: 91, rot: 0 }],
        },
      },
      withL,
    );
    const ids = joined.wall.items.map((i) => i.id);
    expect(ids).toContain('L990');
    expect(ids).not.toContain('51');
    expect(ids).not.toContain('S:42/1');
  });

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
    // Все стартовые, кроме конверта с диском (52, A-272), — на стене.
    expect(got?.wall.items).toHaveLength(starting.length - 1 + PERSONS.length);
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
  it('стартовые — на начальные места, пришедшее и записки — рядами правее сетки (WB-C); нити остаются', () => {
    const mats = [...starting, mat('L214'), mat('L215')];
    const base = defaultState(mats);
    const moved: PlayerState = {
      ...base,
      wall: {
        ...base.wall,
        camera: { x: 999, y: 999, zoom: 1.5 },
        items: [
          ...base.wall.items.map((i) => ({ ...i, x: i.x + 777, y: -i.y, rot: 40 })),
          { id: 'L215', x: 5, y: 5, z: 90, rot: 0 },
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
    const right = Math.max(...base.wall.items.map((i) => i.x)) + CARD_W;
    expect(at('L214')?.x).toBeGreaterThan(right);
    expect(at('n1')?.x ?? 0).toBeLessThanOrEqual(WALL_BOUNDS.right - CARD_W);
    expect(at('L214')?.x).toBeLessThan(at('L215')?.x ?? 0);
    expect(at('L215')?.x).toBeLessThan(at('n1')?.x ?? 0);
    expect(s.wall.threads).toEqual(moved.wall.threads);
    expect(s.wall.notes).toEqual(moved.wall.notes);
    expect(s.wall.camera).toEqual(moved.wall.camera);
  });
});

describe('конверт с диском сервера (A-272)', () => {
  it('52 на стене не висит: ни со старта, ни из старого сохранения, ни при «всё вскрыто»', () => {
    const s = defaultState(starting);
    expect(s.wall.items.some((i) => i.id === '52')).toBe(false);
    const hung = {
      ...s,
      wall: { ...s.wall, items: [...s.wall.items, { id: '52', x: 0, y: 0, z: 1, rot: 0 }] },
    };
    expect(reconcile(hung, starting).wall.items.some((i) => i.id === '52')).toBe(false);
    const legacy = { ...s, opened: undefined };
    expect(reconcile(legacy, starting).wall.items.some((i) => i.id === '52')).toBe(false);
  });
});

describe('конверты архива (A-260)', () => {
  const s = defaultState(starting);

  it('вскрытие: содержимое — на стену группой под ярлыком, ничего не накрыто', () => {
    const o = openContainer(s, starting, 'protocols');
    expect(o.opened).toEqual(['protocols']);
    const ids = ['30', '31', '32', '33', '34', '35', '36'];
    const label = o.wall.items.find((i) => i.id === containerLabelId('protocols'));
    expect(o.wall.notes.find((n) => n.id === containerLabelId('protocols'))?.text).toBe(
      'Протоколы опроса',
    );
    const placed = o.wall.items.filter((i) => ids.includes(i.id));
    expect(placed).toHaveLength(7);
    for (const i of placed) expect(i.y).toBeGreaterThan(label?.y ?? 0);
    const others = o.wall.items.filter((i) => !ids.includes(i.id) && i.id !== label?.id);
    for (const a of placed)
      for (const b of others)
        expect(Math.abs(a.x - b.x) >= 160 || Math.abs(a.y - b.y) >= 220).toBe(true);
    // Повторно — без изменений; reconcile не трогает разложенное.
    expect(openContainer(o, starting, 'protocols')).toBe(o);
    expect(reconcile(o, starting).wall.items).toEqual(o.wall.items);
  });

  it('устройства приходят с конвертом места; невскрытое не видно', () => {
    expect(sealedIds(s).has('48')).toBe(true);
    const o = openContainer(s, starting, 'scene');
    expect(sealedIds(o).has('48')).toBe(false);
    expect(o.wall.items.some((i) => i.id === '48')).toBe(true);
    expect(sealedIds(o).has('30')).toBe(true);
  });

  it('вскрыть всё — стартовая сетка без газеты и закладок; старое сохранение — всё вскрыто', () => {
    const all = openAll(s, starting);
    const onWall = new Set(all.wall.items.map((i) => i.id));
    expect(onWall.has('25')).toBe(true);
    expect(['15', '16', '17'].some((id) => onWall.has(id))).toBe(false);
    const { opened: _, ...legacy } = s;
    expect(sealedIds({ opened: undefined }).size).toBe(0);
    expect(reconcile(legacy, starting).wall.items.some((i) => i.id === '15')).toBe(true);
  });
});

describe('вся доска со стола и у стены (WB-C, ZM-B)', () => {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1681, height: 761 },
  ])
    it(`пробка целиком и по центру — ${vp.width}×${vp.height}`, () => {
      const cam = boardCamera(vp);
      const left = WALL_BOUNDS.left * cam.zoom + cam.x;
      const right = WALL_BOUNDS.right * cam.zoom + cam.x;
      const top = WALL_BOUNDS.top * cam.zoom + cam.y;
      const bottom = WALL_BOUNDS.bottom * cam.zoom + cam.y;
      expect(left).toBeGreaterThanOrEqual(BOARD_PAD - 0.01);
      expect(top).toBeGreaterThanOrEqual(BOARD_PAD - 0.01);
      expect(vp.width - right).toBeCloseTo(left, 0);
      expect(vp.height - bottom).toBeCloseTo(top, 0);
      // По одной стороне — вплотную к полю: доска не мельче нужного.
      expect(Math.min(left, top)).toBeCloseTo(BOARD_PAD, 0);
      // Карточку видно: на 1366×768 — не меньше ~40 px в ширину (дальше — колесом).
      expect(CARD_W * cam.zoom).toBeGreaterThan(40);
    });
});

describe('группы конвертов ложатся на доску при любом порядке вскрытия (WB-C)', () => {
  const ids = ['protocols', 'scene', 'bunker', 'personal'] as const;
  const perms = (a: readonly string[]): string[][] =>
    a.length <= 1
      ? [[...a]]
      : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
  for (const order of perms(ids))
    it(order.join(' → '), () => {
      let s = defaultState(starting);
      for (const id of order) s = openContainer(s, starting, id as (typeof ids)[number]);
      const cards = s.wall.items.filter((i) => !i.id.startsWith('n:'));
      for (const i of s.wall.items) {
        expect(i.x).toBeGreaterThanOrEqual(WALL_BOUNDS.left);
        expect(i.y).toBeGreaterThanOrEqual(WALL_BOUNDS.top);
        expect(i.y + CARD_H).toBeLessThanOrEqual(WALL_BOUNDS.bottom);
      }
      for (const i of cards) expect(i.x + CARD_W).toBeLessThanOrEqual(WALL_BOUNDS.right);
      // Карточки не накрывают друг друга.
      for (const [k, a] of cards.entries())
        for (const b of cards.slice(k + 1))
          expect(
            a.x < b.x + CARD_W && b.x < a.x + CARD_W && a.y < b.y + CARD_H && b.y < a.y + CARD_H,
            `${a.id} и ${b.id}`,
          ).toBe(false);
    });
});

describe('старое сохранение на большой доске (WB-C)', () => {
  it('висевшее за новым краем — у края, на пробке', () => {
    const s = defaultState(starting);
    const far = {
      ...s,
      wall: {
        ...s.wall,
        items: s.wall.items.map((i, k) => (k === 0 ? { ...i, x: 9000, y: 9000 } : i)),
      },
    };
    const first = reconcile(far, starting).wall.items[0];
    expect(first?.x).toBeLessThanOrEqual(WALL_BOUNDS.right - 80);
    expect(first?.y).toBeLessThanOrEqual(WALL_BOUNDS.bottom - 80);
  });
});
