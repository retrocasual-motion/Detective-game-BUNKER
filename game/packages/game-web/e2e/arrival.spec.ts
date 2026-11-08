import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test } from './fixtures.ts';

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

test('открытый материал вешается на стену новой колонкой; записка ведёт к ней (IN-B)', async ({
  page,
}) => {
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await expect(page.getByTestId('dev-line-log').locator('li').first()).toContainText(
    'открыто: L101',
  );
  await page.getByTestId('dev-line-tab').click();
  const note = page.getByTestId('arrival-note');
  await expect(note).toContainText('Поступило на стену: L101');
  await note.click();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
  await expect(page.getByTestId('column-a1')).toHaveText('Поступление № 1');
  await expect(page.getByTestId('column-a1')).toBeInViewport();
  await sheet(page, 'L101').click(STRIP);
  await expect(page.getByTestId('viewer')).toContainText('vaultline-program.com');
});

test('после перезагрузки поступление висит в своей колонке', async ({ page }) => {
  await run(page, 'АДРЕС | браузер | vaultline-program.com');
  await page.waitForTimeout(800);
  await page.reload();
  await page.keyboard.press('ArrowUp');
  await expect(sheet(page, 'L101')).toHaveAttribute('data-place', 'column');
  await expect(page.getByTestId('column-a1')).toHaveText('Поступление № 1');
});

test('до открытия закрытого материала его текста нет в браузере (P-10)', async ({ page }) => {
  const materials = (await (await page.request.get('/api/materials')).json()) as { id: string }[];
  expect(materials.some((m) => m.id.startsWith('L'))).toBe(false);
  await expect(page.locator('body')).not.toContainText('Запросы документов');
});
