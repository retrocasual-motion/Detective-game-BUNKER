import { describe, expect, it } from 'vitest';
import { clipNear } from './decor.ts';

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
