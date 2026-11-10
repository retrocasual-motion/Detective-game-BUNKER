import { describe, expect, it } from 'vitest';
import { clampToBounds, screenToWorld, zoomAt } from './math.ts';

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

describe('clampToBounds', () => {
  const b = { left: 0, top: 0, right: 2000, bottom: 1000 };
  const vp = { width: 1000, height: 500 };

  it('камера внутри стола не меняется', () => {
    const cam = { x: -300, y: -100, zoom: 1 };
    expect(clampToBounds(cam, b, vp)).toEqual(cam);
  });

  it('центр экрана не уходит за край стола', () => {
    const c = clampToBounds({ x: 5000, y: 5000, zoom: 1 }, b, vp);
    const center = screenToWorld({ x: 500, y: 250 }, c);
    expect(center).toEqual({ x: 0, y: 0 });
  });

  it('отдалить можно только до всего стола', () => {
    const c = clampToBounds({ x: 0, y: 0, zoom: 0.25 }, b, vp);
    expect(c.zoom).toBeCloseTo(0.452, 3);
  });
});
