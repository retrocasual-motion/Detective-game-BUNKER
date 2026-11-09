import { describe, expect, it } from 'vitest';
import { letterBody, letterPetition } from './letter.ts';

describe('письмо-ответ (RP-A)', () => {
  const parts = {
    n: 3,
    to: 'zapros@okrug-bureau.org',
    reply: 'Укажите один код.',
    attached: [],
    ask: { file: '04', quote: 'Коды пользователей 02, 05 — сеансы «Принято в учёт»' },
    basis: { file: 'M001', quote: 'Ответ на ходатайство № 1' },
  };

  it('из тела письма читаются адрес и обе карточки ходатайства', () => {
    expect(letterPetition(letterBody(parts))).toEqual({
      to: parts.to,
      ask: parts.ask,
      basis: parts.basis,
    });
  });

  it('с вложениями — так же; не письмо-ответ — null', () => {
    const body = letterBody({ ...parts, attached: ['L452 — Экспорт ящика'] });
    expect(letterPetition(body)?.ask).toEqual(parts.ask);
    expect(letterPetition('# Сайт mailbridge.net\n\nПрошу: что-то')).toBeNull();
  });
});
