import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { orient, PITCH_MAX } from './orient.ts';

describe('поворот вещи без крена', () => {
  it('при любых углах верх вещи не уходит вбок: крена нет', () => {
    for (const [yaw, pitch] of [
      [0.7, 0.3],
      [3.1, -1.2],
      [-5, 2],
      [12, 0.9],
    ] as const) {
      const up = new Vector3(0, 1, 0).applyQuaternion(orient(yaw, pitch));
      expect(Math.abs(up.x)).toBeLessThan(1e-9);
    }
  });

  it('наклон к игроку — не больше предела', () => {
    const up = new Vector3(0, 1, 0).applyQuaternion(orient(0, 10));
    expect(Math.asin(up.z)).toBeCloseTo(PITCH_MAX, 6);
  });
});
