import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const folder = (page: Page) => page.getByTestId('verdict-folder');
const question = (page: Page) => page.getByTestId('verdict-question');

/** «Решить дело» → предупреждение → «Продолжить»: форма открыта (A-243, A-270). */
async function openForm(page: Page) {
  await page.getByTestId('solve-case').click();
  await expect(page.getByTestId('solve-warning')).toBeVisible();
  await page.getByTestId('solve-continue').click();
  await expect(folder(page)).toBeVisible();
}

test('«Решить дело»: предупреждение ни к чему не обязывает — «Вернуться к делу»', async ({
  page,
}) => {
  await page.getByTestId('solve-case').click();
  await expect(page.getByTestId('solve-warning')).toContainText('назад пути нет');
  await page.getByTestId('solve-back').click();
  await expect(page.getByTestId('solve-warning')).toHaveCount(0);
  await expect(page.getByTestId('solve-case')).toBeVisible();
});

test('форма: пять вопросов по одному, проверка, исправить, отправить — ответ бюро сразу, эпилог на столе', async ({
  page,
}) => {
  await openForm(page);
  // Кнопка ушла: расследование закрыто (P-9).
  await expect(page.getByTestId('solve-case')).toHaveCount(0);
  // Предупреждение и форма — окна «Решить дело», не материалы во «Входящих».
  await expect(page.getByTestId('arrival-note')).toHaveCount(0);

  // 1. Кто — карточка человека.
  await expect(page.getByText('Вопрос 1 из 5')).toBeVisible();
  await expect(question(page)).toHaveText('Кто действовал в момент гибели Адама Коула?');
  await page.getByTestId('verdict-person-p:moreau').click();
  await expect(page.getByTestId('verdict-person-p:moreau')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('verdict-next').click();

  // 2. Почему — карточка материала («В заключение целиком»).
  await expect(question(page)).toHaveText('Почему этот человек так поступил?');
  await page.getByTestId('verdict-corner').click();
  // Газета (15) лежит на столе: «Помним» — Том Бернар.
  await page.getByTestId('newspaper').click();
  await expect(page.getByTestId('viewer-whole-to-folder')).toHaveText('В заключение целиком');
  await page.getByTestId('viewer-whole-to-folder').click();
  await page.keyboard.press('Escape');
  await expect(folder(page)).toBeVisible();
  await expect(page.getByTestId('verdict-card')).toContainText('15');
  await page.getByTestId('verdict-next').click();

  // 3. Как — выбор из трёх, без «не установлено».
  await expect(page.getByTestId('verdict-option-2')).toHaveText('убили не специально, без умысла');
  await expect(page.getByTestId('verdict-option-3')).toHaveCount(0);
  await page.getByTestId('verdict-option-1').click();
  await page.getByTestId('verdict-next').click();

  // 4. Пусто — можно. 5. Кто за программой.
  await page.getByTestId('verdict-next').click();
  await page.getByTestId('verdict-person-p:hale').click();
  await expect(page.getByTestId('verdict-person-nobody')).toHaveCount(0);
  await page.getByTestId('verdict-next').click();

  // Проверьте заключение: исправить «как» до отправки (RT-B).
  await expect(page.getByTestId('verdict-answer-2')).toHaveText('столкнули намеренно');
  await expect(page.getByTestId('verdict-answer-3')).toHaveText('ответа нет');
  await page.getByTestId('verdict-edit-2').click();
  await page.getByTestId('verdict-option-2').click();
  for (let k = 0; k < 3; k++) await page.getByTestId('verdict-next').click();
  await expect(page.getByTestId('verdict-answer-0')).toHaveText('Лея Моро');
  await expect(page.getByTestId('verdict-answer-2')).toHaveText('убили не специально, без умысла');

  await page.getByTestId('verdict-send').click();

  // Ответ бюро — сразу на экране (автор 17.11): гибель Адама раскрыта, программа — нет.
  const result = page.getByTestId('verdict-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('Лея Моро — подтверждается');
  await expect(result).toContainText('убили не специально, без умысла — подтверждается');
  await expect(page.getByTestId('verdict-result-total')).toContainText(
    'Гибель Адама Коула: раскрыто',
  );
  await expect(page.getByTestId('verdict-result-total')).toContainText('Программа: не раскрыто');
  // Писем нет: «Входящие» не пополнились.
  await expect(page.getByTestId('arrival-note')).toHaveCount(0);

  // «Дальше» — стол: конверт с эпилогом светится, записка зовёт открыть.
  await page.getByTestId('verdict-result-next').click();
  await expect(result).toHaveCount(0);
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
  const envelope = page.getByTestId('epilogue-envelope');
  await expect(envelope).toHaveClass(/desk-spot-fresh/);
  await expect(page.getByTestId('epilogue-note')).toBeVisible();
  await envelope.click();
  await expect(page.getByTestId('viewer')).toContainText('Эпилог');
  // Эпилог не закрыть — «Завершить дело» → титры → «Вернуться к делу».
  await page.getByTestId('finish-case').click();
  await page.getByTestId('credits-menu').click();
  await page.getByTestId('menu-continue').click();
  await expect(envelope).not.toHaveClass(/desk-spot-fresh/);
  await expect(page.getByTestId('epilogue-note')).toHaveCount(0);

  // В папке «Заключение» — ответы и «Ответ бюро» снова.
  await page.getByTestId('verdict-corner').click();
  await expect(page.getByTestId('verdict-edit-0')).toHaveCount(0);
  await page.getByTestId('verdict-open-result').click();
  await expect(result).toBeVisible();
});

test('ответы формы сохраняются: после перезагрузки — тот же вопрос и ответ', async ({ page }) => {
  await openForm(page);
  await page.getByTestId('verdict-person-p:moreau').click();
  await page.getByTestId('verdict-next').click();
  await expect(question(page)).toHaveText('Почему этот человек так поступил?');
  // Сохранение уходит с задержкой — ждём, пока сервер его примет.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByTestId('solve-case')).toHaveCount(0);
  await page.getByTestId('verdict-corner').click();
  await expect(question(page)).toHaveText('Почему этот человек так поступил?');
  await page.getByTestId('verdict-prev').click();
  await expect(page.getByTestId('verdict-person-p:moreau')).toHaveAttribute('aria-pressed', 'true');
});

test('карточку человека можно перетащить со стены в ответ «кто»', async ({ page }) => {
  await openForm(page);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-moving', 'false');
  const card = page.getByTestId('wall-p:moreau');
  const from = await card.boundingBox();
  const to = await page.getByTestId('verdict-people').boundingBox();
  if (!from || !to) throw new Error('нет карточки или формы');
  const covered = await page.evaluate(
    ([x, y]) => !document.elementFromPoint(x, y)?.closest('[data-testid="wall-p:moreau"]'),
    [from.x + from.width / 2, from.y + 12] as const,
  );
  test.skip(covered, 'карточка под папкой при этой раскладке');
  await page.mouse.move(from.x + from.width / 2, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + 10, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('verdict-person-p:moreau')).toHaveAttribute('aria-pressed', 'true');
});

test('конец игры: эпилог → «Завершить дело» → титры → главное меню', async ({ page }) => {
  await openForm(page);
  for (let k = 0; k < 5; k++) await page.getByTestId('verdict-next').click();
  await page.getByTestId('verdict-send').click();
  await page.getByTestId('verdict-result-next').click();
  await page.getByTestId('epilogue-envelope').click();
  await expect(page.getByTestId('viewer')).toContainText('Голосовое сообщение');
  await expect(page.getByTestId('viewer')).toContainText('The Signal');
  // Закрыть эпилог нельзя (автор 17.11): ни Esc, ни ✕, ни щелчок мимо — только «Завершить дело».
  await page.keyboard.press('Escape');
  await page.mouse.click(20, 400);
  await expect(page.getByTestId('viewer')).toBeVisible();
  await expect(page.getByTestId('viewer-tools')).toBeHidden();
  // Кнопка — прямо под статьёй.
  const paper = await page.getByTestId('viewer-paper').boundingBox();
  const btn = await page.getByTestId('finish-case').boundingBox();
  expect((btn?.y ?? 0) - ((paper?.y ?? 0) + (paper?.height ?? 0))).toBeGreaterThanOrEqual(0);
  expect((btn?.y ?? 0) - ((paper?.y ?? 0) + (paper?.height ?? 0))).toBeLessThan(60);
  await page.getByTestId('finish-case').click();
  await expect(page.getByTestId('credits')).toContainText('Дело № 09-1128 закрыто');
  await page.getByTestId('credits-menu').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('menu-continue')).toHaveText('Вернуться к делу');
});
