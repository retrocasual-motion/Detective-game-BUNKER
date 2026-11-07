import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

async function pin(page: Page, cardId: string) {
  await page.getByTestId(`view-tab-desk`).click();
  await page.getByTestId(`card-${cardId}`).dblclick();
  await page.getByTestId('viewer').getByRole('button', { name: 'Прикрепить к доске' }).click();
  await page.keyboard.press('Escape');
}

const items = (page: Page) => page.locator('[data-testid^="board-item-"]');
const threads = (page: Page) => page.locator('[data-testid^="board-thread-"]');

async function connectFirstTwo(page: Page) {
  await page.getByTestId('thread-mode').click();
  await items(page).nth(0).click();
  await items(page).nth(1).click();
}

test('копии на доске, материал остаётся на столе', async ({ page }) => {
  await pin(page, '01');
  await pin(page, '03');
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(46);
  await page.getByTestId('view-tab-right').click();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0)).toContainText('Входящее письмо');
});

test('нить с подписью сохраняется после перезагрузки', async ({ page }) => {
  await pin(page, '01');
  await pin(page, '03');
  await page.getByTestId('view-tab-right').click();
  await connectFirstTwo(page);
  await expect(threads(page)).toHaveCount(1);

  await threads(page).first().dblclick({ force: true });
  const label = page.getByTestId('thread-label-input');
  await label.fill('одна дата');
  await label.press('Enter');
  await expect(page.getByTestId('view-right')).toContainText('одна дата');

  await page.waitForResponse(
    (r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT',
  );
  await page.reload();
  await expect(threads(page)).toHaveCount(1);
  await expect(page.getByTestId('view-right')).toContainText('одна дата');
});

test('удалённая копия забирает свои нити', async ({ page }) => {
  await pin(page, '01');
  await pin(page, '03');
  await page.getByTestId('view-tab-right').click();
  await connectFirstTwo(page);
  await expect(threads(page)).toHaveCount(1);

  await items(page).nth(0).click();
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(1);
  await expect(threads(page)).toHaveCount(0);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);
  await page.getByTestId('view-tab-desk').click();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(46);
});
