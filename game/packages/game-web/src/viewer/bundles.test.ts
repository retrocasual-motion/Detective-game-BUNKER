import { describe, expect, it } from 'vitest';
import {
  coverCode,
  faceUpTexts,
  isBundleListing,
  listingOf,
  parseBundles,
  remaining,
  rowOfSheet,
  rowTarget,
  sheetPages,
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

describe('листание пачки в руках (LF-A)', () => {
  it('строка описи — на каждый лист диапазона; обложка папки и листы текстом вниз', () => {
    const body = `| Листы | Что на листе |
|---|---|
| 1–2 | Инструкция |
| 3 | Картонная обложка. Наклейка «A-24» |
| 4–5 | Нижние листы, лежат блоком текстом вниз |`;
    const p = sheetPages(body, { sheets: 5, layers: [3] });
    expect(p.map((s) => s.text)).toEqual([
      'Инструкция',
      'Инструкция',
      'Картонная обложка. Наклейка «A-24»',
      'Нижние листы, лежат блоком текстом вниз',
      'Нижние листы, лежат блоком текстом вниз',
    ]);
    expect(p[2]?.cover).toBe('A-24');
    expect(p.map((s) => s.faceDown)).toEqual([false, false, false, true, true]);
  });

  it('П-01: сводка по людям — анкеты по дням сверху вниз, свободная строка где есть', () => {
    const body = `| Имя на анкетах | Дни | Свободная строка (дословно; только где заполнена) | Почерк |
|---|---|---|---|
| А. Коул | 1–12 | — | мелкий |
| Л. Моро | 1–12 | д. 1: «Рисую. Хорошо.» | лёгкий |`;
    const p = sheetPages(body, { sheets: 24, layers: [] });
    expect(p).toHaveLength(24);
    expect(p[0]?.text).toContain('День 12. А. Коул');
    expect(p[23]?.text).toContain('День 1. Л. Моро. Что хотите добавить: «Рисую. Хорошо.»');
  });
});

describe('вынутая папка пропадает из пачки', () => {
  const b = { id: 'П-02', room: 'Комната анкет', sheets: 41, top: '', side: '', layers: [18] };
  it('без её трёх листов и без её картона; номера исходных листов сохраняются', () => {
    const r = remaining(b, ['П-02/18', 'П-09/4'], null);
    expect(r.bundle.sheets).toBe(38);
    expect(r.bundle.layers).toEqual([]);
    expect(r.orig.slice(16, 19)).toEqual([17, 21, 22]);
  });
  it('у П-09 вынули первую — остальные слои сдвигаются', () => {
    const p9 = { ...b, id: 'П-09', sheets: 15, layers: [1, 4, 7, 10, 13] };
    const r = remaining(p9, ['П-09/1'], null);
    expect(r.bundle.sheets).toBe(12);
    expect(r.bundle.layers).toEqual([1, 4, 7, 10]);
  });
});

describe('перевёрнутые листы — лицом вверх (П-05)', () => {
  const b = { id: 'П-05', room: 'Медкабинет', sheets: 4, top: '', side: '', layers: [] };
  const sheets = [
    { text: 'Инструкция', faceDown: false, cover: null },
    { text: 'Инструкция', faceDown: false, cover: null },
    { text: 'текстом вниз', faceDown: true, cover: null },
    { text: 'текстом вниз', faceDown: true, cover: null },
  ];
  it('пока не перевернули — текстом вниз; перевернули — лица из пересканов', () => {
    expect(remaining(b, [], sheets).sheets?.[2]?.faceDown).toBe(true);
    const up = faceUpTexts(
      '## Лист 3\n\n> **Справка о выбытии.** Код A-11\n\n## Лист 4\n\n> Код A-17',
    );
    const r = remaining(b, [], sheets, ['П-05/3'], up).sheets;
    expect(r?.[2]).toEqual({ text: 'Справка о выбытии. Код A-11', faceDown: false, cover: null });
    expect(r?.[3]?.text).toBe('Код A-17');
  });
});
