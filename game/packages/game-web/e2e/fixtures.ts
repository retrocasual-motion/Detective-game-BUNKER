import { test as base, expect, type Page } from '@playwright/test';

/**
 * Каждый тест начинает с чистого состояния игрока. По умолчанию конверты архива вскрыты
 * (`?opened=all`, A-260) — тесты стены и листов работают со всеми стартовыми материалами;
 * `test.use({ sealed: true })` — новое дело как у игрока: конверты опечатаны.
 */
/** Игрок автотестов: вход без письма через служебный маршрут. */
export const E2E_EMAIL = 'e2e@bunker.test';

export const test = base.extend<{
  sealed: boolean;
  staged: boolean;
  input: 'mouse' | 'trackpad';
}>({
  sealed: [false, { option: true }],
  // Поэтапная выдача (SD5-A): `staged` — вещдоки ещё в камере хранения, как у нового игрока; иначе
  // опечатанное дело сразу с ними (как до волны 5).
  staged: [false, { option: true }],
  // Управление (TP-C): по умолчанию — мышь (колесо приближает), на любой системе.
  input: ['mouse', { option: true }],
  page: async ({ page, sealed, staged, reducedMotion, input }, use, testInfo) => {
    // Ошибки страницы, console.error и ответы 5xx роняют тест (RV-75): раньше игра могла сыпать
    // ошибками, а тесты оставались зелёными. Тест, что ломает сервер нарочно, помечает себя
    // `expectErrors(test)`. «Failed to load resource» — эхо ответа сервера, его ловит проверка ответов.
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`ошибка страницы: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
        problems.push(`console.error: ${m.text()}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    });
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
    if (sealed && !staged) await page.request.post('/api/dev/delivery');
    // `play` — сразу в дело, без главного меню (MM-A); меню проверяет menu.spec.
    await page.goto(sealed ? '/?play' : '/?opened=all&play');
    await expect(page.getByTestId('room')).toBeVisible();
    await use(page);
    if (!testInfo.annotations.some((a) => a.type === EXPECT_ERRORS))
      expect(problems, 'ошибки страницы, console.error, ответы 5xx (RV-75)').toEqual([]);
  },
});
export { expect };

const EXPECT_ERRORS = 'expect-errors';
/** Тест ломает сервер нарочно (503, 500) — ошибки страницы его не роняют. */
export const expectErrors = () =>
  base.info().annotations.push({ type: EXPECT_ERRORS, description: 'сервер ломается нарочно' });

/** Стартовые листы 01–07: в новом деле — стопкой на столе (ST-B, A-288). */
export const START = ['01', '02', '03', '04', '05', '06', '07'];

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
/**
 * Прочитать стопку на столе с верхнего листа до конца (DC-B) и закрыть — прочитанное на стене.
 * Стартовая стопка (ST-B): верхний — письмо 01.
 */
export async function readStack(page: Page, top: string) {
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

export async function readFolder(page: Page, id: string, top: string) {
  // Как с клавиатуры: перед папкой на 3D-столе может лежать устройство и взять щелчок мышью
  // (щелчок мышью по папке проверяет archive.spec). Папка — в руки, открыть (автор 25.11); открыл —
  // сразу чтение стопки с верхнего листа (автор 27.11).
  await page.getByTestId(`container-${id}`).dispatchEvent('click');
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /^Папка/);
  await page.getByTestId('envelope-open').dispatchEvent('click');
  await expect(page.getByTestId('desk-run')).toBeVisible();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-material', top);
  while (await page.getByTestId('desk-next').isEnabled())
    await page.getByTestId('desk-next').click();
  const filed = savedPut(page);
  await page.keyboard.press('Escape');
  await filed;
  await expect(page.getByTestId('viewer')).toBeHidden();
  await expect(page.getByTestId('held')).toBeHidden();
  await expect(page.getByTestId(`container-${id}`)).toHaveCount(0);
}

/**
 * Ноутбук в руках (A-283): протяжкой вверх наклонить дном к себе и колесом приблизить наклейку —
 * как игрок, без кнопок. Невидимая кнопка наклейки (клавиатура) показывает, где она на экране.
 */
export async function lookAtSticker(page: Page) {
  await page.mouse.move(683, 500);
  await page.mouse.down();
  await page.mouse.move(683, 160, { steps: 15 });
  await page.mouse.up();
  const spot = page.getByTestId('laptop-sticker');
  await expect(spot).toBeVisible();
  for (let i = 0; i < 14; i++) {
    const b = await spot.boundingBox();
    if (!b) break;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
  }
}

/**
 * Ответ «материал» в форме заключения: газета со стола целиком (по форме подходит любой материал).
 * Папка заключения открыта; после ответа — снова открыта.
 */
export async function answerWithNewspaper(page: Page) {
  await page.getByTestId('verdict-corner').click();
  // Газета — во «Входящих» (новое дело, автор 26.11) или на стене («вскрыть всё»).
  const tray = page.getByTestId('inbox-15');
  const onDesk = await page.evaluate(() =>
    (window as unknown as { __desk: DeskHook }).__desk.grab('15'),
  );
  if (await tray.isVisible()) await tray.dispatchEvent('click');
  else if (onDesk) await page.mouse.click(onDesk.x, onDesk.y);
  else if (await sheet(page, '15').count()) {
    await toWall(page);
    await sheet(page, '15').click(STRIP);
  } else throw new Error('газеты нет ни в лотке, ни на столе, ни на стене');
  await page.getByTestId('viewer-whole-to-folder').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('verdict-card')).toContainText('15');
  const scene = page.getByTestId('scene');
  if ((await scene.getAttribute('data-view')) === 'wall') {
    await page.keyboard.press('ArrowDown');
    await expect(scene).toHaveAttribute('data-moving', 'false');
  }
}

/**
 * Заполнить форму заключения целиком и дойти до проверки (VER-A, A-288: пустые ответы не
 * принимаются). 2 и 4 — газета (материал), 3 — вариант.
 */
export async function fillVerdict(
  page: Page,
  {
    who = 'p:moreau',
    how = 1,
    behind = 'p:hale',
  }: { who?: string; how?: number; behind?: string } = {},
) {
  const next = () => page.getByTestId('verdict-next').click();
  await page.getByTestId(`verdict-person-${who}`).click();
  await next();
  await answerWithNewspaper(page);
  await next();
  await page.getByTestId(`verdict-option-${how}`).click();
  await next();
  await answerWithNewspaper(page);
  await next();
  await page.getByTestId(`verdict-person-${behind}`).click();
  await next();
}

/**
 * Сайт дела в браузере компьютера следователя (A-288 п. 9): адресная строка → страница в окне
 * браузера, не во вкладке. Возвращает окно страницы.
 */
export async function siteInPc(page: Page, address: string) {
  if (!(await page.getByTestId('computer').isVisible())) {
    await page.getByTestId('computer-monitor').click();
    await expect(page.getByTestId('pc-desktop')).toBeVisible();
  }
  if (!(await page.getByTestId('pc-browser').isVisible()))
    await page.getByTestId('lap-icon-Браузер').dblclick();
  await page.getByTestId('pc-url').fill(address);
  await page.getByTestId('pc-url').press('Enter');
  const web = page.getByTestId('pc-web');
  await expect(web.getByTestId('site')).toBeVisible();
  return web;
}

/** Отойти от компьютера (Esc снимает фокус с поля, следующий — закрывает компьютер). */
export async function leavePc(page: Page) {
  for (let k = 0; k < 3 && (await page.getByTestId('computer').isVisible()); k++)
    await page.keyboard.press('Escape');
  await expect(page.getByTestId('computer')).toHaveCount(0);
  // Пришли по ссылке из листа — лист снова открыт (автор 27.11): закрыть и его.
  if (await page.getByTestId('viewer').isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toHaveCount(0);
}
