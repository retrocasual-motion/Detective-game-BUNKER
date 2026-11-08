import { expect, test } from './fixtures.ts';

const scene = (page: import('@playwright/test').Page) => page.getByTestId('scene');

test('старт — вид «Стол»', async ({ page }) => {
  await expect(page.getByTestId('view-desk')).toBeVisible();
  await expect(scene(page)).toHaveAttribute('data-view', 'desk');
});

test('стрелка у правого края открывает доску, у левого края доски — обратно стол', async ({
  page,
}) => {
  await page.getByTestId('nav-right').click();
  await expect(page.getByTestId('view-right')).toBeVisible();
  await expect(page.getByTestId('view-desk')).toBeHidden();
  await page.getByTestId('nav-left').click();
  await expect(page.getByTestId('view-desk')).toBeVisible();
});

test('клавиши дублируют стрелки: ← «Слева», → стол, ↓ комната, ↓ снова стол', async ({ page }) => {
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('view-left')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('view-desk')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(scene(page)).toHaveAttribute('data-view', 'room');
  await page.keyboard.press('ArrowDown');
  await expect(scene(page)).toHaveAttribute('data-view', 'desk');
});

test('вид сохраняется после перезагрузки', async ({ page }) => {
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT',
  );
  await page.getByTestId('nav-left').click();
  await expect(page.getByTestId('view-left')).toBeVisible();
  await saved;
  await page.reload();
  await expect(page.getByTestId('view-left')).toBeVisible();
});

test('«Комната»: щелчок по зоне ведёт в вид', async ({ page }) => {
  for (const view of ['left', 'desk', 'right'] as const) {
    // Стрелка «Комната» внизу — с любого вида.
    await page.getByTestId('nav-down').click();
    await expect(scene(page)).toHaveAttribute('data-view', 'room');
    await page.getByTestId(`zone-${view}`).click();
    await expect(page.getByTestId(`view-${view}`)).toBeVisible();
    await expect(scene(page)).toHaveAttribute('data-view', view);
  }
});

test('стрелка «Комната» — внизу по центру на столе, у компьютера и у доски', async ({ page }) => {
  for (const arrow of [null, 'nav-left', 'nav-right', 'nav-right']) {
    if (arrow) await page.getByTestId(arrow).click();
    const box = await page.getByTestId('nav-down').boundingBox();
    expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 683)).toBeLessThan(2);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(740);
    await expect(page.getByTestId('nav-down')).toHaveAccessibleName('Комната');
  }
});

test('в «Комнате» все три вида видны сразу (как стены и стол)', async ({ page }) => {
  await page.getByTestId('nav-down').click();
  for (const v of ['view-desk', 'view-left', 'view-right']) {
    await expect(page.getByTestId(v)).toBeVisible();
  }
});

test('при 1366×768 нет горизонтальной прокрутки, стрелки и уголок папки на экране', async ({
  page,
}) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  for (const id of ['nav-left', 'nav-right', 'nav-down', 'petition-corner']) {
    await expect(page.getByTestId(id)).toBeInViewport();
  }
});

test('в покое вид лежит ровно на экране (без 3D)', async ({ page }) => {
  for (const [arrow, view] of [
    ['nav-left', 'view-left'],
    ['nav-right', 'view-desk'],
    ['nav-right', 'view-right'],
  ] as const) {
    await page.getByTestId(arrow).click();
    await expect(scene(page)).toHaveAttribute('data-view', view.replace('view-', ''));
    await expect(scene(page)).toHaveAttribute('data-moving', 'false');
    expect(await page.getByTestId(view).boundingBox()).toEqual({
      x: 0,
      y: 0,
      width: 1366,
      height: 768,
    });
  }
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
  await expect(page.getByTestId('view-desk')).toBeVisible({ timeout: 15_000 });
});

test.describe('с анимацией', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('щелчок во время перехода сразу ведёт к новой цели (MOVE-A)', async ({ page }) => {
    await page.getByTestId('nav-left').click();
    await expect(scene(page)).toHaveAttribute('data-moving', 'true');
    await page.getByTestId('nav-down').click();
    await expect(scene(page)).toHaveAttribute('data-view', 'room');
    await expect(scene(page)).toHaveAttribute('data-moving', 'false');
  });

  test('переход идёт движением камеры и заканчивается в покое', async ({ page }) => {
    await page.getByTestId('nav-left').click();
    await expect(scene(page)).toHaveAttribute('data-moving', 'true');
    // Стрелки видны и во время перехода (MOVE-A).
    await expect(page.getByTestId('nav-right')).toBeVisible();
    await expect(scene(page)).toHaveAttribute('data-moving', 'false');
    await expect(page.getByTestId('view-left')).toBeVisible();
    expect(await page.getByTestId('view-left').boundingBox()).toEqual({
      x: 0,
      y: 0,
      width: 1366,
      height: 768,
    });
  });
});

test('стрелки вплотную к краю экрана, подписи видны всегда (UX-F1, F2)', async ({ page }) => {
  const box = async (id: string) => {
    const b = await page.getByTestId(id).boundingBox();
    if (!b) throw new Error(`нет ${id}`);
    return b;
  };
  expect((await box('nav-left')).x).toBe(0);
  const right = await box('nav-right');
  expect(right.x + right.width).toBe(1366);
  const down = await box('nav-down');
  expect(down.y + down.height).toBe(768);
  await expect(page.getByTestId('nav-left')).toContainText('Вещдоки');
  await expect(page.getByTestId('nav-right')).toContainText('Доска');
  await expect(page.getByTestId('nav-down')).toContainText('Комната');
});

test('значок по движению камеры: в комнату — «вверх», к столу — «вниз» (UX-F1)', async ({
  page,
}) => {
  await expect(page.getByTestId('nav-down')).toContainText('˄');
  await page.getByTestId('nav-down').click();
  await expect(scene(page)).toHaveAttribute('data-view', 'room');
  await expect(page.getByTestId('nav-down')).toContainText('˅');
  await expect(page.getByTestId('nav-down')).toContainText('Стол');
});

test('двойной щелчок по стрелке «Комната» не возвращает обратно на стол (UN-2)', async ({
  page,
}) => {
  await page.getByTestId('nav-down').dblclick();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'room');
});
