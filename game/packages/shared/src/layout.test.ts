import { describe, expect, it } from 'vitest';
import { NEWSPAPER_AT, NEWSPAPER_ID, START_STACK, sealedIds } from './archive.ts';
import {
  addExcerpt,
  arrangeWall,
  BOARD_PAD,
  boardCamera,
  CARD_H,
  CARD_W,
  containerLabelId,
  defaultState,
  fileFromDesk,
  GRID_TOP,
  hangFromDesk,
  inboxIds,
  inventoryFiles,
  markLooked,
  onWall,
  openAll,
  openContainer,
  readSaved,
  reconcile,
  removeExcerpt,
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

  it('ST-B: вид — «Стол»; на стене только персонажи; 01–07 — стопкой на столе, письмо 01 сверху', () => {
    expect(s.view).toBe('desk');
    expect(s.opened).toEqual([]);
    expect(s.wall.items.map((i) => i.id).filter((id) => /^\d/.test(id))).toEqual([]);
    expect(s.wall.items).toHaveLength(PERSONS.length);
    expect(s.wall.notes).toEqual([]);
    expect(s.wall.threads).toEqual([]);
    const stack = (s.desk ?? []).filter((d) => START_STACK.includes(d.id));
    expect(stack.map((d) => d.id)).toEqual([...START_STACK]);
    // Место решит стол; порядок укладки растёт — последний по описи снизу… первый (01) сверху стопки
    // кладёт стол: он переворачивает порядок высыпанного (Desk.tsx).
    expect(stack.every((d) => d.x === undefined)).toBe(true);
  });

  it('персонажи — ряд сверху, ничего не накрыто', () => {
    const at = new Map(s.wall.items.map((i) => [i.id, i]));
    for (const p of PERSONS) expect(at.get(p.id)?.y).toBe(0);
    const keys = s.wall.items.map((i) => `${i.x},${i.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of s.wall.items) {
      expect(i.x).toBeGreaterThan(WALL_BOUNDS.left);
      expect(i.y + 220).toBeLessThan(WALL_BOUNDS.bottom);
    }
  });

  it('ST-B: прочитали стартовые со стола — на стену на начальные места, сеткой по описи', () => {
    const r = fileFromDesk(s, ['01', '02']);
    const at = new Map(r.wall.items.map((i) => [i.id, i]));
    expect(at.get('01')?.y).toBe(GRID_TOP);
    expect((at.get('02')?.x ?? 0) > (at.get('01')?.x ?? 0)).toBe(true);
    expect(r.desk?.some((d) => d.id === '01' || d.id === '02')).toBe(false);
    expect(r.desk?.some((d) => d.id === '03')).toBe(true);
  });

  it('ST-B: «вскрыть всё» — стартовые на стене, как до конвертов', () => {
    const r = openAll(s, starting);
    expect(r.wall.items.some((i) => i.id === '01')).toBe(true);
    expect(r.desk?.some((d) => START_STACK.includes(d.id))).toBe(false);
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
    expect(inboxIds(s, withL)).toEqual(['L946', 'L945', NEWSPAPER_ID]);
  });

  it('свойства файла записи во «Входящие» не ложатся — они у плеера (Q.1, автор 21.11)', () => {
    const props = [
      ...withL,
      { ...mat('L971'), title: 'Свойства файла: вводный фильм VAULTLINE (файл 13)' },
      { ...mat('L970'), title: 'Свойства файлов: ролики-знакомства (файл 14)' },
    ];
    expect(inboxIds(defaultState(props), props)).toEqual(['L946', 'L945', NEWSPAPER_ID]);
  });

  it('повешенное на стену из «Входящих» уходит', () => {
    const s = defaultState(withL);
    s.wall.items.push({ id: 'L945', x: 5, y: 5, z: 999, rot: 0 });
    expect(inboxIds(reconcile(s, withL), withL)).toEqual(['L946', NEWSPAPER_ID]);
  });

  it('сайты дела (A-272) во «Входящие» не ложатся: они в браузере игрока', () => {
    const web = [...withL, mat('L101'), mat('L620')];
    expect(inboxIds(defaultState(web), web)).toEqual(['L946', 'L945', NEWSPAPER_ID]);
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
        // Нить к листу; к устройству (47) нити нет — устройства на столе (DEVICES_ON_WALL).
        threads: [{ id: 't', from: '03', to: '08', label: 'ключ' }],
        arrivals: [],
      },
    };
    const got = upgradeState(v4, starting);
    expect(got?.view).toBe('wall');
    expect(got?.wall.items.find((i) => i.id === '03')).toMatchObject({ x: 2000, y: 1500 });
    // Все стартовые, кроме конверта с диском (52, A-272) и пяти устройств (на столе, 3D-стол), —
    // на стене (сохранение до конвертов: газета, как и прежде, тоже на стене).
    expect(got?.desk?.map((d) => d.id).sort()).toEqual(['24', '47', '48', '49', '50']);
    expect(got?.wall.items).toHaveLength(starting.length - 6 + PERSONS.length);
    expect(got?.wall.threads).toHaveLength(1);
  });

  it('версии 1–3 и мусор → null', () => {
    expect(upgradeState({ version: 3, view: 'desk' }, starting)).toBeNull();
    expect(upgradeState('мусор', starting)).toBeNull();
  });

  it('RV-49: одно неизвестное значение выпадает одно, остальное дело остаётся', () => {
    const s = defaultState(starting);
    const raw = {
      ...s,
      opened: ['scene', 'нет-такого-конверта'],
      notebookPages: ['первая', 7, 'третья'],
      radio: { pos: 10, marks: Array.from({ length: 60 }, (_, i) => ({ t: i, label: `м${i}` })) },
      notebook: 'х'.repeat(25_000),
      wall: {
        ...s.wall,
        items: [...s.wall.items, { id: '03', x: 'вдоль', y: 0, z: 1, rot: 0 }],
        camera: { x: 0, y: 0, zoom: 99 },
      },
      somethingNew: true,
    };
    const { state, dropped } = readSaved(raw, starting);
    expect(state).not.toBeNull();
    // Неизвестный конверт выпадает один.
    expect(state?.opened).toEqual(['scene']);
    expect(state?.notebookPages).toEqual(['первая', 'третья']);
    expect(state?.radio?.marks).toHaveLength(50);
    expect(state?.notebook).toHaveLength(20_000);
    expect(state?.wall.items).toHaveLength(s.wall.items.length);
    expect(state?.wall.camera.zoom).toBeLessThanOrEqual(3);
    expect(dropped.length).toBeGreaterThan(0);
  });

  it('RV-49: версия новее текущей (откат сборки) — понятое читается', () => {
    const s = defaultState(starting);
    const got = readSaved({ ...s, version: 99, view: 'wall', future: { a: 1 } }, starting);
    expect(got.state?.view).toBe('wall');
    expect(got.state?.version).toBe(s.version);
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

  it('BOX-B: коробка «Личные вещи» вскрыта — пакеты в ней: не на стене и не на столе', () => {
    const o = openContainer(s, starting, 'personal');
    expect(o.opened).toEqual(['personal']);
    const ids = ['40', '41', '42', '43', '44', '45', '46'];
    expect(o.wall.items.some((i) => ids.includes(i.id))).toBe(false);
    expect(o.desk?.some((d) => ids.includes(d.id))).toBe(false);
    // reconcile их на стену не вешает; повторно — без изменений.
    expect(reconcile(o, starting).wall.items.some((i) => ids.includes(i.id))).toBe(false);
    expect(openContainer(o, starting, 'personal')).toBe(o);
  });

  it('OPS-A: опись — отдельно на столе; прочитали — на стену не уходит, на стену не вешается', () => {
    expect(s.desk?.some((d) => d.id === '04')).toBe(true);
    const r = fileFromDesk(s, ['04', '01']);
    expect(r.desk?.some((d) => d.id === '04')).toBe(true);
    expect(r.wall.items.some((i) => i.id === '04')).toBe(false);
    expect(hangFromDesk(s, '04', 0, 0)).toBe(s);
  });

  it('3D-стол: конверт высыпается на стол — не на стену и не во «Входящие»', () => {
    const o = openContainer(s, starting, 'protocols');
    expect(o.opened).toEqual(['protocols']);
    const ids = ['30', '31', '32', '33', '34', '35', '36'];
    // Газета лежит на столе с начала дела (автор 25.11), высыпанное — поверх.
    // Газета — во «Входящих» (автор 26.11), не на столе.
    expect(o.desk?.some((d) => d.id === NEWSPAPER_ID)).toBe(false);
    expect(inboxIds(o, starting)).toContain(NEWSPAPER_ID);
    // Поверх газеты и стартовой стопки (ST-B).
    const spilled = o.desk?.filter((d) => ids.includes(d.id));
    expect(spilled?.map((d) => d.id)).toEqual(ids);
    // Места ещё нет — разложит стол; порядок укладки растёт.
    expect(spilled?.every((d) => d.x === undefined && d.z === undefined)).toBe(true);
    expect(spilled?.map((d) => d.layer)).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(o.wall.items.some((i) => ids.includes(i.id))).toBe(false);
    expect(o.wall.notes.some((n) => n.id === containerLabelId('protocols'))).toBe(false);
    expect(inboxIds(o, starting).some((id) => ids.includes(id))).toBe(false);
    // Перезагрузка: стол на месте, на стену само не вешается.
    const r = reconcile(o, starting);
    expect(r.desk).toEqual(o.desk);
    expect(r.wall.items.some((i) => ids.includes(i.id))).toBe(false);
    expect(openContainer(o, starting, 'protocols')).toBe(o);
  });

  it('FM-B: папка «Осмотр места» — листы на стол; устройства — в пакете «Изъятое», пока его не вскрыли', () => {
    expect(sealedIds(s).has('48')).toBe(true);
    const o = openContainer(s, starting, 'scene');
    const desk = () => new Set(o.desk?.map((d) => d.id));
    for (const id of ['22', '18', '51']) expect(desk().has(id)).toBe(true);
    // Устройства — ещё в пакете: не видны, не на столе.
    expect(sealedIds(o).has('48')).toBe(true);
    for (const id of ['24', '47', '48', '49', '50']) expect(desk().has(id)).toBe(false);
    expect(reconcile(o, starting).opened).toEqual(['scene']);
    const b = openContainer(o, starting, 'seized');
    expect(sealedIds(b).has('48')).toBe(false);
    const onDesk = new Set(b.desk?.map((d) => d.id));
    for (const id of ['24', '47', '48', '49', '50']) expect(onDesk.has(id)).toBe(true);
    expect(b.wall.notes.some((n) => n.id === containerLabelId('scene'))).toBe(false);
    for (const id of ['22', '47', '48']) expect(b.wall.items.some((i) => i.id === id)).toBe(false);
    expect(sealedIds(b).has('30')).toBe(true);
  });

  // Сохранение версии 5 (до FM-B): догадка про пакет — один раз, при переводе в 6 (RV-54).
  const v5 = (x: PlayerState) =>
    reconcile(readSaved({ ...x, version: 5 }, starting).state as PlayerState, starting);

  it('FM-B: сохранение до пакета — «Осмотр места» вскрыт с устройствами: пакет тоже вскрыт', () => {
    const { desk: _, ...before3d } = { ...s, opened: ['scene' as const] };
    expect(v5(before3d).opened).toEqual(['scene', 'seized']);
    const onDesk = { ...s, opened: ['scene' as const], desk: [{ id: '47', layer: 1 }] };
    expect(v5(onDesk).opened).toEqual(['scene', 'seized']);
  });

  it('RV-54: версия 6 — без догадки: «Осмотр места» вскрыт, а пакет нет — пакет закрыт', () => {
    const { desk: _, ...noDesk } = { ...s, opened: ['scene' as const] };
    expect(reconcile(noDesk, starting).opened).toEqual(['scene']);
  });

  it('3D-стол: устройство на стене (старое сохранение) — уходит на стол; невскрытое — нет', () => {
    const o = openContainer(s, starting, 'scene');
    const hung = {
      ...o,
      desk: o.desk?.filter((d) => d.id !== '47'),
      wall: { ...o.wall, items: [...o.wall.items, { id: '47', x: 10, y: 10, z: 99, rot: 0 }] },
    };
    const r = v5(hung);
    expect(r.wall.items.some((i) => i.id === '47')).toBe(false);
    expect(r.desk?.some((d) => d.id === '47' && d.x === undefined)).toBe(true);
    // Конверт места не вскрыт — устройств на столе нет, только стартовая стопка и опись.
    expect(reconcile(s, starting).desk?.map((d) => d.id)).toEqual([...START_STACK, '04']);
  });

  it('DC-B: прочитанное со стола — на стену группой под ярлыком конверта; вторая порция — без второго ярлыка', () => {
    const o = openContainer(s, starting, 'protocols');
    const label = containerLabelId('protocols');
    const a = fileFromDesk(o, ['31', '30']);
    expect(a.desk?.some((d) => ['30', '31'].includes(d.id))).toBe(false);
    expect(a.desk?.some((d) => d.id === '32')).toBe(true);
    const wall = a.wall.items.map((i) => i.id);
    // Порядок — как в конверте; ярлык — над группой.
    expect(wall.slice(-3)).toEqual([label, '30', '31']);
    expect(a.wall.notes.filter((n) => n.id === label)).toHaveLength(1);
    const b = fileFromDesk(a, ['32', 'нет-такого']);
    expect(b.wall.items.filter((i) => i.id === label)).toHaveLength(1);
    expect(b.wall.items.some((i) => i.id === '32')).toBe(true);
    // Новое не ложится на прежнее.
    const at = (st: typeof b, id: string) => st.wall.items.find((i) => i.id === id);
    expect(at(b, '32')).not.toMatchObject({ x: at(b, '30')?.x, y: at(b, '30')?.y });
    expect(reconcile(b, starting).wall.items.some((i) => i.id === '32')).toBe(true);
  });

  it('3D-стол: со стола на стену — висит там, где отпустили, со стола уходит', () => {
    const o = openContainer(s, starting, 'protocols');
    const h = hangFromDesk(o, '31', 400, 300);
    expect(h.desk?.some((d) => d.id === '31')).toBe(false);
    const it31 = h.wall.items.find((i) => i.id === '31');
    expect(it31).toMatchObject(onWall(400, 300));
    expect(it31?.z).toBe(Math.max(...h.wall.items.map((i) => i.z)));
    // Висящее на стене со стола убирается и при reconcile (старое сохранение с повтором).
    const dup = { ...h, desk: [...(h.desk ?? []), { id: '31', layer: 99 }] };
    expect(reconcile(dup, starting).desk?.some((d) => d.id === '31')).toBe(false);
  });

  it('вскрыть всё — стартовая сетка без газеты и закладок; старое сохранение — всё вскрыто', () => {
    const all = openAll(s, starting);
    const onWall = new Set(all.wall.items.map((i) => i.id));
    expect(onWall.has('25')).toBe(true);
    expect(['15', '16', '17'].some((id) => onWall.has(id))).toBe(false);
    // Сохранение до конвертов — и до 3D-стола: ни `opened`, ни `desk`.
    const { opened: _, desk: __, ...legacy } = s;
    expect(sealedIds({ opened: undefined }).size).toBe(0);
    expect(reconcile(legacy, starting).wall.items.some((i) => i.id === '15')).toBe(true);
    expect(reconcile(legacy, starting).desk?.some((d) => d.id === '15')).toBeFalsy();
    // Газету (лежала на столе в прежнем сохранении) повесили на стену — на стол сама не возвращается.
    const before = {
      ...s,
      desk: [...(s.desk ?? []), { id: NEWSPAPER_ID, ...NEWSPAPER_AT, layer: 0 }],
    };
    expect(reconcile(before, starting).desk?.some((d) => d.id === NEWSPAPER_ID)).toBe(true);
    const hung = hangFromDesk(reconcile(before, starting), NEWSPAPER_ID, 300, 300);
    expect(reconcile(hung, starting).desk?.some((d) => d.id === NEWSPAPER_ID)).toBe(false);
    expect(reconcile(hung, starting).wall.items.some((i) => i.id === NEWSPAPER_ID)).toBe(true);
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

describe('выписки на стене (A-272, DB-B)', () => {
  const withL = [...starting, mat('L620')];
  const x = {
    id: 'x:1',
    text: 'Текущий этап — по номеру программы',
    material: 'L620',
    source: 'vaultline-program.com · Кабинет',
    place: { kind: 'site' as const, address: 'vaultline-program.com/cabinet' },
  };

  it('выписка — на свободное место стены; повтор не добавляется; снимается вместе с нитями', () => {
    const s = addExcerpt(defaultState(withL), x);
    const at = s.wall.items.find((i) => i.id === 'x:1');
    expect(at).toBeDefined();
    expect(
      s.wall.items.filter((i) => i.id !== 'x:1').some((i) => i.x === at?.x && i.y === at?.y),
    ).toBe(false);
    expect(addExcerpt(s, x)).toBe(s);
    const tied = {
      ...s,
      wall: { ...s.wall, threads: [{ id: 't', from: 'x:1', to: '01', label: '' }] },
    };
    const off = removeExcerpt(tied, 'x:1');
    expect(off.excerpts).toEqual([]);
    expect(off.wall.items.some((i) => i.id === 'x:1')).toBe(false);
    expect(off.wall.threads).toEqual([]);
  });

  it('reconcile: выписка из материала, которого нет, снимается; своя — остаётся', () => {
    const s = addExcerpt(defaultState(withL), x);
    expect(reconcile(s, withL).wall.items.some((i) => i.id === 'x:1')).toBe(true);
    const gone = reconcile(s, starting);
    expect(gone.wall.items.some((i) => i.id === 'x:1')).toBe(false);
    expect(gone.excerpts).toEqual([]);
  });
});

describe('опись — рабочий лист (OP-A)', () => {
  it('строка описи называет свои файлы', () => {
    expect(inventoryFiles('в архиве, файл 01')).toEqual(['01']);
    expect(inventoryFiles('файлы 30–36')).toEqual(['30', '31', '32', '33', '34', '35', '36']);
    expect(inventoryFiles('конверт «Прил. 7 · Сервер VL-31», файл 52')).toEqual(['52']);
    expect(inventoryFiles('следствием не изымались; находятся у компании')).toEqual([]);
  });

  it('открывал — отмечено один раз; чужое не отмечается', () => {
    const s = defaultState(starting);
    const a = markLooked(s, '02');
    expect(a.looked).toEqual(['02']);
    expect(markLooked(a, '02')).toBe(a);
    expect(markLooked(a, 'p:cole')).toBe(a);
  });
});
