import type { Page } from '@playwright/test';
import { bringIntoView, expect, STRIP, savedPut, sheet, test, toWall } from './fixtures.ts';

/** Выделить строку в открытом листе — как мышью. */
async function selectText(page: Page, text: string) {
  await page.getByTestId('viewer-paper').evaluate((el, t) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent?.indexOf(t) ?? -1;
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + t.length);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return;
    }
    throw new Error(`нет текста: ${t}`);
  }, text);
}

async function cardFrom(page: Page, id: string, text: string) {
  await bringIntoView(page, id);
  await sheet(page, id).click(STRIP);
  await selectText(page, text);
  await page.getByTestId('to-petition').click();
  await page.keyboard.press('Escape');
}

/** Отправить запрос в бюро и дождаться письма M001 во «Входящих» (вид «Стол»). */
async function getLetter(page: Page) {
  await toWall(page);
  await page.getByTestId('petition-corner').click();
  await page.getByTestId('petition-field-to').locator('.petition-line').click();
  await page
    .getByTestId('address-book')
    .getByRole('button', { name: 'zapros@okrug-bureau.org' })
    .click();
  await cardFrom(page, '25', 'ключ плоский металлический, штамп DO NOT DUPLICATE, номер 845');
  await cardFrom(page, '45', 'Бумажник');
  await page.getByTestId('petition-send').click();
  await expect(page.getByTestId('petition-folder')).toBeHidden();
  await expect(page.getByTestId('arrival-note')).toContainText('M001', { timeout: 10_000 });
  await page.getByTestId('arrival-note').click();
  await expect(page.getByTestId('inbox-M001')).toBeVisible();
}

test('«Повторить запрос» (RP-A): черновик с тем же адресом и карточками, папка открыта', async ({
  page,
}) => {
  await getLetter(page);
  await page.getByTestId('inbox-M001').click();
  await page.getByTestId('viewer-repeat').click();
  await expect(page.getByTestId('petition-folder')).toBeVisible();
  await expect(page.getByTestId('petition-field-to')).toContainText('zapros@okrug-bureau.org');
  await expect(page.getByTestId('petition-field-ask')).toContainText('номер 845');
  await expect(page.getByTestId('petition-field-basis')).toContainText('Бумажник');
  // Активно «Прошу»: следующая строка заменит карточку, которая не подошла.
  await expect(page.getByTestId('petition-field-ask')).toHaveClass(/active/);
});

test('письмо — в корзину из просмотра; «Вернуть»; корзина — смятые письма, «Достать» во «Входящие»', async ({
  page,
}) => {
  await getLetter(page);
  await expect(page.getByTestId('trash-bin')).toContainText('Корзина');
  await page.getByTestId('inbox-M001').click();
  await page.getByTestId('viewer-to-trash').click();
  await expect(page.getByTestId('viewer')).toBeHidden();
  await expect(page.getByTestId('inbox-M001')).toHaveCount(0);
  await expect(page.getByTestId('trash-bin')).toContainText('Корзина · 1');

  // «Вернуть» — сразу обратно.
  await page.getByTestId('throw-toast').getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.getByTestId('inbox-M001')).toBeVisible();

  // Снова выбросить; сохраняется после перезагрузки.
  await page.getByTestId('inbox-M001').click();
  const saved = savedPut(page);
  await page.getByTestId('viewer-to-trash').click();
  await saved;
  await page.reload();
  await expect(page.getByTestId('trash-bin')).toContainText('Корзина · 1');

  await page.getByTestId('trash-bin').click();
  await expect(page.getByTestId('trash-M001')).toContainText('Ответ на запрос № 1');
  // Развернуть и прочитать прямо из корзины.
  await page.getByTestId('trash-M001').locator('.trash-crumple').click();
  await expect(page.getByTestId('viewer')).toContainText('Прошу: 25');
  await page.keyboard.press('Escape');
  await page.getByTestId('trash-out-M001').click();
  await expect(page.getByTestId('trash-M001')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('trash-view')).toBeHidden();
  await expect(page.getByTestId('inbox-M001')).toBeVisible();
});

test('письмо со стены — ✕ «В корзину»; у листов дела такой кнопки нет', async ({ page }) => {
  await getLetter(page);
  await page.getByTestId('inbox-M001').click();
  await page.getByTestId('viewer-to-wall').click();
  await page.keyboard.press('Escape');
  await toWall(page);
  await expect(sheet(page, 'M001')).toBeVisible();
  await expect(page.getByTestId('delete-25')).toHaveCount(0);
  await sheet(page, 'M001').hover();
  await page.getByTestId('delete-M001').click();
  await expect(sheet(page, 'M001')).toHaveCount(0);
  await expect(page.getByTestId('throw-toast')).toContainText('M001');
  // «Вернуть» — на прежнее место на стене.
  await page.getByTestId('throw-toast').getByRole('button', { name: 'Вернуть' }).click();
  await expect(sheet(page, 'M001')).toBeVisible();
});

test('письмо из «Входящих» можно бросить прямо в корзину', async ({ page }) => {
  await getLetter(page);
  const from = await page.getByTestId('inbox-M001').boundingBox();
  const to = await page.getByTestId('trash-bin').boundingBox();
  if (!from || !to) throw new Error('нет лотка или корзины');
  await page.mouse.move(from.x + from.width / 2, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('inbox-M001')).toHaveCount(0);
  await expect(page.getByTestId('trash-bin')).toContainText('Корзина · 1');
});
