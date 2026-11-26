import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addExcerpt,
  CARD_H,
  CARD_W,
  CONTAINERS,
  DEVICE_IDS,
  defaultState,
  fileFromDesk,
  hangNear,
  INVENTORY_ID,
  inboxIds,
  NEWSPAPER_ID,
  openContainer,
  type PlayerState,
  START_STACK,
  WALL_BOUNDS,
} from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import {
  buildLockedMaterials,
  buildStartingMaterials,
  DEFAULT_PACK_DIR,
  DEFAULT_PLAYER_DIR,
} from './build.ts';

/**
 * Ёмкость стены (WALL-A, A-288): всё дело — стартовые, все конверты, всё открытое по ходу, 40
 * выписок — висит на доске без наложений и в её пределах, в любом порядке вскрытия. Раскладывает
 * игра сама (конверты, «На стену», выписки); 20 записок игрок вешает сам — им остаётся место.
 */
const here = dirname(fileURLToPath(import.meta.url));
const starting = buildStartingMaterials(join(here, DEFAULT_PLAYER_DIR));
const locked = buildLockedMaterials(join(here, DEFAULT_PACK_DIR, 'locked'));
const all = [...starting, ...locked];

const LABEL_H = 80;
type Box = { id: string; x: number; y: number; w: number; h: number };

function boxes(s: PlayerState): Box[] {
  const notes = new Map(s.wall.notes.map((n) => [n.id, n]));
  return s.wall.items.map((i) => {
    const n = notes.get(i.id);
    return {
      id: i.id,
      x: i.x,
      y: i.y,
      w: n?.width ?? CARD_W,
      h: n?.kind === 'label' ? LABEL_H : CARD_H,
    };
  });
}

function overlapsOf(s: PlayerState): string[] {
  const b = boxes(s);
  const out: string[] = [];
  for (let i = 0; i < b.length; i++)
    for (let j = i + 1; j < b.length; j++) {
      const p = b[i] as Box;
      const q = b[j] as Box;
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h)
        out.push(`${p.id}×${q.id}`);
    }
  return out;
}

const outside = (s: PlayerState) =>
  boxes(s)
    .filter(
      (b) =>
        b.x < WALL_BOUNDS.left ||
        b.y < WALL_BOUNDS.top ||
        b.x + b.w > WALL_BOUNDS.right ||
        b.y + b.h > WALL_BOUNDS.bottom,
    )
    .map((b) => b.id);

/** Сыграть дело: конверты в порядке `order`, прочитанное — на стену; стартовые — когда `startAt`. */
function play(order: readonly string[], startAt: number): PlayerState {
  let s = defaultState(starting);
  const fileDesk = () => {
    const sheets = (s.desk ?? [])
      .map((d) => d.id)
      .filter(
        (id) =>
          !DEVICE_IDS.has(id) &&
          id !== NEWSPAPER_ID &&
          id !== INVENTORY_ID &&
          !START_STACK.includes(id),
      );
    s = fileFromDesk(s, sheets);
  };
  order.forEach((c, k) => {
    if (k === startAt) s = fileFromDesk(s, START_STACK);
    // Вскрытие — как в игре.
    s = openIt(s, c);
    fileDesk();
  });
  if (startAt >= order.length) s = fileFromDesk(s, START_STACK);
  // Всё открытое по ходу дела, что ложится во «Входящие» (без сайтов и файлов устройств), — «На
  // стену» у середины доски.
  for (const id of inboxIds(s, all)) s = hangNear(s, id, { x: 1500, y: 900 });
  // 40 выписок — с разных листов на стене.
  const onWall = s.wall.items.map((i) => i.id).filter((id) => /^(\d{2}|L\d{3})$/.test(id));
  for (let k = 0; k < 40; k++) {
    const material = onWall[(k * 7) % onWall.length] as string;
    s = addExcerpt(s, {
      id: `x:t${k}`,
      text: `выписка ${k}`,
      material,
      source: material,
      place: { kind: 'paper' },
    });
  }
  return s;
}

const openIt = (s: PlayerState, c: string) =>
  openContainer({ ...s, opened: (s.opened ?? []).filter((o) => o !== c) }, all, c as never);

describe('ёмкость стены (WALL-A)', () => {
  const ids = CONTAINERS.map((c) => c.id);
  const orders: [string, readonly string[], number][] = [
    ['по порядку, стартовые сначала', ids, 0],
    ['по порядку, стартовые в конце', ids, ids.length],
    ['в обратном порядке, стартовые посередине', [...ids].reverse(), 3],
  ];
  it.each(orders)('%s: всё на доске, без наложений', (_, order, startAt) => {
    const s = play(order, startAt);
    expect(s.wall.items.length).toBeGreaterThan(starting.length);
    expect(overlapsOf(s)).toEqual([]);
    expect(outside(s)).toEqual([]);
  });

  it('после всего — справа ещё есть место под 20 записок', () => {
    let s = play(ids, ids.length);
    for (let k = 0; k < 20; k++) s = hangNear(s, `n:t${k}`, { x: 3600, y: 400 });
    expect(overlapsOf(s)).toEqual([]);
    expect(outside(s)).toEqual([]);
  });
});
