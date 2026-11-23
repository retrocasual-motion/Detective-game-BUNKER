import { describe, expect, it } from 'vitest';
import {
  allowed,
  contains,
  heights,
  overlap,
  type Piece,
  scatter,
  stackOf,
  topAt,
  type Zone,
} from './deskWorld.ts';

const sheet = (id: string, x: number, z: number, layer: number, rot = 0, stack = id): Piece => ({
  id,
  kind: 'sheet',
  w: 0.21,
  d: 0.297,
  t: 0.0015,
  x,
  z,
  rot,
  layer,
  stack,
});

const open: Zone = { inside: (x, z) => Math.abs(x) < 1 && z > 0 && z < 0.8, blocked: [] };

describe('прототип 3D-стола: раскладка без физики', () => {
  it('пересечение учитывает поворот; касание — не пересечение', () => {
    expect(overlap(sheet('a', 0, 0.3, 0), sheet('b', 0.2, 0.3, 1))).toBe(true);
    expect(overlap(sheet('a', 0, 0.3, 0), sheet('b', 0.21, 0.3, 1))).toBe(false);
    // Повёрнутый на 90° лист шире по x: достаёт соседа.
    expect(overlap(sheet('a', 0, 0.3, 0, Math.PI / 2), sheet('b', 0.25, 0.3, 1))).toBe(true);
    expect(contains(sheet('a', 0, 0.3, 0), 0.1, 0.44)).toBe(true);
    expect(contains(sheet('a', 0, 0.3, 0), 0.11, 0.3)).toBe(false);
  });

  it('высота: позже положенный лежит на прежних, внахлёст — тоже; в стороне — на столе', () => {
    const h = heights([
      sheet('a', 0, 0.3, 0),
      sheet('b', 0.05, 0.3, 1),
      sheet('c', 0.1, 0.35, 2),
      sheet('d', 0.6, 0.3, 3),
    ]);
    expect(h.get('a')).toBe(0);
    expect(h.get('b')).toBeCloseTo(0.0015);
    expect(h.get('c')).toBeCloseTo(0.003);
    expect(h.get('d')).toBe(0);
  });

  it('верхний лист под точкой и стопка снизу вверх', () => {
    const ps = [
      sheet('a', 0, 0.3, 0, 0, 's'),
      sheet('b', 0, 0.3, 2, 0, 's'),
      sheet('c', 0.5, 0.3, 1),
    ];
    expect(topAt(ps, 0, 0.3)?.id).toBe('b');
    expect(topAt(ps, 0, 0.3, new Set(['b']))?.id).toBe('a');
    expect(topAt(ps, 0.9, 0.3)).toBeNull();
    expect(stackOf(ps, 's').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('зона: за краем и на вещи следователя — нельзя', () => {
    const zone: Zone = { ...open, blocked: [{ x: 0.5, z: 0.3, w: 0.2, d: 0.2, rot: 0 }] };
    expect(allowed(sheet('a', 0, 0.3, 0), zone)).toBe(true);
    expect(allowed(sheet('a', 0.4, 0.3, 0), zone)).toBe(false);
    expect(allowed(sheet('a', 0, 0.7, 0), zone)).toBe(false);
  });

  it('высыпать: все в зоне, центры не слипаются, раскладка повторяется', () => {
    const items = Array.from({ length: 10 }, (_, k) => ({ id: String(k), kind: 'sheet' }));
    const a = scatter(items, open, { x: 0, z: 0.4 });
    expect(a).toHaveLength(10);
    for (const p of a) expect(allowed(p, open)).toBe(true);
    for (const p of a)
      for (const q of a)
        if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(0.11);
    expect(scatter(items, open, { x: 0, z: 0.4 })).toEqual(a);
  });
});
