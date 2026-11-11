import type { DraftField } from '@bunker/shared';

/** Поле открытой папки запроса под точкой экрана (сюда бросают лист или письмо). */
export function petitionFieldAt(x: number, y: number): DraftField | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const f = el.closest('[data-petition-field]')?.getAttribute('data-petition-field');
    if (f === 'to' || f === 'ask' || f === 'basis') return f;
  }
  return null;
}

/** Точка экрана над открытой папкой запроса. */
export const overFolder = (x: number, y: number): boolean =>
  document.elementsFromPoint(x, y).some((el) => el.closest('.petition-open .petition-folder'));
