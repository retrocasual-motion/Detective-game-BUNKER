import { test as base, expect } from '@playwright/test';

/** Каждый тест начинает с чистого состояния игрока. */
export const test = base.extend({
  page: async ({ page, request }, use) => {
    // Сервер слушает сразу, а база готова чуть позже — ждём готовности.
    await expect
      .poll(async () => (await request.get('/api/health')).status(), { timeout: 60_000 })
      .toBe(200);
    const res = await request.delete('/api/state');
    expect(res.status()).toBe(204);
    await page.goto('/');
    await expect(page.getByTestId('room')).toBeVisible();
    await use(page);
  },
});
export { expect };
