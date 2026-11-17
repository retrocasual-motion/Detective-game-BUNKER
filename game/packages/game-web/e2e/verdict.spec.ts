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
  await expect(page.getByTestId('petition-corner')).toBeVisible();
  await expect(page.getByTestId('solve-case')).toBeVisible();
});

test('форма: пять вопросов по одному, проверка, исправить, отправить — ответ бюро письмом', async ({
  page,
  request,
}) => {
  await openForm(page);
  // Папка запроса и кнопка ушли: расследование закрыто (P-9).
  await expect(page.getByTestId('petition-corner')).toHaveCount(0);
  await expect(page.getByTestId('solve-case')).toHaveCount(0);
  // Предупреждение и форма — окна «Решить дело», не материалы во «Входящих».
  await expect(page.getByTestId('arrival-note')).toHaveCount(0);

  // 1. Кто — карточка человека.
  await expect(page.getByText('Вопрос 1 из 5')).toBeVisible();
  await expect(question(page)).toHaveText('Кто действовал в момент гибели Адама Коула?');
  await page.getByTestId('verdict-person-p:moreau').click();
  await expect(page.getByTestId('verdict-person-p:moreau')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('verdict-next').click();

  // 2. Почему — карточка материала, тем же жестом, что в запрос («В заключение целиком»).
  await expect(question(page)).toHaveText('Почему этот человек так поступил?');
  await page.getByTestId('verdict-corner').click();
  // Газета (15) лежит на столе: «Помним» — Том Бернар.
  await page.getByTestId('newspaper').click();
  await expect(page.getByTestId('viewer-whole-to-petition')).toHaveText('В заключение целиком');
  await page.getByTestId('viewer-whole-to-petition').click();
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
  await expect(page.getByTestId('verdict-sent')).toBeVisible();
  await expect(page.getByTestId('verdict-edit-0')).toHaveCount(0);

  // Ответ бюро — письмом через задержку; гибель Адама раскрыта, программа — нет.
  await expect
    .poll(async () => {
      const all = (await (await request.get('/api/materials')).json()) as {
        title: string;
        body: string;
      }[];
      return all.find((m) => m.title === 'Ответ бюро на заключение')?.body ?? '';
    })
    .toContain('**Гибель Адама Коула:** раскрыто.');
  const all = (await (await request.get('/api/materials')).json()) as {
    title: string;
    body: string;
  }[];
  const letter = all.find((m) => m.title === 'Ответ бюро на заключение')?.body ?? '';
  expect(letter).toContain('Ваш ответ: Лея Моро — подтверждается.');
  expect(letter).toContain('**Программа:** не раскрыто.');
  expect(all.some((m) => m.title === 'Эпилог')).toBe(true);
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
