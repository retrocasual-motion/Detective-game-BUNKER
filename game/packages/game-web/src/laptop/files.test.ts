import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allFiles, buildLaptop, findFile, type Laptop } from './files.ts';

const pack = '../../../playtest/packs/v3.4-2026-11-18';
const read = (dir: string, prefix: string) => {
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const f = readdirSync(`${pack}/${dir}`).find((x: string) => x.startsWith(prefix));
  return readFileSync(`${pack}/${dir}/${f}`, 'utf8').replace(/\r\n?/g, '\n');
};
const materials = [
  ...['L560', 'L561', 'L562', 'L563', 'L564', 'L565'].map((id) => ({
    id,
    body: read('locked', `${id}__`),
  })),
  { id: '08', body: read('player', '08__') },
  { id: '09', body: read('player', '09__') },
];

describe('buildLaptop — ноутбук из канона', () => {
  const lap = buildLaptop(materials) as Laptop;
  it('до входа ноутбука нет', () => {
    expect(buildLaptop([])).toBeNull();
  });
  it('рабочий стол: папки и файлы из L560 с датами', () => {
    expect(lap?.desktop.map((f) => f.name)).toEqual([
      'Отчёты',
      'Тревога',
      'Доклад_Р.txt',
      'Сохранённое',
      'Личные дела VL-31',
      'Регламент_2009.doc',
      'Распорядок.doc',
    ]);
    expect(findFile(lap, 'Доклад_Р.txt')?.modified).toBe('13.10.2009 08:12');
    expect(findFile(lap, 'Доклад_Р.txt')?.body).toContain('e.pierce.uk@mailbridge.net');
    expect(findFile(lap, 'Отчёты/расходы_объект_2008-2009.xls')?.body).toContain('Aspen Bank');
  });
  it('«Тревога» — три записи с длительностью; «Личные дела» — даты открытия', () => {
    const alarm = findFile(lap, 'Тревога');
    expect(alarm?.children?.map((f) => [f.name, f.duration])).toEqual([
      ['vneshnee_take1.wav', '0:22'],
      ['vneshnee_take2.wav', '0:31'],
      ['vneshnee_take3_final.wav', '0:26'],
    ]);
    expect(findFile(lap, 'Личные дела VL-31/Харт_Н.doc')?.opened).toBe('10.10.2009 21:40');
    expect(findFile(lap, 'Личные дела VL-31/Харт_Н.doc')?.body).toContain('Колдер');
  });
  it('корзина — шесть файлов с исходным местом и датой удаления; закладки — четыре', () => {
    expect(lap?.trash).toHaveLength(6);
    const h = findFile(lap, 'Корзина/Хейлу_заявление.doc');
    expect([h?.origin, h?.deleted]).toEqual(['Этап A/', '25.09.2009']);
    expect(h?.body).toContain('Причина:');
    expect(lap?.bookmarks.map((b) => b.url)).toContain('aspen-bank.com/safe-deposit-boxes');
    expect(allFiles(lap).every((f) => f.body.length > 0)).toBe(true);
  });
});
