import { test as base, expect, type Page } from '@playwright/test';

/**
 * Каждый тест начинает с чистого состояния игрока. По умолчанию конверты архива вскрыты
 * (`?opened=all`, A-260) — тесты стены и листов работают со всеми стартовыми материалами;
 * `test.use({ sealed: true })` — новое дело как у игрока: конверты опечатаны.
 */
export const test = base.extend<{ sealed: boolean }>({
  sealed: [false, { option: true }],
  page: async ({ page, request, sealed, reducedMotion }, use) => {
    // Игра не слушает системное «уменьшить движение» (RM-A) — включаем её собственную
    // настройку, когда тест просит без анимаций (по умолчанию в конфиге).
    if (reducedMotion === 'reduce') {
      await page.addInitScript(() => localStorage.setItem('bunker.reduceMotion', '1'));
    }
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

/**
 * Лист на стене закрыт открытой папкой ходатайства — подвинуть доску, как игрок: потянуть за
 * пустую пробку, чтобы полоска листа оказалась правее папки. (Раньше тесты держались на
 * побочном эффекте: Playwright прокручивал контейнер стены, пока доска была больше экрана.)
 */
export async function bringIntoView(page: Page, id: string) {
  const pt = await stripPoint(page, id);
  const covered = await page.evaluate(
    ([x, y, wid]) => !document.elementFromPoint(x, y)?.closest(`[data-testid="wall-${wid}"]`),
    [pt.x, pt.y, id] as const,
  );
  if (!covered) return;
  const start = await page.evaluate(() => {
    for (let y = 140; y < 700; y += 40)
      for (let x = 1320; x > 700; x -= 40)
        if (document.elementFromPoint(x, y)?.classList.contains('canvas')) return { x, y };
    return null;
  });
  if (!start) throw new Error('нет пустой пробки, чтобы подвинуть доску');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 900 - pt.x, start.y + 320 - pt.y, { steps: 6 });
  await page.mouse.up();
}

/** Сохранение ушло на сервер. */
export const savedPut = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT');
