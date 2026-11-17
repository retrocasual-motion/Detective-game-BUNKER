import { describe, expect, it } from 'vitest';
import { wheelIntent, zoomFactor } from './input.ts';

const wheel = (deltaX: number, deltaY: number, ctrlKey = false, deltaMode = 0) => ({
  deltaX,
  deltaY,
  ctrlKey,
  deltaMode,
});

describe('управление: мышь или тачпад (TP-C)', () => {
  it('мышь: колесо приближает', () => {
    expect(wheelIntent(wheel(0, -100), 'mouse')).toEqual({ zoom: -100 });
  });

  it('тачпад: два пальца сдвигают, щипок приближает', () => {
    expect(wheelIntent(wheel(12, -30), 'trackpad')).toEqual({ pan: [12, -30] });
    expect(wheelIntent(wheel(0, -4, true), 'trackpad')).toEqual({ zoom: -20 });
    // Ctrl + колесо мыши — тоже приближение (браузер страницу не увеличивает).
    expect(wheelIntent(wheel(0, 100, true), 'mouse')).toEqual({ zoom: 500 });
  });

  it('Firefox считает строками — в пиксели', () => {
    expect(wheelIntent(wheel(0, 3, false, 1), 'mouse')).toEqual({ zoom: 99 });
  });

  it('щелчок колеса — ровно шаг, как раньше; мелкая прокрутка — плавно; не больше шага', () => {
    expect(zoomFactor(-100, 1.2)).toBeCloseTo(1.2);
    expect(zoomFactor(100, 1.2)).toBeCloseTo(1 / 1.2);
    expect(zoomFactor(-500, 1.2)).toBeCloseTo(1.2);
    const small = zoomFactor(-5, 1.2);
    expect(small).toBeGreaterThan(1);
    expect(small).toBeLessThan(1.01);
  });
});
