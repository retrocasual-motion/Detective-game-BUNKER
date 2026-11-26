import { describe, expect, it } from 'vitest';
import {
  DELIVERY,
  deliveredBySave,
  deliveryDue,
  PORTION_1,
  PORTION_2,
  portionShare,
} from './archive.ts';

describe('поэтапная выдача (SD5-A)', () => {
  it('порции: вещдоки — 24, 47–50 и пакеты 40–46; бумаги — опись, стартовые, папки, 29, газета, диск', () => {
    expect([...PORTION_2].sort()).toEqual(
      ['24', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50'].sort(),
    );
    for (const id of ['04', '01', '07', '30', '22', '08', '29', '15', '52'])
      expect(PORTION_1).toContain(id);
    expect(PORTION_1.some((id) => PORTION_2.has(id))).toBe(false);
  });

  it('звонок: порог и 20 минут — да; порог без 20 минут, 20 минут без порога — нет; 40 минут — да', () => {
    const most = PORTION_1.slice(0, Math.ceil(PORTION_1.length * DELIVERY.share));
    expect(portionShare(most)).toBeGreaterThanOrEqual(DELIVERY.share);
    expect(deliveryDue({ looked: most, playMs: DELIVERY.minMs })).toBe(true);
    expect(deliveryDue({ looked: most, playMs: DELIVERY.minMs - 1 })).toBe(false);
    expect(deliveryDue({ looked: most.slice(0, 3), playMs: DELIVERY.minMs + 1 })).toBe(false);
    expect(deliveryDue({ looked: [], playMs: DELIVERY.maxMs })).toBe(true);
  });

  it('старое сохранение: без конвертов или с вскрытыми коробами — вещдоки уже у игрока', () => {
    expect(deliveredBySave({ opened: undefined })).toBe(true);
    expect(deliveredBySave({ opened: ['personal'] })).toBe(true);
    expect(deliveredBySave({ opened: ['scene', 'bunker'] })).toBe(false);
    expect(deliveredBySave(null)).toBe(false);
  });
});
