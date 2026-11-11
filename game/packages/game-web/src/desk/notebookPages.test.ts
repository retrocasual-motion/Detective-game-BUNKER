import { describe, expect, it } from 'vitest';
import { canNext, pagesOf, withPage } from './notebookPages.ts';

describe('страницы блокнота', () => {
  it('прежний сплошной текст — первой страницей', () => {
    expect(pagesOf({ notebook: 'старое' })).toEqual(['старое']);
    expect(pagesOf({ notebook: 'старое', notebookPages: ['а', 'б'] })).toEqual(['а', 'б']);
    expect(pagesOf(null)).toEqual(['']);
  });
  it('запись на новой странице добавляет её; пустые страницы в конце не копятся', () => {
    expect(withPage(['а'], 1, 'б')).toEqual(['а', 'б']);
    expect(withPage(['а', 'б', '', ''], 1, 'в')).toEqual(['а', 'в', '']);
  });
  it('вперёд — только если дальше есть страница или эта исписана', () => {
    expect(canNext([''], 0)).toBe(false);
    expect(canNext(['а'], 0)).toBe(true);
    expect(canNext(['а', ''], 0)).toBe(true);
    expect(canNext(['а', ''], 1)).toBe(false);
  });
});
