import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const center = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`нет ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Защита от второго щелчка двойного клика — 400 мс после открытия. */
const pastOpenGuard = (page: Page) => page.waitForTimeout(450);

test('один щелчок по листу открывает материал, Esc закрывает', async ({ page }) => {
  await page.getByTestId('card-01').click();
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toContainText('Дело № 09-1128 — возобновление');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('щелчок мимо листа закрывает просмотрщик', async ({ page }) => {
  await page.getByTestId('card-01').click();
  await pastOpenGuard(page);
  await page.mouse.click(20, 400);
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('крестик — у угла листа, закрывает', async ({ page }) => {
  await page.getByTestId('card-01').click();
  const close = page.getByTestId('viewer').getByRole('button', { name: 'Закрыть' });
  const paper = await page.getByTestId('viewer-paper').boundingBox();
  const btn = await close.boundingBox();
  expect((btn?.x ?? 0) - ((paper?.x ?? 0) + (paper?.width ?? 0))).toBeLessThan(40);
  expect((btn?.y ?? 0) - (paper?.y ?? 0)).toBeLessThan(40);
  await close.click();
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('двойной клик по листу открывает и не закрывает сразу', async ({ page }) => {
  await page.getByTestId('card-02').dblclick();
  await page.waitForTimeout(200);
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('выделение текста, законченное мимо листа, не закрывает', async ({ page }) => {
  await page.getByTestId('card-01').click();
  await pastOpenGuard(page);
  const p = await center(page, 'viewer-paper');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(20, p.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('Enter на листе в фокусе открывает материал', async ({ page }) => {
  await page.getByTestId('card-04').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('щелчок сразу после перетаскивания не открывает материал', async ({ page }) => {
  const p = await center(page, 'card-02');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.mouse.click(p.x + 60, p.y + 60);
  await page.waitForTimeout(200);
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('длинный материал прокручивается до конца', async ({ page }) => {
  await page.getByTestId('card-07').click();
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
  await page.getByTestId('card-01').click();
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, -600);
  await page.keyboard.press('Escape');
  await page.mouse.move(1300, 700);
  expect((await page.getByTestId('card-01').boundingBox())?.width).toBe(before);
});

test('стрелки при открытом просмотрщике не переключают вид', async ({ page }) => {
  await page.getByTestId('card-01').click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('view-desk')).toBeVisible();
});

test('строки шапки письма не склеиваются: «Кому:» ниже «От:»', async ({ page }) => {
  await page.getByTestId('card-01').click();
  const paper = page.getByTestId('viewer-paper');
  const from = await paper.getByText('От:', { exact: true }).boundingBox();
  const to = await paper.getByText('Кому:', { exact: true }).boundingBox();
  expect(to?.y ?? 0).toBeGreaterThan((from?.y ?? 0) + 5);
});
