import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await toWall(page);
  await sheet(page, '29').click(STRIP);
});

/** Глубоко приблизить лист в точке (как колесом игрока) — до крупного плана. */
async function zoomInAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -120);
}

test('превью пачек (PK-B): девять сканов стопок; торец по числу листов; картон — у П-02 и П-09', async ({
  page,
}) => {
  for (let n = 1; n <= 9; n++) await expect(page.getByTestId(`bundle-П-0${n}`)).toHaveCount(1);
  await expect(page.getByTestId('layer-П-02')).toHaveCount(1);
  await expect(page.getByTestId('layer-П-09')).toHaveCount(5);
  await expect(page.getByTestId('layer-П-01')).toHaveCount(0);
  const thick = await page.getByTestId('edge-П-01').boundingBox();
  const thin = await page.getByTestId('edge-П-03').boundingBox();
  expect(thick?.height ?? 0).toBeGreaterThan((thin?.height ?? 0) * 1.5);
  // Слой картона П-02 — выше середины торца (лист 18 из 41).
  const edge = await page.getByTestId('edge-П-02').boundingBox();
  const layer = await page.getByTestId('layer-П-02').boundingBox();
  if (!edge || !layer) throw new Error('нет торца');
  expect(layer.y - edge.y).toBeLessThan(edge.height / 2);
});

test('глубоко приблизить торец — его осмотр: П-02 — картон, лист 18; прочие — подложка сканера', async ({
  page,
}) => {
  const e = await page.getByTestId('edge-П-02').boundingBox();
  if (!e) throw new Error('нет торца');
  await zoomInAt(page, e.x + e.width / 2, e.y + e.height / 2);
  await expect(page.getByTestId('viewer-closeup')).toContainText('слой картона — лист 18');
  await expect(page.getByTestId('arrival-note')).toContainText('L981');
  await page.mouse.click(683, 400, { button: 'middle' });
  const p = await page.getByTestId('edge-П-03').boundingBox();
  if (!p) throw new Error('нет торца');
  await zoomInAt(page, p.x + p.width / 2, p.y + p.height / 2);
  await expect(page.getByTestId('viewer-closeup')).toContainText('Подложка сканера');
});

test('щелчок по стопке — опись пачки; строки 19–24 П-05 вблизи — пересканы лицом вверх (FV-A)', async ({
  page,
}) => {
  await page.getByTestId('bundle-П-05').locator('.bundle-top').click();
  await expect(page.getByTestId('viewer-paper')).toContainText('пачка П-05');
  const row = page.locator('tr[data-osmotr-target="L985 лист 19–24"]');
  await expect(row).toHaveCount(1);
  // Сначала соседняя строка (первая страница): у движка на неё общий ответ «ничего сверх» —
  // игра его не показывает (quiet, этап 4b-1), ничего не открывается.
  const other = page.locator('tr[data-osmotr-target="L985 лист 13–18"]');
  await expect(other).toBeInViewport();
  const o = await other.boundingBox();
  if (!o) throw new Error('нет строки 13–18');
  await zoomInAt(page, o.x + o.width / 2, o.y + o.height / 2);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('viewer-closeup')).toHaveCount(0);
  await page.mouse.click(683, 400, { button: 'middle' });
  // Строка 19–24 — на второй странице.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('page-no')).toHaveText(/^2 \//);
  await expect(row).toBeInViewport();
  const r = await row.boundingBox();
  if (!r) throw new Error('нет строки');
  await zoomInAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.getByTestId('viewer-closeup')).toContainText('Листы 19–24 перевёрнуты');
  await expect(page.getByTestId('arrival-note')).toContainText('L957');
});
