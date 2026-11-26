import type { Material } from '@bunker/shared';
import type { Page } from '@playwright/test';
import { expect, test, toWall } from './fixtures.ts';

/**
 * Поэтапная выдача (SD5-A, A-288 п. 10; автор 26.11): сначала бумаги; вещдоки — из камеры хранения
 * после звонка: открыто ≥ 70 % бумаг и прошло ≥ 20 минут игры — или 40 минут. До звонка их нет ни на
 * столе, ни в ответе сервера; в описи у их строк — «в камере хранения». Короба вносят, когда игрок не
 * смотрит на стол.
 */
test.use({ sealed: true, staged: true });

const materialIds = async (page: Page) =>
  ((await (await page.request.get('/api/materials')).json()) as Material[]).map((m) => m.id);
const play = (page: Page, ms: number) =>
  page.evaluate((t) => (window as unknown as { __play: (ms: number) => void }).__play(t), ms);

test('до звонка вещдоков нет; рано — не звонит; 40 минут — звонок, трубка, короба — когда отвернулся', async ({
  page,
}) => {
  // Вещдоков нет ни на столе, ни у сервера.
  await expect(page.getByTestId('container-seized')).toHaveCount(0);
  await expect(page.getByTestId('container-personal')).toHaveCount(0);
  expect(await materialIds(page)).not.toContain('47');
  // Опись: у строк вещдоков — карандашом «в камере хранения».
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('Ноутбук руководителя');
  await page.getByTestId('search-04').locator('.search-hit').first().click();
  await expect(page.locator('.viewer-paper tr.inventory-stored').first()).toBeAttached();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // 10 минут — рано: телефон молчит.
  await play(page, 10 * 60_000);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('dp-lcd')).not.toContainText('Входящий');
  // 40 минут — звонят в любом случае.
  await play(page, 31 * 60_000);
  await expect(page.getByTestId('dp-lcd')).toContainText('Входящий вызов');
  expect(await materialIds(page)).toContain('47');
  // Игрок смотрит на стол — короба ещё несут.
  await expect(page.getByTestId('container-seized')).toHaveCount(0);
  // Снял трубку — дежурный камеры хранения.
  await page.getByTestId('desk-phone').click();
  await page.getByTestId('dp-handset').click();
  await expect(page.getByTestId('dp-heard')).toContainText('Камера хранения');
  await page.getByTestId('dp-handset').click();
  await page.keyboard.press('Escape');
  // Отвернулся к стене и вернулся — короба у стола.
  await toWall(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('container-seized')).toBeVisible();
  await expect(page.getByTestId('container-personal')).toBeVisible();
  // После перезагрузки — так же.
  await page.reload();
  await expect(page.getByTestId('container-seized')).toBeVisible();
});

test('не взял трубку — короба всё равно приходят', async ({ page }) => {
  await play(page, 41 * 60_000);
  await expect(page.getByTestId('dp-lcd')).toContainText('Входящий вызов');
  await toWall(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('container-seized')).toBeVisible();
});
