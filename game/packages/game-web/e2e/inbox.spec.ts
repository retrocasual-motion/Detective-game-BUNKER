import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** Действие через служебную строку разработки (E2-CHECK-A). */
async function run(page: Page, line: string) {
  const input = page.getByTestId('dev-line-input');
  if (!(await input.isVisible())) await page.getByTestId('dev-line-tab').click();
  await input.fill(line);
  await page.getByTestId('dev-line-run').click();
  await expect(page.getByTestId('dev-line-log').locator('li').first()).toContainText(line);
}

test('служебная строка: действие проходит через движок, ответ правила виден', async ({ page }) => {
  await run(page, 'АДРЕС | браузер | google.com');
  await expect(page.getByTestId('dev-line-log').locator('li').first()).toContainText('отказ');
  await expect(page.getByTestId('dev-line-log')).toContainText('Страница не найдена');
});

test('открытый материал ложится в лоток «Входящие», рядом — записка о поступлении', async ({
  page,
}) => {
  await expect(page.getByTestId('inbox-tab')).toBeVisible();
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await expect(page.getByTestId('dev-line-log').locator('li').first()).toContainText(
    'открыто: L101',
  );
  // На столе (в россыпи) его нет — он в лотке.
  await expect(page.getByTestId('card-L101')).toHaveCount(0);
  await expect(page.getByTestId('inbox-note')).toContainText('Добавлено в дело: L101');
  await page.getByTestId('inbox-note').click();
  await expect(page.getByTestId('inbox-item-L101')).toBeVisible();
});

test('из лотка: щелчок открывает, «На стол» — кладёт на стол; после перезагрузки там же', async ({
  page,
}) => {
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await page.getByTestId('dev-line-tab').click();
  await page.getByTestId('inbox-tab').click();
  await page.getByTestId('inbox-item-L101').click();
  await expect(page.getByTestId('viewer')).toContainText('vaultline-program.com');
  await page.keyboard.press('Escape');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT',
  );
  await page.getByTestId('inbox-take-L101').click();
  await expect(page.getByTestId('card-L101')).toBeVisible();
  await expect(page.getByTestId('inbox-item-L101')).toHaveCount(0);
  await saved;
  await page.reload();
  await expect(page.getByTestId('card-L101')).toBeVisible();
});

test('лист из лотка можно утащить на стол в нужное место', async ({ page }) => {
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await page.getByTestId('dev-line-tab').click();
  await page.getByTestId('inbox-tab').click();
  const item = await page.getByTestId('inbox-item-L101').boundingBox();
  if (!item) throw new Error('нет листа в лотке');
  await page.mouse.move(item.x + 20, item.y + item.height / 2);
  await page.mouse.down();
  await page.mouse.move(400, 400, { steps: 10 });
  await page.mouse.up();
  const card = await page.getByTestId('card-L101').boundingBox();
  expect(card).not.toBeNull();
  expect(Math.abs((card?.x ?? 0) + (card?.width ?? 0) / 2 - 400)).toBeLessThan(60);
});

test('пустой лоток выглядит пустым (DG-4)', async ({ page }) => {
  await page.getByTestId('inbox-tab').click();
  await expect(page.getByTestId('inbox-panel')).toContainText('Лоток пуст');
});

test('до открытия закрытого материала его текста нет в браузере (P-10)', async ({ page }) => {
  const materials = (await (await page.request.get('/api/materials')).json()) as { id: string }[];
  expect(materials.some((m) => m.id.startsWith('L'))).toBe(false);
  await expect(page.locator('body')).not.toContainText('Запросы документов');
});

test('открытый лоток не закрывает стрелку «Доска»', async ({ page }) => {
  await page.getByTestId('inbox-tab').click();
  const panel = await page.getByTestId('inbox-panel').boundingBox();
  const arrow = await page.getByTestId('nav-right').boundingBox();
  expect((panel?.x ?? 0) + (panel?.width ?? 0)).toBeLessThanOrEqual(arrow?.x ?? 0);
});
