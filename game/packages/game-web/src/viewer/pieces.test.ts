import { describe, expect, it } from 'vitest';
import { splitSection } from './pieces.ts';

describe('splitSection', () => {
  const body = '# Вещи\n\n| a |\n\n## Лист (п. 1)\n\nОбрывок.\n> …в 1998…\n\n## Ещё\n\nхвост';
  it('раздел — до следующего заголовка; остальное — без него', () => {
    const r = splitSection(body, 'Лист (п. 1)');
    expect(r.section).toBe('Обрывок.\n> …в 1998…');
    expect(r.rest).toBe('# Вещи\n\n| a |\n\n## Ещё\n\nхвост');
  });
  it('нет раздела — лист как есть', () => {
    expect(splitSection(body, 'Нет')).toEqual({ rest: body, section: '' });
  });
});
