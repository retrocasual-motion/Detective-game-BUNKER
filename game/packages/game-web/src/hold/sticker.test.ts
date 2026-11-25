import { describe, expect, it } from 'vitest';
import { STICKER_SIZE, stickerSeen } from './sticker.ts';

const box = (left: number, width: number) => [
  { x: left, y: 100 },
  { x: left + width, y: 100 },
  { x: left + width, y: 300 },
  { x: left, y: 300 },
];

describe('наклейка на дне ноутбука (A-283): «рассмотрели» — лицом к камере и крупно', () => {
  it('размер плоскости — наклейка 6 см на ноутбуке 35 см, на 30 % меньше (автор 25.11), с полями грязи 1652 : 1302', () => {
    const [w, h] = STICKER_SIZE;
    expect(w / h).toBeCloseTo(1652 / 1302, 5);
    // 6 см наклейки из 35 см корпуса шириной 2,8 → 0,48; ×0,7 → 0,336; плоскость с полями — чуть шире.
    expect(w).toBeGreaterThan(0.336);
    expect(w).toBeLessThan(0.385);
  });

  it('лицом и шире трети свободной области — да', () => {
    expect(stickerSeen(box(400, 500), 0.9, 1366)).toBe(true);
  });

  it('мелко (издалека) — нет', () => {
    expect(stickerSeen(box(600, 120), 0.95, 1366)).toBe(false);
  });

  it('крупно, но боком или от камеры — нет', () => {
    expect(stickerSeen(box(300, 700), 0.5, 1366)).toBe(false);
    expect(stickerSeen(box(300, 700), -0.9, 1366)).toBe(false);
  });

  it('свободная область уже (открыта папка запроса) — нужна треть её, а не экрана', () => {
    expect(stickerSeen(box(500, 300), 0.9, 1366)).toBe(false);
    expect(stickerSeen(box(500, 300), 0.9, 800)).toBe(true);
  });
});
