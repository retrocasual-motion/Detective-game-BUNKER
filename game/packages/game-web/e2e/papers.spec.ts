import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

/** Коробка с пачками в руках → пачка в руках. */
async function stackInHands(page: Page, id: string) {
  await page.getByTestId('device-29').click();
  await page.getByTestId(`stack-${id}`).click({ force: true });
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
}

/** Повернуть пачку в руках правым торцом к игроку, взявшись за верхний лист. */
async function edgeOn(page: Page) {
  await page.mouse.move(683, 330);
  await page.mouse.down();
  await page.mouse.move(683 - 175, 330, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** Щёлкать по верхнему листу, пока подпись не покажет лист n. */
async function leafTo(page: Page, n: number) {
  for (let k = 0; k < n + 2; k++) {
    const cap = page.getByTestId('held-caption');
    const t = (await cap.count()) ? ((await cap.textContent()) ?? '') : '';
    if (t.includes(`лист ${n} из`)) return;
    await page.getByTestId('stack-leaf').click({ force: true });
    await page.waitForTimeout(60);
  }
  await expect(page.getByTestId('held-caption')).toContainText(`лист ${n} из`);
}

/** Глубоко приблизить лист в точке (колесом) — до крупного плана. */
async function zoomInAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -120);
}

test('пачку листают в руках (LF-A): лист — в стопку слева, счётчик; обратно — щелчок по стопке; опись — сразу на стену (AW-B)', async ({
  page,
}) => {
  await stackInHands(page, 'П-01');
  await expect(page.getByTestId('held-caption')).toHaveCount(0);
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('П-01 · лист 2 из 96');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('лист 3 из 96');
  await page.getByTestId('stack-back').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('лист 2 из 96');
  // Опись пачки пришла в дело — сразу на стену, не во «Входящие».
  await expect(sheet(page, 'L982')).toHaveCount(1);
  await expect(page.getByTestId('inbox-L982')).toHaveCount(0);
  // Esc — обратно к коробке.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-05')).toHaveCount(1);
});

test('зажать на листе — листы бегут; у обложки папки (П-02, лист 18) останавливаются', async ({
  page,
}) => {
  await stackInHands(page, 'П-02');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('лист 2 из 41');
  const b = await page.getByTestId('stack-leaf').boundingBox();
  if (!b) throw new Error('нет листа');
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 60);
  await page.mouse.down();
  await expect(page.getByTestId('held-caption')).toContainText('лист 18 из 41', { timeout: 6000 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect(page.getByTestId('held-caption')).toContainText('лист 18 из 41');
  await expect(page.getByTestId('stack-leaf')).toHaveAttribute('aria-label', 'Взять папку');
});

test('папка из пачки (RD-A): за край или долистав — в руках A-24; открыть — только её листы; на стене', async ({
  page,
}) => {
  await stackInHands(page, 'П-02');
  // Повернуть пачку, взявшись за верхний лист: картон внутри не тянется сквозь бумагу.
  await edgeOn(page);
  await expect(page.getByTestId('folder-open')).toHaveCount(0);
  await page.getByTestId('stack-layer-18').click({ force: true });
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', 'Папка A-24');
  // Esc — обратно к пачке.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
  // Долистать до обложки и взять папку щелчком.
  await leafTo(page, 18);
  await page.getByTestId('stack-leaf').click({ force: true });
  await page.getByTestId('folder-open').click({ force: true });
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('aria-label', /^Папка A-24 \(пачка П-02, листы 18–20\)/);
  await expect(page.getByTestId('viewer-paper')).toContainText('Фотография');
  await expect(page.getByTestId('viewer-paper')).not.toContainText('Чистый бланк анкеты');
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'L981')).toHaveCount(1);
});

test('за край тянут мышью: коротко — картон вернулся, дальше половины — вытащен', async ({
  page,
}) => {
  await stackInHands(page, 'П-02');
  await edgeOn(page);
  const box = await page.getByTestId('stack-layer-18').boundingBox();
  if (!box) throw new Error('нет края');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2 + 60;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('folder-open')).toHaveCount(0);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 220, y, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('folder-open')).toHaveCount(1);
});

test('П-09: сверху — обложка (взять папку), по краям — ещё четыре; у пачки без картона тянуть нечего', async ({
  page,
}) => {
  await stackInHands(page, 'П-09');
  await expect(page.getByTestId('stack-leaf')).toHaveAttribute('aria-label', 'Взять папку');
  await expect(page.locator('[data-testid^="stack-layer-"]')).toHaveCount(4);
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

test('П-05: долистать до листов текстом вниз — щелчок переворачивает: справки L957, на стене', async ({
  page,
}) => {
  await stackInHands(page, 'П-05');
  await leafTo(page, 19);
  await expect(page.getByTestId('stack-leaf')).toHaveAttribute('aria-label', 'Перевернуть листы');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('viewer-paper')).toContainText('Справка о выбытии');
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'L957')).toHaveCount(1);
});

test('опись П-05 со стены: строки 19–24 вблизи — пересканы лицом вверх (FV-A); соседние строки — тихо', async ({
  page,
}) => {
  await stackInHands(page, 'П-05');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(sheet(page, 'L985')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-01')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await toWall(page);
  await sheet(page, 'L985').click(STRIP);
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
