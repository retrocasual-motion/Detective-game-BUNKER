import { describe, expect, it } from 'vitest';
import { screenToWorld, zoomAt } from './math.ts';

describe('screenToWorld', () => {
  it('учитывает сдвиг и масштаб', () => {
    expect(screenToWorld({ x: 300, y: 250 }, { x: 100, y: 50, zoom: 2 })).toEqual({
      x: 100,
      y: 100,
    });
  });
});

describe('zoomAt', () => {
  it('точка под курсором остаётся на месте', () => {
    const cam = { x: 30, y: -20, zoom: 1 };
    const p = { x: 100, y: 100 };
    const before = screenToWorld(p, cam);
    const after = screenToWorld(p, zoomAt(cam, p, 1.5));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('масштаб не меньше 0.25 и не больше 3', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    expect(zoomAt(cam, { x: 0, y: 0 }, 0.01).zoom).toBe(0.25);
    expect(zoomAt(cam, { x: 0, y: 0 }, 100).zoom).toBe(3);
  });
});
