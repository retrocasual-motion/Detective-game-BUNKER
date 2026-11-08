import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const savedPut = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT');

async function drag(page: Page, testId: string, dx: number, dy: number) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`нет ${testId}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

/** Место листа на столе — из его translate (рамка повёрнутого листа зависит от поворота и подъёма). */
const position = async (page: Page, testId: string) => {
  const t = await page.getByTestId(testId).evaluate((el) => (el as HTMLElement).style.translate);
  const [x = Number.NaN, y = Number.NaN] = t
    .split(' ')
    .map((v) => Math.round(Number.parseFloat(v)));
  return { x, y };
};

test('на столе 46 карточек', async ({ page }) => {
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(46);
});

test('перетащенная карточка остаётся на месте после перезагрузки', async ({ page }) => {
  const before = await position(page, 'card-07');
  const saved = savedPut(page);
  await drag(page, 'card-07', -300, 200);
  await saved;
  const after = await position(page, 'card-07');
  expect(after.x).toBe(before.x - 300);
  expect(after.y).toBe(before.y + 200);
  await page.reload();
  expect(await position(page, 'card-07')).toEqual(after);
});

test('два быстрых перетаскивания подряд → сохраняется последнее', async ({ page }) => {
  await drag(page, 'card-03', 100, 300);
  await drag(page, 'card-03', 50, 50);
  const final = await position(page, 'card-03');
  await savedPut(page);
  await page.reload();
  expect(await position(page, 'card-03')).toEqual(final);
});

test('колесо меняет масштаб стола', async ({ page }) => {
  const before = (await page.getByTestId('card-01').boundingBox())?.width ?? 0;
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, -400);
  await expect
    .poll(async () => (await page.getByTestId('card-01').boundingBox())?.width ?? 0)
    .toBeGreaterThan(before);
});

test('сервер не сохраняет → «Не сохранено»; следующее изменение сохраняет всё', async ({
  page,
}) => {
  await page.route('**/api/state', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 500 }) : route.continue(),
  );
  await drag(page, 'card-02', 0, 300);
  await expect(page.getByTestId('save-error')).toBeVisible();
  const first = await position(page, 'card-02');

  await page.unroute('**/api/state');
  const saved = savedPut(page);
  await drag(page, 'card-05', 0, 300);
  await saved;
  await expect(page.getByTestId('save-error')).toBeHidden();
  const second = await position(page, 'card-05');

  await page.reload();
  expect(await position(page, 'card-02')).toEqual(first);
  expect(await position(page, 'card-05')).toEqual(second);
});

test('номер материала — в верхней части листа', async ({ page }) => {
  const card = await page.getByTestId('card-01').boundingBox();
  const id = await page.getByTestId('card-01').locator('.card-id').boundingBox();
  expect((id?.y ?? 0) - (card?.y ?? 0)).toBeLessThan(40);
});

test('бумаги лежат вразброс: с поворотом, не ровной сеткой', async ({ page }) => {
  const rots = await page
    .locator('[data-testid^="card-"]')
    .evaluateAll((els) => els.map((e) => Number.parseFloat((e as HTMLElement).style.rotate)));
  expect(rots.filter((r) => r !== 0).length).toBeGreaterThan(30);
  expect(Math.max(...rots.map(Math.abs))).toBeLessThanOrEqual(9);
});

test('поворот листа сохраняется после перетаскивания', async ({ page }) => {
  const rot = () => page.getByTestId('card-07').evaluate((el) => (el as HTMLElement).style.rotate);
  const before = await rot();
  await drag(page, 'card-07', 120, 80);
  expect(await rot()).toBe(before);
});

test('взятый лист приподнимается и наклоняется в движении', async ({ page }) => {
  const box = await page.getByTestId('card-12').boundingBox();
  if (!box) throw new Error('нет листа');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const base = await page.getByTestId('card-12').evaluate((el) => (el as HTMLElement).style.rotate);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 30, y);
  await expect(page.getByTestId('card-12')).toHaveClass(/card-dragging/);
  const during = await page
    .getByTestId('card-12')
    .evaluate((el) => (el as HTMLElement).style.rotate);
  expect(during).not.toBe(base);
  await page.mouse.up();
  await expect(page.getByTestId('card-12')).not.toHaveClass(/card-dragging/);
});

test('рука остановилась, лист ещё в руке — наклон проходит', async ({ page }) => {
  const box = await page.getByTestId('card-12').boundingBox();
  if (!box) throw new Error('нет листа');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const rot = () => page.getByTestId('card-12').evaluate((el) => (el as HTMLElement).style.rotate);
  const base = await rot();
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 30, y);
  await expect.poll(rot, { timeout: 1000 }).toBe(base);
  await page.mouse.up();
});

test('материалы лежат предметами своего типа, а не одинаковыми листами (UX-A1)', async ({
  page,
}) => {
  const kind = (id: string) => page.getByTestId(`card-${id}`).getAttribute('data-kind');
  expect(await kind('01')).toBe('sheet');
  expect(await kind('30')).toBe('stapled');
  expect(await kind('13')).toBe('disc');
  expect(await kind('29')).toBe('pack');
  expect(await kind('38')).toBe('notebook');
  expect(await kind('39')).toBe('photos');
  expect(await kind('40')).toBe('bag');
  expect(await kind('51')).toBe('half');
  const size = async (id: string) => {
    const el = page.getByTestId(`card-${id}`);
    return el.evaluate(
      (e) => `${(e as HTMLElement).offsetWidth}x${(e as HTMLElement).offsetHeight}`,
    );
  };
  const sizes = new Set(await Promise.all(['01', '13', '29', '39', '40', '51'].map(size)));
  expect(sizes.size).toBe(6);
});

test('у стола есть край: камеру не увести со столешницы и не отдалить дальше всего стола (UX-B1)', async ({
  page,
}) => {
  const surface = page.locator('.desk .canvas-surface');
  // Отдалить колесом сильно — весь стол помещается, но не меньше.
  await page.mouse.move(683, 384);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 600);
  const far = await surface.boundingBox();
  if (!far) throw new Error('нет столешницы');
  expect(far.width).toBeGreaterThan(1366 * 0.5);
  expect(far.width).toBeLessThan(1366);
  // Ещё колесо у предела — стол не ползёт от курсора.
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 600);
  expect(await surface.boundingBox()).toEqual(far);
  // Тянем пол (пусто, вне столешницы) далеко вправо и вниз: левый верхний угол стола
  // упирается в центр экрана и дальше не едет.
  const start = { x: Math.max(4, far.x - 20), y: Math.max(4, far.y - 20) };
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? '', start),
  ).toContain('canvas');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 3000, start.y + 3000, { steps: 10 });
  await page.mouse.up();
  const box = await surface.boundingBox();
  if (!box) throw new Error('нет столешницы');
  expect(Math.abs(box.x - 683)).toBeLessThan(2);
  expect(Math.abs(box.y - 384)).toBeLessThan(2);
});
