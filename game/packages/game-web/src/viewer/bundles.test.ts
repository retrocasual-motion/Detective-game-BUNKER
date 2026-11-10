import { describe, expect, it } from 'vitest';
import {
  coverCode,
  isBundleListing,
  listingOf,
  parseBundles,
  rowOfSheet,
  rowTarget,
} from './bundles.ts';

const BODY = `# Сканы — превью пачек

Каждая пачка отсканирована как стопка.

| Пачка | Помещение | Листов | Превью (верхний лист) | Вид сбоку |
|---|---|---|---|---|
| П-01 | Комната анкет | 96 | Анкета. | на подложке; ровная стопка листов |
| П-02 | Комната анкет | 41 | Чистый бланк. | на подложке; чуть выше середины стопки — ещё один слой картона |
| П-09 | Кабинет руководителя | 15 | Папка. | на подложке; через каждые три листа — слой картона (5 слоёв) |`;

describe('пачки сканов (4b-2a)', () => {
  it('из таблицы материала 29: вступление и пачки по порядку, слои картона — по канону', () => {
    const { intro, bundles } = parseBundles(BODY);
    expect(intro).toContain('отсканирована как стопка');
    expect(intro).not.toContain('|');
    expect(bundles.map((b) => [b.id, b.sheets, b.layers])).toEqual([
      ['П-01', 96, []],
      ['П-02', 41, [18]],
      ['П-09', 15, [1, 4, 7, 10, 13]],
    ]);
    expect(bundles[1]?.side).toContain('слой картона');
  });

  it('опись пачки — по названию (номера не совпадают: П-02 — L981)', () => {
    const mats = [
      { id: 'L981', title: 'Листание: пачка П-02 (комната анкет), все листы' },
      { id: 'L982', title: 'Листание: пачка П-01 (комната анкет), все листы' },
    ];
    expect(listingOf('П-02', mats)).toBe('L981');
    expect(listingOf('П-01', mats)).toBe('L982');
    expect(listingOf('П-07', mats)).toBeNull();
    expect(isBundleListing('L985')).toBe(true);
    expect(isBundleListing('L957')).toBe(false);
  });

  it('строка описи — цель крупного плана для движка (FV-A)', () => {
    expect(rowTarget('L985', ' 19–24 ')).toBe('L985 лист 19–24');
  });
});

describe('папка, вытащенная из пачки (RD-A)', () => {
  const L981 = `| Листы | Что на листе |
|---|---|
| 1–17 | Чистый бланк |
| 18 | Картонная обложка папки-скоросшивателя. Наклейка с кодом: «A-24». |
| 19 | Фотография |`;
  const L989 = `| Листы | Код | Что |
|---|---|---|
| 1–3 | A-11 | обложка |
| 4–6 | A-17 | обложка |`;
  it('строка описи по номеру листа — одиночному и диапазону', () => {
    expect(rowOfSheet(L981, 18)).toContain('Картонная обложка');
    expect(rowOfSheet(L981, 5)).toContain('Чистый бланк');
    expect(rowOfSheet(L981, 99)).toBeNull();
  });
  it('код на обложке', () => {
    expect(coverCode(L981, 18)).toBe('A-24');
    expect(coverCode(L989, 4)).toBe('A-17');
    expect(coverCode(L981, 5)).toBeNull();
  });
});
