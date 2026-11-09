import { describe, expect, it } from 'vitest';
import { plainLine, searchCase } from './searchCase.ts';

const m = (id: string, body: string) => ({ id, title: `Материал ${id}`, body });

describe('поиск по делу (RD-C)', () => {
  const mats = [
    m('25', '# Опись\n\n| 3 | ключ плоский, **номер 845** | 1 |\n\nКлюч 845 — в пакете.'),
    m('07', 'Ёлка у входа. Елки нет.'),
    m('09', 'Ничего общего.'),
  ];

  it('находит слово во всех материалах, строки — как их видит игрок, по порядку', () => {
    const found = searchCase(mats, '845');
    expect(found.map((f) => f.id)).toEqual(['25']);
    expect(found[0]?.hits.map((h) => h.k)).toEqual([0, 1]);
    expect(found[0]?.hits[0]).toMatchObject({ match: '845', before: '3 · ключ плоский, номер ' });
  });

  it('регистр и ё/е не важны; короче двух знаков — не ищет', () => {
    expect(searchCase(mats, 'ЕЛК')[0]?.hits.map((h) => h.match)).toEqual(['Ёлк', 'Елк']);
    expect(searchCase(mats, 'е')).toEqual([]);
  });

  it('разметка не мешает: ссылки, заголовки, жирный', () => {
    expect(plainLine('## Раздел [сайт](http://x.com) **важно**')).toBe('Раздел сайт важно');
  });
});
