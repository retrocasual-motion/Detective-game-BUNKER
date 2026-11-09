import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { zoomStep } from './zoom.ts';

const limits = { minZ: 1.2, maxZ: 6, half: [1.6, 1.2] as [number, number] };

describe('приближение к точке под курсором', () => {
  it('точка под курсором остаётся на том же луче — ближе становится она, а не середина', () => {
    const cam = new Vector3(0, 0, 6);
    const p = new Vector3(0.8, -0.5, 0);
    const next = zoomStep(cam, p, 1.2, limits);
    expect(next.z).toBeCloseTo(5, 5);
    const before = p.clone().sub(cam).normalize();
    const after = p.clone().sub(next).normalize();
    expect(after.distanceTo(before)).toBeLessThan(1e-9);
    expect(next.x).toBeGreaterThan(0);
  });

  it('не ближе предела и не дальше начала; отдалились до конца — снова по центру', () => {
    let cam = new Vector3(0, 0, 6);
    const p = new Vector3(0.5, 0.3, 0);
    for (let i = 0; i < 30; i++) cam = zoomStep(cam, p, 1.2, limits);
    expect(cam.z).toBeGreaterThanOrEqual(1.2 - 1e-9);
    for (let i = 0; i < 30; i++) cam = zoomStep(cam, p, 1 / 1.2, limits);
    expect(cam.toArray()).toEqual([0, 0, 6]);
  });
});
