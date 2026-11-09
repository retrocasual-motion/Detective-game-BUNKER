import { defaultState } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import {
  addDraft,
  addressBook,
  dropEmptyDrafts,
  emailIn,
  missingFields,
  quoteCard,
  setField,
  swapCards,
  wholeCard,
} from './drafts.ts';

describe('черновики ходатайств', () => {
  it('не больше четырёх; пустые убираются при закрытии', () => {
    let s = defaultState([]);
    for (const id of ['a', 'b', 'c', 'd', 'e']) s = addDraft(id)(s);
    expect(s.drafts.map((d) => d.id)).toEqual(['a', 'b', 'c', 'd']);
    s = setField('b', 'to', 'zapros@okrug-bureau.org')(s);
    expect(dropEmptyDrafts(s).drafts.map((d) => d.id)).toEqual(['b']);
  });

  it('новая карточка в поле заменяет прежнюю; пустые поля — к подсветке', () => {
    let s = addDraft('a')(defaultState([]));
    s = setField('a', 'ask', { file: '04', quote: 'один' })(s);
    s = setField('a', 'ask', { file: '06', quote: 'два' })(s);
    const d = s.drafts[0];
    expect(d?.ask).toEqual({ file: '06', quote: 'два' });
    expect(d && missingFields(d)).toEqual(['to', 'basis']);
  });

  it('карточку тянут в другое поле: в пустое — переходит, с занятым — меняются местами', () => {
    const one = { file: '04', quote: 'один' };
    const two = { file: '06', quote: 'два' };
    let s = addDraft('a')(defaultState([]));
    s = setField('a', 'ask', one)(s);
    s = swapCards('a', 'ask')(s);
    expect(s.drafts[0]).toMatchObject({ ask: null, basis: one });
    s = setField('a', 'ask', two)(s);
    s = swapCards('a', 'basis')(s);
    expect(s.drafts[0]).toMatchObject({ ask: one, basis: two });
    // Из пустого поля тянуть нечего.
    s = setField('a', 'ask', null)(s);
    expect(swapCards('a', 'ask')(s)).toEqual(s);
  });
});

describe('карточки и адреса', () => {
  it('материал целиком — цитата его название; выделение — одна строка', () => {
    expect(wholeCard({ id: '13', title: 'Вводный фильм' })).toEqual({
      file: '13',
      quote: 'Вводный фильм',
    });
    expect(quoteCard('06', '  Эмма Пирс\n  координатор ')).toEqual({
      file: '06',
      quote: 'Эмма Пирс координатор',
    });
    expect(quoteCard('06', '   ')).toBeNull();
  });

  it('адресная книга — все адреса из материалов игрока, без повторов', () => {
    const book = addressBook([
      { body: '**От:** Бюро <zapros@okrug-bureau.org>' },
      { body: 'пишите на Zapros@okrug-bureau.org. или info@vaultline-program.com' },
    ]);
    expect(book).toEqual(['info@vaultline-program.com', 'zapros@okrug-bureau.org']);
    expect(emailIn('адрес: documents@vaultline-program.com.')).toBe(
      'documents@vaultline-program.com',
    );
    expect(emailIn('нет адреса')).toBeNull();
  });
});
