import type { Page } from '@playwright/test';
import { expect, test, toWall } from './fixtures.ts';

/** Действие через служебную строку разработки (E2-CHECK-A). */
async function run(page: Page, line: string) {
  const input = page.getByTestId('dev-line-input');
  if (!(await input.isVisible())) await page.getByTestId('dev-line-tab').click();
  await input.fill(line);
  await page.getByTestId('dev-line-run').click();
  await expect(page.getByTestId('dev-line-log').locator('li').first()).toContainText(line);
}

const close = (page: Page) => page.getByTestId('dev-line-tab').click();

test('служебная строка: действие проходит через движок, ответ правила виден', async ({ page }) => {
  await run(page, 'АДРЕС | браузер | google.com');
  await expect(page.getByTestId('dev-line-log').locator('li').first()).toContainText('отказ');
  await expect(page.getByTestId('dev-line-log')).toContainText('Страница не найдена');
});

test('пустой лоток «Входящие» на столе — без писем', async ({ page }) => {
  await expect(page.getByTestId('inbox-tray')).toHaveText('Входящие');
  await expect(page.locator('[data-testid^="inbox-L"]')).toHaveCount(0);
});

test('открытое ложится во «Входящие» на столе: письмо стоит; прочитать → «На стену» → висит на стене', async ({
  page,
}) => {
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await close(page);
  await expect(page.getByTestId('inbox-tray')).toHaveText('Входящие · 1');
  // На стене его нет, пока игрок не повесит.
  await expect(page.getByTestId('wall-L101')).toHaveCount(0);
  await page.getByTestId('inbox-L101').click();
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toContainText('vaultline-program.com');
  await page.getByTestId('viewer-to-wall').click();
  await expect(page.getByTestId('viewer-to-wall')).toHaveText('На стене');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inbox-L101')).toHaveCount(0);
  await expect(page.getByTestId('inbox-tray')).toHaveText('Входящие');
  await toWall(page);
  await expect(page.getByTestId('wall-L101')).toBeInViewport();
});

test('письмо из «Входящих» можно мышкой перетащить прямо на доску за столом', async ({ page }) => {
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await close(page);
  const letter = await page.getByTestId('inbox-L101').boundingBox();
  if (!letter) throw new Error('нет письма');
  await page.mouse.move(letter.x + letter.width / 2, letter.y + 8);
  await page.mouse.down();
  await page.mouse.move(683, 200, { steps: 8 });
  await expect(page.getByTestId('drag-ghost')).toHaveClass(/ghost-ok/);
  await page.mouse.up();
  await expect(page.getByTestId('viewer')).toBeHidden();
  await expect(page.getByTestId('inbox-L101')).toHaveCount(0);
  await toWall(page);
  await expect(page.getByTestId('wall-L101')).toBeInViewport();
});

test('письмо, отпущенное мимо доски, остаётся в лотке', async ({ page }) => {
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await close(page);
  const letter = await page.getByTestId('inbox-L101').boundingBox();
  if (!letter) throw new Error('нет письма');
  await page.mouse.move(letter.x + letter.width / 2, letter.y + 8);
  await page.mouse.down();
  await page.mouse.move(683, 720, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('inbox-L101')).toBeVisible();
});

test('лист со стены «На стену» не предлагает', async ({ page }) => {
  await toWall(page);
  await page.getByTestId('wall-01').click({ position: { x: 25, y: 24 } });
  await expect(page.getByTestId('viewer')).toBeVisible();
  await expect(page.getByTestId('viewer-to-wall')).toHaveCount(0);
});

test('у стены записка о поступлении ведёт к столу', async ({ page }) => {
  await toWall(page);
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await close(page);
  const note = page.getByTestId('arrival-note');
  await expect(note).toContainText('Поступило во «Входящие» на столе: L101');
  await note.click();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
  await expect(page.getByTestId('inbox-L101')).toBeVisible();
});

test('после перезагрузки непрочитанное стоит в лотке', async ({ page }) => {
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId('inbox-L101')).toBeVisible();
});

test('до открытия закрытого материала его текста нет в браузере (P-10)', async ({ page }) => {
  const materials = (await (await page.request.get('/api/materials')).json()) as { id: string }[];
  expect(materials.some((m) => m.id.startsWith('L'))).toBe(false);
  await expect(page.locator('body')).not.toContainText('Запросы документов');
});

test('служебные кнопки: «Подготовка» открывает нужное для ходатайств, «Разложить» — стену по порядку', async ({
  page,
}) => {
  await page.getByTestId('dev-line-tab').click();
  await page.getByTestId('dev-prepare').click();
  await expect(page.getByTestId('dev-line-log').locator('li').first()).toContainText('ПОДГОТОВКА');
  for (const id of [
    'L101',
    'L130',
    'L249',
    'L272',
    'L163',
    'L945',
    'L975',
    'L957',
    'L981',
    'L956',
    'L563',
  ])
    await expect(page.getByTestId('dev-line-log')).toContainText(id);
  await close(page);

  await toWall(page);
  const sheet = page.getByTestId('wall-07');
  const before = await sheet.boundingBox();
  if (!before) throw new Error('нет листа 07');
  await page.mouse.move(before.x + 25, before.y + 24);
  await page.mouse.down();
  await page.mouse.move(before.x + 260, before.y + 180, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await sheet.boundingBox())?.x).not.toBe(before.x);
  await page.getByTestId('dev-line-tab').click();
  await page.getByTestId('dev-arrange').click();
  await expect.poll(async () => (await sheet.boundingBox())?.x).toBeCloseTo(before.x, 0);
  expect((await sheet.boundingBox())?.y).toBeCloseTo(before.y, 0);
});
