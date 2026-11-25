import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

/** Коробка с пачками в руках → пачка в руках. */
async function stackInHands(page: Page, id: string) {
  await page.getByTestId('device-29').click();
  await page.getByTestId(`stack-${id}`).dispatchEvent('click');
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

/**
 * Листать с первого листа до листа n: после каждого щелчка — дождаться номера следующего листа
 * (в CI без видеокарты кадр сцены медленный — щелчки не должны обгонять её).
 */
async function leafTo(page: Page, n: number) {
  for (let k = 2; k <= n; k++) {
    await page.getByTestId('stack-leaf').click({ force: true });
    await expect(page.getByTestId('held-caption')).toContainText(`лист ${k} из`);
  }
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
  // Опись пачки пришла в дело — на стену, не во «Входящие»; пока пачка в руках, на стене её не
  // видно (правка автора 10.11: появляется, когда вещь закрыли).
  await expect(page.getByTestId('inbox-L982')).toHaveCount(0);
  await expect(sheet(page, 'L982')).toHaveCount(0);
  // Esc — обратно к коробке; ещё раз — вещь отложена: опись появилась на стене и светится.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-05')).toHaveCount(1);
  await expect(sheet(page, 'L982')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'L982')).toHaveCount(1);
  await expect(sheet(page, 'L982')).toHaveAttribute('data-found', 'true');
});

test('зажать на листе — листы сами не бегут (правка автора 10.11: без быстрого листания)', async ({
  page,
}) => {
  await stackInHands(page, 'П-02');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('лист 2 из 41');
  const b = await page.getByTestId('stack-leaf').boundingBox();
  if (!b) throw new Error('нет листа');
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 60);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await expect(page.getByTestId('held-caption')).toContainText(/лист [23] из 41/);
});

test('папка из пачки (RD-A): за край — в руках A-24; из пачки она пропала (38 листов), и после перезагрузки тоже', async ({
  page,
}) => {
  await stackInHands(page, 'П-02');
  // Повернуть пачку, взявшись за верхний лист: картон внутри не тянется сквозь бумагу.
  await edgeOn(page);
  await expect(page.getByTestId('folder-open')).toHaveCount(0);
  await page.getByTestId('stack-layer-18').click({ force: true });
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', 'Папка A-24');
  // Esc — обратно к пачке: папки в ней больше нет.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toHaveAttribute(
    'aria-label',
    'Пачка П-02 · Комната анкет · 38 л.',
  );
  await expect(page.getByTestId('stack-layer-18')).toHaveCount(0);
  // Пока вещь в руках — на стене ничего нового.
  await expect(sheet(page, 'F:П-02/18')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-01')).toHaveCount(1);
  await page.keyboard.press('Escape');
  // Отложили — на стене сама папка (картон, наклейка A-24); опись пачки — во «Входящие».
  await expect(sheet(page, 'F:П-02/18')).toContainText('A-24');
  await expect(sheet(page, 'L981')).toHaveCount(0);
  // Отложили — записка «На стене: Папка A-24 · Показать»; «Показать» — к стене, папка светится.
  await expect(page.getByTestId('placed-note')).toContainText('Папка A-24');
  await page.getByTestId('placed-show').click();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
  await expect(sheet(page, 'F:П-02/18')).toHaveAttribute('data-found', 'true');
  // Щелчок по папке на стене — её листы.
  await sheet(page, 'F:П-02/18').click(STRIP);
  await expect(page.getByTestId('viewer')).toHaveAttribute('aria-label', /^Папка A-24/);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
  // «Показать» увёл к стене — вид сохранился; к коробке — у стола.
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
  await expect(sheet(page, 'F:П-02/18')).toContainText('A-24');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
  await stackInHands(page, 'П-02');
  await expect(page.getByTestId('held')).toHaveAttribute(
    'aria-label',
    'Пачка П-02 · Комната анкет · 38 л.',
  );
});

test('обложку папки щелчок листает (правка автора 10.11); папку берут за край — открыть: только её листы', async ({
  page,
}) => {
  await stackInHands(page, 'П-09');
  // Сверху у П-09 — обложка: щелчок её перелистывает, папка остаётся в пачке.
  await expect(page.getByTestId('stack-leaf')).toHaveAttribute('aria-label', 'Перелистнуть лист');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('лист 2 из 15');
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /^Пачка П-09/);
  await page.keyboard.press('Escape');
  await page.getByTestId('stack-П-02').dispatchEvent('click');
  await edgeOn(page);
  await page.getByTestId('stack-layer-18').click({ force: true });
  await page.getByTestId('folder-open').click({ force: true });
  const viewer = page.getByTestId('viewer');
  // Папка — отдельный материал (DS-A, A-263): только её листы.
  await expect(viewer).toHaveAttribute('aria-label', 'Папка A-24 из пачки П-02 (листы 18–20)');
  await expect(page.getByTestId('viewer-paper')).toContainText('Фотография');
  await expect(page.getByTestId('viewer-paper')).not.toContainText('Чистый бланк анкеты');
});

test('П-09 листается до конца: обложки — листы как все, папки остаются в пачке', async ({
  page,
}) => {
  test.slow();
  await stackInHands(page, 'П-09');
  await leafTo(page, 15);
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('все 15 л. пролистаны');
  await expect(page.locator('[data-testid^="wall-F:"]')).toHaveCount(0);
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

test('П-09: пять папок — пять краёв картона, за край — одна папка, на стене одна; у пачки без картона тянуть нечего', async ({
  page,
}) => {
  await stackInHands(page, 'П-09');
  await expect(page.locator('[data-testid^="stack-layer-"]')).toHaveCount(5);
  await edgeOn(page);
  await page.getByTestId('stack-layer-4').click({ force: true });
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /^Папка A-\d+$/);
  // Esc — к пачке, ещё раз — к коробке.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
  // Папки в пачке больше нет: 12 листов, краёв — четыре.
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /12 л\.$/);
  await expect(page.locator('[data-testid^="stack-layer-"]')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-01')).toHaveCount(1);
  await page.getByTestId('stack-П-01').dispatchEvent('click');
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
  await expect(page.locator('[data-testid^="stack-layer-"]')).toHaveCount(0);
  // Отложили всё — на стене одна папка из П-09, описи нет, без повторов.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-01')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toHaveCount(0);
  await expect(page.locator('[data-testid^="wall-F:П-09/"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="wall-L98"]')).toHaveCount(0);
});

test('П-05: долистать до листов текстом вниз — щелчок переворачивает: справки L957, на стене', async ({
  page,
}) => {
  // 43 перелистывания: в CI без видеокарты каждый кадр сцены медленный.
  test.setTimeout(300_000);
  await stackInHands(page, 'П-05');
  await leafTo(page, 19);
  await expect(page.getByTestId('stack-leaf')).toHaveAttribute('aria-label', 'Перевернуть листы');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('viewer-paper')).toContainText('Справка о выбытии');
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'L957')).toHaveCount(1);
  // Перевёрнутые лежат лицом вверх — пачку листают дальше, до конца (правка автора 10.11).
  await stackInHands(page, 'П-05');
  await leafTo(page, 24);
  await expect(page.getByTestId('stack-leaf')).toHaveAttribute('aria-label', 'Перелистнуть лист');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('все 24 л. пролистаны');
});

test.describe('листание с анимацией', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('частые щелчки — в очередь: каждый лист доигрывает, потом следующий', async ({ page }) => {
    await stackInHands(page, 'П-03');
    const leaf = page.getByTestId('stack-leaf');
    // Четыре быстрых щелчка через 30 мс — отдельными событиями, как рукой (не ждать кадра сцены
    // между ними: в CI без видеокарты кадр медленный).
    await leaf.evaluate(async (el) => {
      for (let k = 0; k < 4; k++) {
        (el as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 30));
      }
    });
    // Сразу после щелчков — ещё не все четыре: листы идут по одному.
    expect(await page.getByTestId('held-caption').textContent()).not.toContain('лист 5 из');
    await expect(page.getByTestId('held-caption')).toContainText('лист 5 из 31', {
      timeout: 30_000,
    });
  });
});

test('опись П-05 со стены: строки 19–24 вблизи — пересканы лицом вверх (FV-A); соседние строки — тихо', async ({
  page,
}) => {
  await stackInHands(page, 'П-05');
  await page.getByTestId('stack-leaf').click({ force: true });
  await expect(page.getByTestId('held-caption')).toContainText('лист 2 из');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('stack-П-01')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'L985')).toHaveCount(1);
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

  test('коробки нет, пока не открыта папка «Документация объекта и программы»', async ({
    page,
  }) => {
    await expect(page.getByTestId('device-29')).toHaveCount(0);
    // Папка (FM-B) открывается щелчком — короб пачек на столе.
    await page.getByTestId('container-bunker').click();
    await expect(page.getByTestId('device-29')).toHaveCount(1);
  });
});
