import { describe, expect, it } from 'vitest';
import { mixCamera } from './useCameraTween.ts';

const vp = { width: 1000, height: 600 };

describe('mixCamera', () => {
  const a = { x: 100, y: 50, zoom: 0.5 };
  const b = { x: -800, y: -400, zoom: 2 };

  it('на концах — сами камеры', () => {
    expect(mixCamera(a, b, 0, vp)).toEqual(a);
    expect(mixCamera(a, b, 1, vp)).toEqual(b);
  });

  it('масштаб посередине — среднее геометрическое (ровное приближение)', () => {
    expect(mixCamera(a, b, 0.5, vp).zoom).toBeCloseTo(1, 6);
  });

  it('точка в центре экрана идёт по прямой между центрами кадров', () => {
    const center = (c: { x: number; y: number; zoom: number }) => ({
      x: (vp.width / 2 - c.x) / c.zoom,
      y: (vp.height / 2 - c.y) / c.zoom,
    });
    const m = center(mixCamera(a, b, 0.25, vp));
    const ca = center(a);
    const cb = center(b);
    expect(m.x).toBeCloseTo(ca.x + (cb.x - ca.x) * 0.25, 6);
    expect(m.y).toBeCloseTo(ca.y + (cb.y - ca.y) * 0.25, 6);
  });
});
