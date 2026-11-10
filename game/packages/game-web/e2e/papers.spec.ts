import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

/** Глубоко приблизить лист в точке (колесом) — до крупного плана. */
async function zoomInAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -120);
}

test('пачки (PH-B): коробка на столе; пачка в руках — пролистать: опись; Esc — обратно к коробке', async ({
  page,
}) => {
  await page.getByTestId('device-29').click();
  for (let n = 1; n <= 9; n++) await expect(page.getByTestId(`stack-П-0${n}`)).toHaveCount(1);
  await page.getByTestId('stack-П-02').click({ force: true });
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
  await expect(page.getByTestId('stack-П-05')).toHaveCount(0);
  // Esc — пачку положили обратно, коробка в руках.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-05')).toHaveCount(1);
  await page.getByTestId('stack-П-02').click({ force: true });
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('viewer-paper')).toContainText('пачка П-02');
  await expect(page.getByTestId('viewer-paper')).toContainText('Картонная обложка');
  // Опись пришла в дело — во «Входящие» на столе (у стола лоток виден сам).
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inbox-L981')).toHaveCount(1);
});

test('опись П-05: строки 19–24 вблизи — пересканы лицом вверх (FV-A); соседние строки — тихо', async ({
  page,
}) => {
  await page.getByTestId('device-29').click();
  await page.getByTestId('stack-П-05').click({ force: true });
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('viewer-paper')).toContainText('пачка П-05');
  const other = page.locator('tr[data-osmotr-target="L985 лист 13–18"]');
  await expect(other).toBeInViewport();
  const o = await other.boundingBox();
  if (!o) throw new Error('нет строки 13–18');
  await zoomInAt(page, o.x + o.width / 2, o.y + o.height / 2);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('viewer-closeup')).toHaveCount(0);
  await page.mouse.click(683, 400, { button: 'middle' });
  // Строка 19–24 — на этой или следующей странице (зависит от шрифтов).
  const row = page.locator('tr[data-osmotr-target="L985 лист 19–24"]');
  const shown = () =>
    row.evaluate((tr) => {
      const box = tr.closest('.viewer-pages')?.getBoundingClientRect();
      const r = tr.getBoundingClientRect();
      return !!box && r.left >= box.left - 1 && r.right <= box.right + 1;
    });
  for (let k = 0; k < 4 && !(await shown()); k++) await page.keyboard.press('ArrowRight');
  expect(await shown()).toBe(true);
  const r = await row.boundingBox();
  if (!r) throw new Error('нет строки');
  await zoomInAt(page, r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.getByTestId('viewer-closeup')).toContainText('Листы 19–24 перевёрнуты');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inbox-L957')).toHaveCount(1);
});

test('на стене коробка — карточкой «Изъято · 29»; щелчок — коробка в руках', async ({ page }) => {
  await toWall(page);
  await expect(sheet(page, '29')).toContainText('Изъято · 29');
  await sheet(page, '29').click(STRIP);
  await expect(page.getByTestId('stack-П-01')).toHaveCount(1);
});

test.describe('новое дело', () => {
  test.use({ sealed: true });

  test('коробки нет, пока не вскрыт конверт «Документация объекта и программы»', async ({
    page,
  }) => {
    await expect(page.getByTestId('device-29')).toHaveCount(0);
    await page.getByTestId('container-bunker').click();
    await page.getByTestId('envelope-open').click();
    await page.getByTestId('envelope-stay').click();
    await expect(page.getByTestId('device-29')).toHaveCount(1);
  });
});
