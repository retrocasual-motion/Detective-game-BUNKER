import type { View } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import {
  cameraOps,
  faceCenter,
  faceOps,
  lerpPose,
  type Op,
  POSES,
  perspectiveFor,
  toCamera,
  toScreen,
  type Vec3,
} from './camera.ts';

type M = number[][];
const mul = (a: M, b: M): M =>
  a.map((row) => b[0]?.map((_, j) => row.reduce((s, v, k) => s + v * (b[k]?.[j] ?? 0), 0)) ?? []);
const rad = (d: number) => (d * Math.PI) / 180;

/** Матрицы CSS Transforms 2 (rotateX, rotateY, translate3d) — как их применяет браузер. */
function matrix(op: Op): M {
  if (op[0] === 'translate') {
    const [, x, y, z] = op;
    return [
      [1, 0, 0, x],
      [0, 1, 0, y],
      [0, 0, 1, z],
      [0, 0, 0, 1],
    ];
  }
  const c = Math.cos(rad(op[1]));
  const s = Math.sin(rad(op[1]));
  return op[0] === 'rotateX'
    ? [
        [1, 0, 0, 0],
        [0, c, -s, 0],
        [0, s, c, 0],
        [0, 0, 0, 1],
      ]
    : [
        [c, 0, s, 0],
        [0, 1, 0, 0],
        [-s, 0, c, 0],
        [0, 0, 0, 1],
      ];
}
const compose = (ops: Op[]): M =>
  ops.map(matrix).reduce(
    (a, b) => mul(a, b),
    [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
  );

describe('камера комнаты', () => {
  const p = perspectiveFor({ width: 1366, height: 768 });

  it.each<View>(['desk', 'left', 'right'])(
    'в своей позе грань «%s» ложится ровно на экран (камера × грань = единица)',
    (view) => {
      const m = compose([...cameraOps(view, p), ...faceOps(view, p)]);
      m.forEach((row, i) => {
        row.forEach((v, j) => {
          expect(v).toBeCloseTo(i === j ? 1 : 0, 6);
        });
      });
    },
  );

  it('чужая грань в позе стола не совпадает с экраном', () => {
    const m = compose([...cameraOps('desk', p), ...faceOps('right', p)]);
    expect(Math.abs((m[0]?.[0] ?? 1) - 1)).toBeGreaterThan(0.5);
  });
});

describe('проекция декора', () => {
  const vp = { width: 1366, height: 768 };
  const p = perspectiveFor(vp);

  it('углы грани стола в позе стола попадают в углы экрана', () => {
    const [cx, cy, cz] = faceCenter('desk', p);
    // Грань стола горизонтальна: её «верх» на экране — дальний край (z меньше).
    const corners: [Vec3, { x: number; y: number }][] = [
      [[cx - vp.width / 2, cy, cz - vp.height / 2], { x: 0, y: 0 }],
      [[cx + vp.width / 2, cy, cz + vp.height / 2], { x: vp.width, y: vp.height }],
    ];
    for (const [world, screen] of corners) {
      const s = toScreen(toCamera(world, POSES.desk, p), p, vp);
      expect(s.x).toBeCloseTo(screen.x, 3);
      expect(s.y).toBeCloseTo(screen.y, 3);
    }
  });

  it('промежуточная поза: t = 0 и t = 1 — концы пути', () => {
    expect(lerpPose(POSES.desk, POSES.left, 0)).toEqual(POSES.desk);
    expect(lerpPose(POSES.desk, POSES.left, 1)).toEqual(POSES.left);
  });
});

describe('длительность перехода (MOVE-A)', () => {
  it('между рабочими видами — коротко, через общий вид — дольше', async () => {
    const { transitionMs, TRANSITION_MS, TRANSITION_NEAR_MS } = await import('./camera.ts');
    expect(TRANSITION_NEAR_MS).toBeLessThan(TRANSITION_MS);
    expect(transitionMs('desk', 'right')).toBe(TRANSITION_NEAR_MS);
    expect(transitionMs('left', 'desk')).toBe(TRANSITION_NEAR_MS);
    expect(transitionMs('desk', 'room')).toBe(TRANSITION_MS);
    expect(transitionMs('room', 'left')).toBe(TRANSITION_MS);
  });
});
