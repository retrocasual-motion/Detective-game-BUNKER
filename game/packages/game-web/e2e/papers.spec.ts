import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

/** Повернуть пачку в руках правым торцом к игроку, взявшись за верхний лист. */
async function edgeOn(page: Page) {
  await page.mouse.move(683, 330);
  await page.mouse.down();
  await page.mouse.move(683 - 175, 330, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

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

test('торчащий картон — вытащить (RD-A): папка A-24 в руках, открыть — опись П-02 на ней; поворот за лист картон не тянет', async ({
  page,
}) => {
  await page.getByTestId('device-29').click();
  await page.getByTestId('stack-П-02').click({ force: true });
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
  // Повернуть пачку, взявшись за верхний лист: картон внутри не тянется сквозь бумагу.
  await edgeOn(page);
  await expect(page.getByTestId('folder-open')).toHaveCount(0);
  // Край картона (у П-02 — один слой, лист 18) — вытащить.
  await expect(page.getByTestId('stack-layer-18')).toHaveCount(1);
  await page.getByTestId('stack-layer-18').click({ force: true });
  await expect(page.getByTestId('folder-open')).toHaveCount(1);
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', 'Папка A-24');
  // Esc — обратно к пачке; ещё раз вытащить и открыть.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
  await edgeOn(page);
  await page.getByTestId('stack-layer-18').click({ force: true });
  await page.getByTestId('folder-open').click({ force: true });
  await expect(page.getByTestId('viewer-paper')).toContainText('пачка П-02');
  expect(await page.evaluate(() => CSS.highlights.get('case-find')?.size ?? 0)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inbox-L981')).toHaveCount(1);
});

test('за край тянут мышью: коротко — картон вернулся, дальше половины — вытащен', async ({
  page,
}) => {
  await page.getByTestId('device-29').click();
  await page.getByTestId('stack-П-02').click({ force: true });
  await page.mouse.move(683, 330);
  await page.mouse.down();
  await page.mouse.move(683 - 175, 330, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const box = await page.getByTestId('stack-layer-18').boundingBox();
  if (!box) throw new Error('нет края');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2 + 60;
  // Короткая протяжка — картон вернулся, папки нет.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('folder-open')).toHaveCount(0);
  // Длинная — вытащен.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 220, y, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('folder-open')).toHaveCount(1);
});

test('П-09: пять обложек торчат — каждую можно вытащить; у пачки без картона тянуть нечего', async ({
  page,
}) => {
  await page.getByTestId('device-29').click();
  await page.getByTestId('stack-П-09').click({ force: true });
  await expect(page.locator('[data-testid^="stack-layer-"]')).toHaveCount(5);
  await edgeOn(page);
  await page.getByTestId('stack-layer-4').click({ force: true });
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /^Папка A-\d+$/);
  // Esc — к пачке, ещё раз — к коробке.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-01')).toHaveCount(1);
  await page.getByTestId('stack-П-01').click({ force: true });
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
  await expect(page.locator('[data-testid^="stack-layer-"]')).toHaveCount(0);
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
  await page.mouse.click(683, 400, { button: 'right' });
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
