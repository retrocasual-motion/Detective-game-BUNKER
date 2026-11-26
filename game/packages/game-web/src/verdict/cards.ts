import type { Card, Material } from '@bunker/shared';
import { create } from 'zustand';
import { useGame } from '../store.ts';
import { formQuestions, useVerdict, verdictActive } from './verdict-store.ts';

/**
 * Карточки для формы заключения (FM-A: «материал или выдержка», K-A). До A-272 те же жесты
 * клали карточку в папку запроса; запросов больше нет — карточка идёт только в вопрос о
 * материале открытой формы.
 */

/** Карточка «материал целиком» (медиа, лист со стены, лист из лотка): цитата — название. */
export const wholeCard = (m: Pick<Material, 'id' | 'title'>): Card => ({
  file: m.id,
  quote: m.title,
});

/** Карточка из выделенной строки: переводы строк — пробел, длина — в пределах. */
export const quoteCard = (file: string, text: string): Card | null => {
  const quote = text.replace(/\s+/gu, ' ').trim().slice(0, 2000);
  return quote ? { file, quote } : null;
};

/** Карточка — в текущий вопрос открытой формы; формы нет — ничего. */
export function toVerdict(card: Card | null): void {
  if (card && verdictActive()) useVerdict.getState().addCard(card);
}

/** Пока форма открыта, у выделения есть кнопка «В заключение». */
export const useVerdictOpen = (): boolean => useVerdict((v) => v.status.form && !v.status.sent);

/**
 * Форма открыта и её текущий вопрос — о материале (RV-42): только тогда «В заключение» что-то делает.
 * На вопросе о человеке, варианте или на проверке кнопки нет — раньше она молча ничего не делала.
 */
export const useVerdictTakesMaterial = (): boolean => {
  const open = useVerdictOpen();
  const step = useGame((g) => g.state?.verdict?.step ?? 0);
  useGame((g) => g.materials.find((m) => m.id === 'L999')?.body);
  return open && formQuestions()[step]?.kind === 'material';
};

/** Поле вопроса открытой формы под точкой экрана (сюда бросают лист). */
export function folderFieldAt(x: number, y: number): boolean {
  return document
    .elementsFromPoint(x, y)
    .some((el) => el.closest('[data-petition-field]') !== null);
}

/** Точка экрана над открытой папкой формы. */
export const overFolder = (x: number, y: number): boolean =>
  document.elementsFromPoint(x, y).some((el) => el.closest('.petition-open .petition-folder'));

/** Над формой тянут лист — поле вопроса подсвечено: сюда ляжет карточка. */
export const useCardDrop = create<{ over: boolean; setOver(over: boolean): void }>((set) => ({
  over: false,
  setOver: (over) => set({ over }),
}));
