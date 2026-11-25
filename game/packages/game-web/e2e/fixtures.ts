import { test as base, expect, type Page } from '@playwright/test';

/**
 * Каждый тест начинает с чистого состояния игрока. По умолчанию конверты архива вскрыты
 * (`?opened=all`, A-260) — тесты стены и листов работают со всеми стартовыми материалами;
 * `test.use({ sealed: true })` — новое дело как у игрока: конверты опечатаны.
 */
/** Игрок автотестов: вход без письма через служебный маршрут. */
export const E2E_EMAIL = 'e2e@bunker.test';

export const test = base.extend<{ sealed: boolean; input: 'mouse' | 'trackpad' }>({
  sealed: [false, { option: true }],
  // Управление (TP-C): по умолчанию — мышь (колесо приближает), на любой системе.
  input: ['mouse', { option: true }],
  page: async ({ page, sealed, reducedMotion, input }, use) => {
    await page.addInitScript((m) => localStorage.setItem('bunker.input', m), input);
    // Игра не слушает системное «уменьшить движение» (RM-A) — включаем её собственную
    // настройку, когда тест просит без анимаций (по умолчанию в конфиге).
    if (reducedMotion === 'reduce') {
      await page.addInitScript(() => localStorage.setItem('bunker.reduceMotion', '1'));
    }
    // Сервер слушает сразу, а база готова чуть позже — ждём готовности.
    await expect
      .poll(async () => (await page.request.get('/api/health')).status(), { timeout: 60_000 })
      .toBe(200);
    // Вход без письма (6a-1; служебный маршрут разработки): cookie — у страницы теста.
    await page.request.post('/api/dev/login', { data: { email: E2E_EMAIL } });
    const res = await page.request.delete('/api/state');
    expect(res.status()).toBe(204);
    // `play` — сразу в дело, без главного меню (MM-A); меню проверяет menu.spec.
    await page.goto(sealed ? '/?play' : '/?opened=all&play');
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
 * Лист на стене закрыт открытой папкой запроса — подвинуть доску, как игрок: потянуть за
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

type DeskHook = { grab(id: string): { x: number; y: number } | null; settled(): boolean };

/** Всё высыпанное на 3D-стол долетело и лежит. */
export async function deskSettled(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __desk?: DeskHook }).__desk?.settled() ?? false,
        ),
      { intervals: [200], timeout: 10_000 },
    )
    .toBe(true);
}

/**
 * Взять изъятое устройство со стола (3D-стол: 24, 47–50 лежат свободно, автор 24.11) — как игрок:
 * дождаться, пока оно легло (точка на экране перестала меняться), и щёлкнуть по нему.
 */
export async function takeDevice(page: Page, id: string) {
  await deskSettled(page);
  const at = () =>
    page.evaluate((i) => (window as unknown as { __desk?: DeskHook }).__desk?.grab(i) ?? null, id);
  let last: { x: number; y: number } | null = null;
  await expect
    .poll(
      async () => {
        const now = await at();
        const still = !!now && !!last && Math.hypot(now.x - last.x, now.y - last.y) < 0.5;
        last = now;
        return still;
      },
      { intervals: [200], timeout: 10_000 },
    )
    .toBe(true);
  const pt = last as { x: number; y: number } | null;
  if (!pt) throw new Error(`устройства ${id} нет на столе`);
  await page.mouse.click(pt.x, pt.y);
}

/**
 * Открыть папку дела (FM-B) и прочитать её стопку до конца (DC-B), как игрок: щелчок по папке —
 * листы стопкой на столе; щелчок по верхнему — читать подряд «›» до последнего; закрыть —
 * прочитанное висит на стене группой папки.
 */
export async function readFolder(page: Page, id: string, top: string) {
  // Как с клавиатуры: перед папкой на 3D-столе может лежать устройство и взять щелчок мышью
  // (щелчок мышью по папке проверяет archive.spec).
  await page.getByTestId(`container-${id}`).dispatchEvent('click');
  await expect(page.getByTestId(`container-${id}`)).toHaveCount(0);
  await deskSettled(page);
  let last: { x: number; y: number } | null = null;
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(
          (i) => (window as unknown as { __desk?: DeskHook }).__desk?.grab(i) ?? null,
          top,
        );
        const still = !!now && !!last && Math.hypot(now.x - last.x, now.y - last.y) < 0.5;
        last = now;
        return still;
      },
      { intervals: [200], timeout: 10_000 },
    )
    .toBe(true);
  const pt = last as { x: number; y: number } | null;
  await page.mouse.click(pt?.x ?? 0, pt?.y ?? 0);
  await expect(page.getByTestId('desk-run')).toBeVisible();
  while (await page.getByTestId('desk-next').isEnabled())
    await page.getByTestId('desk-next').click();
  const filed = savedPut(page);
  await page.keyboard.press('Escape');
  await filed;
  await expect(page.getByTestId('viewer')).toBeHidden();
}
