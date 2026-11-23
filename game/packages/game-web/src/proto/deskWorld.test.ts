import { describe, expect, it } from 'vitest';
import {
  allowed,
  contains,
  heights,
  nearestFree,
  overlap,
  type Piece,
  pileOf,
  scatter,
  slide,
  stackOf,
  steer,
  topAt,
  type Zone,
} from './deskWorld.ts';

const sheet = (id: string, x: number, z: number, layer: number, rot = 0, stack = id): Piece => ({
  id,
  kind: 'sheet',
  w: 0.21,
  d: 0.297,
  t: 0.0012,
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
    expect(h.get('b')).toBeCloseTo(0.0012);
    expect(h.get('c')).toBeCloseTo(0.0024);
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

  it('сдвиг: упёрся в вещь — скользит вдоль; сквозь неё не проходит; за край не уходит', () => {
    const wall: Zone = { ...open, blocked: [{ x: 0.5, z: 0.4, w: 0.2, d: 0.8, rot: 0 }] };
    const a = sheet('a', 0, 0.3, 0);
    // Прямо в препятствие и за него: встал у края препятствия.
    const m = slide([a], 0.8, 0, wall);
    // Край листа (0,105) дошёл до препятствия (0,4): сдвиг 0,295.
    expect(m.dx).toBeGreaterThan(0.285);
    expect(m.dx).toBeLessThan(0.2951);
    // Наискось: по x упёрся, по z проехал.
    const d = slide([a], 0.8, 0.2, wall);
    expect(d.dz).toBeCloseTo(0.2, 2);
    // За край стола (|x| < 1) — не дальше края.
    const e = slide([a], -2, 0, open);
    expect(a.x + e.dx - a.w / 2).toBeGreaterThan(-1.0001);
    expect(a.x + e.dx - a.w / 2).toBeLessThan(-0.99);
  });

  it('взять с тем, что лежит сверху: только то, что выше и касается, по цепочке', () => {
    const ps = [
      sheet('a', 0, 0.3, 0),
      sheet('b', 0.15, 0.3, 1),
      sheet('c', 0.3, 0.3, 2),
      sheet('d', 0.7, 0.3, 3),
      sheet('e', -0.05, 0.3, -1),
    ];
    expect(pileOf(ps, 'a').map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(pileOf(ps, 'c').map((p) => p.id)).toEqual(['c']);
  });

  it('ближайшее свободное место: на препятствии — рядом, с той стороны, к которой ближе', () => {
    const phone: Zone = { ...open, blocked: [{ x: 0, z: 0.4, w: 0.1, d: 0.1, rot: 0 }] };
    const cam = { x: 0.02, z: 0.4, w: 0.1, d: 0.06, rot: 0 };
    const m = nearestFree([cam], phone);
    expect(m).not.toBeNull();
    // Ближе к правому краю телефона — встала справа вплотную.
    expect(cam.x + (m?.dx ?? 0) - cam.w / 2).toBeGreaterThanOrEqual(0.05 - 0.01);
    expect(Math.abs(m?.dz ?? 1)).toBeLessThan(0.02);
    expect(nearestFree([{ ...cam, x: 0.5 }], phone)).toEqual({ dx: 0, dz: 0 });
  });

  it('в обход устройства: камера слева от телефона, ведут вправо — обходит и встаёт справа', () => {
    const phone = { id: '48', x: 0, z: 0.4, w: 0.065, d: 0.12, rot: 0 };
    const cam = { x: -0.12, z: 0.4, w: 0.1, d: 0.06, rot: 0 };
    const m = steer([cam], 0.24, 0, open, [phone]);
    const end = { ...cam, x: cam.x + m.dx, z: cam.z + m.dz };
    expect(overlap(end, phone)).toBe(false);
    expect(end.x).toBeGreaterThan(phone.x + phone.w / 2);
    // Цель свободна — пришла туда же.
    expect(end.x).toBeCloseTo(0.12, 2);
    expect(end.z).toBeCloseTo(0.4, 2);
    // Повёрнутые, мышь ведут мелкими шагами (как в живой протяжке): тоже обходит.
    const ph2 = { id: '48', x: -0.2275, z: 0.6974, w: 0.1, d: 0.06, rot: 0.065 };
    let c2 = { x: -0.5174, z: 0.6953, w: 0.065, d: 0.12, rot: 0.1357 };
    const memo = {};
    for (let k = 0; k < 60; k++) {
      const want = { x: -0.5174 + ((0.15 + 0.5174) * (k + 1)) / 60, z: 0.6953 };
      const mv = steer([c2], want.x - c2.x, want.z - c2.z, open, [ph2], memo);
      c2 = { ...c2, x: c2.x + mv.dx, z: c2.z + mv.dz };
    }
    expect(overlap(c2, ph2)).toBe(false);
    expect(c2.x).toBeCloseTo(0.15, 2);
  });
});
