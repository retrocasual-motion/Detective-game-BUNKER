import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const center = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`нет ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('двойной клик открывает материал, Esc закрывает', async ({ page }) => {
  await page.getByTestId('card-01').dblclick();
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toContainText('Дело № 09-1128 — возобновление');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('кнопка «Закрыть» закрывает просмотрщик', async ({ page }) => {
  await page.getByTestId('card-01').dblclick();
  await page.getByTestId('viewer').getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('Enter на карточке в фокусе открывает материал', async ({ page }) => {
  await page.getByTestId('card-04').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('двойной клик сразу после перетаскивания не открывает материал', async ({ page }) => {
  const p = await center(page, 'card-02');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
  await page.waitForTimeout(200);
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('длинный материал прокручивается до конца', async ({ page }) => {
  await page.getByTestId('card-07').dblclick();
  const paper = page.getByTestId('viewer-paper');
  await expect(paper).toContainText('План объекта');
  const scrollable = await paper.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrollable).toBe(true);
  await paper.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(paper.getByText('служебная лестница и общая лестница')).toBeInViewport();
});

test('при открытом просмотрщике колесо не масштабирует стол', async ({ page }) => {
  const before = (await page.getByTestId('card-01').boundingBox())?.width;
  await page.getByTestId('card-01').dblclick();
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, -600);
  await page.keyboard.press('Escape');
  expect((await page.getByTestId('card-01').boundingBox())?.width).toBe(before);
});

test('стрелки при открытом просмотрщике не переключают вид', async ({ page }) => {
  await page.getByTestId('card-01').dblclick();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('view-desk')).toBeVisible();
});

test('строки шапки письма не склеиваются: «Кому:» ниже «От:»', async ({ page }) => {
  await page.getByTestId('card-01').dblclick();
  const paper = page.getByTestId('viewer-paper');
  const from = await paper.getByText('От:', { exact: true }).boundingBox();
  const to = await paper.getByText('Кому:', { exact: true }).boundingBox();
  expect(to?.y ?? 0).toBeGreaterThan((from?.y ?? 0) + 5);
});
