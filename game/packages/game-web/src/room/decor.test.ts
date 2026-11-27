import type { ContainerId } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import { roomFor } from './camera.ts';
import { clipNear, deskObjects } from './decor.ts';

describe('отсечение у зрителя', () => {
  it('квадрат, наполовину за зрителем, обрезается по плоскости', () => {
    const out = clipNear(
      [
        [0, 0, -10],
        [10, 0, -10],
        [10, 0, 10],
        [0, 0, 10],
      ],
      0,
    );
    expect(out.every((p) => p[2] <= 0)).toBe(true);
    expect(out).toHaveLength(4);
  });

  it('целиком за зрителем — пусто', () => {
    expect(
      clipNear(
        [
          [0, 0, 5],
          [1, 0, 5],
          [1, 1, 5],
        ],
        0,
      ),
    ).toEqual([]);
  });
});

describe('вещи на столе не заходят друг в друга (автор 25.11: «никаких пересечений»)', () => {
  const r = roomFor({ width: 1366, height: 768 });
  const col = () => '#808080';
  /** Углы основания коробки на столе (x, z) после поворота. */
  const base = (b: (typeof objs)[number]['boxes'][number]) => {
    const pts: [number, number][] = [
      [b.min[0], b.min[2]],
      [b.max[0], b.min[2]],
      [b.max[0], b.max[2]],
      [b.min[0], b.max[2]],
    ];
    if (!b.yaw || !b.pivot) return pts;
    const [cx, cz] = b.pivot;
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    return pts.map(([x, z]): [number, number] => [
      cx + (x - cx) * c + (z - cz) * s,
      cz - (x - cx) * s + (z - cz) * c,
    ]);
  };
  /** Пересекаются ли два выпуклых многоугольника (разделяющая ось), с допуском 1 мм. */
  const meets = (a: [number, number][], b: [number, number][]) => {
    for (const poly of [a, b])
      for (let i = 0; i < poly.length; i++) {
        const [x1, z1] = poly[i] as [number, number];
        const [x2, z2] = poly[(i + 1) % poly.length] as [number, number];
        const n = [z1 - z2, x2 - x1];
        const proj = (q: [number, number][]) =>
          q.map(([x, z]) => x * (n[0] ?? 0) + z * (n[1] ?? 0));
        const pa = proj(a);
        const pb = proj(b);
        const tol = 0.001 * r.p * Math.hypot(n[0] ?? 0, n[1] ?? 0);
        if (Math.max(...pa) <= Math.min(...pb) + tol || Math.max(...pb) <= Math.min(...pa) + tol)
          return false;
      }
    return true;
  };
  // Высота: y растёт вниз (deskY — столешница); пересечение — общий отрезок по высоте.
  const tall = (b: (typeof objs)[number]['boxes'][number]) => [b.min[1], b.max[1]] as const;
  const objs = deskObjects(
    r,
    col,
    ['L1', 'L2', 'L3'],
    ['scene', 'protocols'],
    'fresh',
    'envelope',
    'box',
  );
  const states: [string, ReturnType<typeof deskObjects>][] = [
    ['начало дела', deskObjects(r, col, [], [], 'none', 'envelope', 'none')],
    ['письма, коробка банка, эпилог', objs],
    ['всё вскрыто, кассета', deskObjects(r, col, ['L1'], undefined, 'none', 'out', 'open')],
    // Короб пачек (вскрыта «Документация») рядом с ещё не вскрытым коробом вещдоков.
    [
      'короб пачек и короб вещдоков',
      deskObjects(r, col, [], ['bunker'], 'none', 'envelope', 'none'),
    ],
  ];
  // Части лотка и письма в нём — одна вещь.
  const group = (key: string) => (key.startsWith('inbox') ? 'inbox' : key);
  for (const [name, list] of states)
    it(name, () => {
      const hits: string[] = [];
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (!a || !b || group(a.key) === group(b.key)) continue;
          // Эпилог кладут поверх стопки конвертов (как и было).
          if ([a.key, b.key].includes('epilogue')) continue;
          for (const ba of a.boxes)
            for (const bb of b.boxes) {
              const [a0, a1] = tall(ba);
              const [b0, b1] = tall(bb);
              if (Math.min(a1, b1) - Math.max(a0, b0) <= 0.001 * r.p) continue;
              if (meets(base(ba), base(bb))) hits.push(`${a.key} × ${b.key}`);
            }
        }
      expect([...new Set(hits)]).toEqual([]);
    });
});

describe('открытая папка (UNP-A, автор 26.11)', () => {
  const r = roomFor({ width: 1366, height: 768 });
  const col = () => '#000000';
  const keys = (folders?: ContainerId[]) =>
    deskObjects(
      r,
      col,
      [],
      ['protocols'],
      'none',
      'envelope',
      'none',
      undefined,
      undefined,
      undefined,
      folders,
    ).map((o) => o.key);
  it('открытую папку рисует 3D-стол (автор 27.11: тянут — едут листы на ней); комната — нет, закрытой тоже нет', () => {
    for (const f of [['protocols'] as ContainerId[], [] as ContainerId[]]) {
      expect(keys(f)).not.toContain('folder-open-protocols');
      expect(keys(f)).not.toContain('envelope-protocols');
    }
  });
});
