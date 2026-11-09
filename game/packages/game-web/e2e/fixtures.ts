import { test as base, expect, type Page } from '@playwright/test';

/**
 * Каждый тест начинает с чистого состояния игрока. По умолчанию конверты архива вскрыты
 * (`?opened=all`, A-260) — тесты стены и листов работают со всеми стартовыми материалами;
 * `test.use({ sealed: true })` — новое дело как у игрока: конверты опечатаны.
 */
export const test = base.extend<{ sealed: boolean }>({
  sealed: [false, { option: true }],
  page: async ({ page, request, sealed }, use) => {
    // Сервер слушает сразу, а база готова чуть позже — ждём готовности.
    await expect
      .poll(async () => (await request.get('/api/health')).status(), { timeout: 60_000 })
      .toBe(200);
    const res = await request.delete('/api/state');
    expect(res.status()).toBe(204);
    await page.goto(sealed ? '/' : '/?opened=all');
    await expect(page.getByTestId('room')).toBeVisible();
    await use(page);
  },
});
export { expect };

/** Видимая полоска листа в лесенке колонки (шапка): сюда щёлкают, чтобы открыть. */
export const STRIP = { position: { x: 25, y: 24 } } as const;

/** Материал на стене (лист или карточка предмета). */
export const sheet = (page: Page, id: string) => page.getByTestId(`wall-${id}`);

/** Поднять взгляд на стену и дождаться покоя. */
export async function toWall(page: Page) {
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-moving', 'false');
}

/** Середина видимой полоски листа на экране. */
export async function stripPoint(page: Page, id: string) {
  const box = await sheet(page, id).boundingBox();
  if (!box) throw new Error(`нет ${id}`);
  return { x: box.x + STRIP.position.x, y: box.y + STRIP.position.y };
}

/** Сохранение ушло на сервер. */
export const savedPut = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT');
