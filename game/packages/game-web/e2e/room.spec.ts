import { expect, test, toWall } from './fixtures.ts';

const scene = (page: import('@playwright/test').Page) => page.getByTestId('scene');

test('старт — вид «Стол»: стол от первого лица, доска на стене за ним', async ({ page }) => {
  await expect(scene(page)).toHaveAttribute('data-view', 'desk');
  // Доска видна сверху экрана, но в 3D (меньше экрана) и не принимает щелчков.
  const board = await page.getByTestId('view-wall').boundingBox();
  expect(board?.width ?? 9999).toBeLessThan(1366 * 0.8);
  expect(board?.y ?? 9999).toBeLessThan(768 * 0.15);
});

test('стрелка вверху — стена, внизу — обратно стол; клавиши ↑ и ↓ дублируют', async ({ page }) => {
  await page.getByTestId('nav-up').click();
  await expect(scene(page)).toHaveAttribute('data-view', 'wall');
  await page.getByTestId('nav-down').click();
  await expect(scene(page)).toHaveAttribute('data-view', 'desk');
  await toWall(page);
  await page.keyboard.press('ArrowDown');
  await expect(scene(page)).toHaveAttribute('data-view', 'desk');
});

test('щелчок по доске со стола ведёт к стене', async ({ page }) => {
  await page.getByTestId('zone-wall').click();
  await expect(scene(page)).toHaveAttribute('data-view', 'wall');
});

test('вид сохраняется после перезагрузки', async ({ page }) => {
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT',
  );
  await toWall(page);
  await saved;
  await page.reload();
  await expect(scene(page)).toHaveAttribute('data-view', 'wall');
});

test('в покое стена лежит ровно на экране (без 3D)', async ({ page }) => {
  await toWall(page);
  expect(await page.getByTestId('view-wall').boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 1366,
    height: 768,
  });
});

test('при 1366×768 нет горизонтальной прокрутки, стрелки и уголок папки на экране', async ({
  page,
}) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  for (const id of ['nav-up', 'petition-corner']) {
    await expect(page.getByTestId(id)).toBeInViewport();
  }
  await toWall(page);
  await expect(page.getByTestId('nav-down')).toBeInViewport();
});

test('стрелки вплотную к краю, подписи видны всегда (UX-F1, F2)', async ({ page }) => {
  const up = await page.getByTestId('nav-up').boundingBox();
  expect(up?.y).toBe(0);
  await expect(page.getByTestId('nav-up')).toContainText('Стена');
  await toWall(page);
  const down = await page.getByTestId('nav-down').boundingBox();
  expect((down?.y ?? 0) + (down?.height ?? 0)).toBe(768);
  await expect(page.getByTestId('nav-down')).toContainText('Стол');
});

test('сервер ответил 503 при загрузке — игра повторяет запрос и открывается', async ({ page }) => {
  let failures = 2;
  await page.route('**/api/state', (route) => {
    if (route.request().method() === 'GET' && failures > 0) {
      failures--;
      return route.fulfill({ status: 503, body: '{"error":"база не готова"}' });
    }
    return route.continue();
  });
  await page.reload();
  await expect(scene(page)).toHaveAttribute('data-view', 'desk', { timeout: 15_000 });
});

test.describe('с анимацией', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('щелчок во время перехода сразу ведёт к новой цели (MOVE-A)', async ({ page }) => {
    await page.getByTestId('nav-up').click();
    await expect(scene(page)).toHaveAttribute('data-moving', 'true');
    await page.getByTestId('nav-down').click();
    await expect(scene(page)).toHaveAttribute('data-view', 'desk');
    await expect(scene(page)).toHaveAttribute('data-moving', 'false');
  });

  test('переход идёт движением камеры и заканчивается ровной стеной', async ({ page }) => {
    await page.getByTestId('nav-up').click();
    await expect(scene(page)).toHaveAttribute('data-moving', 'true');
    await expect(scene(page)).toHaveAttribute('data-moving', 'false');
    expect(await page.getByTestId('view-wall').boundingBox()).toEqual({
      x: 0,
      y: 0,
      width: 1366,
      height: 768,
    });
  });
});

test('двойной щелчок по стрелке не возвращает обратно (UN-2)', async ({ page }) => {
  await page.getByTestId('nav-up').dblclick();
  await expect(scene(page)).toHaveAttribute('data-view', 'wall');
});
