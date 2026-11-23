import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test } from './fixtures.ts';

/**
 * QA-C (общая проверка 20.11): робот проходит всё дело через интерфейс, как игрок — от нового
 * дела (конверты опечатаны) до эпилога и титров — и открывает все закрытые материалы пакета.
 * Порядок и значения — по золотому пути пакета (gm/walkthrough.txt). Только интерфейс:
 * щелчки, перетаскивания, колесо, клавиатура; без служебной строки движка (/api/dev/action-line)
 * и прямых POST /api/action. Сайты — щелчком по ссылке в материале или адресной строкой
 * браузера компьютера следователя (обе дороги открывают новую вкладку, как у игрока).
 *
 * Находки первого прогона (свойства записей, стойка 50, папка A-24, дата газеты) исправлены
 * (F3–F6): все 78 материалов открываются через интерфейс, обходов нет.
 */

const PACK = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../playtest/packs/v3.4-2026-11-18/locked',
);
const ALL_LOCKED = readdirSync(PACK)
  .filter((f) => /^L\d+__.*\.md$/.test(f))
  .map((f) => f.split('__')[0] as string)
  .sort();

// Шаг, который не может найти кнопку, падает за 15 с, а не ждёт весь тест.
test.use({ sealed: true, actionTimeout: 15_000 });

// ───────────────────────── проверка материалов ─────────────────────────

async function mine(page: Page): Promise<Set<string>> {
  const r = await page.request.get('/api/materials');
  expect(r.ok()).toBe(true);
  return new Set(((await r.json()) as { id: string }[]).map((m) => m.id));
}

/** Материалы пришли игроку (жёстко: шаг обязан их открыть). */
async function opened(page: Page, ids: string[]) {
  await expect
    .poll(
      async () => {
        const have = await mine(page);
        return ids.filter((id) => !have.has(id));
      },
      { message: `не открыты: ${ids.join(', ')}`, timeout: 15_000 },
    )
    .toEqual([]);
}

// ───────────────────────── вид: стол / стена ─────────────────────────

const scene = (page: Page) => page.getByTestId('scene');

async function settle(page: Page) {
  await expect(scene(page)).toHaveAttribute('data-moving', 'false');
}

async function toWall(page: Page) {
  if ((await scene(page).getAttribute('data-view')) !== 'wall') {
    await page.keyboard.press('ArrowUp');
    await expect(scene(page)).toHaveAttribute('data-view', 'wall');
  }
  await settle(page);
}

async function toDesk(page: Page) {
  if ((await scene(page).getAttribute('data-view')) !== 'desk') {
    await page.keyboard.press('ArrowDown');
    await expect(scene(page)).toHaveAttribute('data-view', 'desk');
  }
  await settle(page);
}

/** Ничего не в руках и ничего не открыто (Esc, пока есть что закрывать). */
async function handsFree(page: Page) {
  for (let k = 0; k < 6; k++) {
    const busy =
      (await page.getByTestId('held').count()) +
      (await page.getByTestId('viewer').count()) +
      (await page.getByTestId('computer').count()) +
      (await page.getByTestId('pen-view').count());
    if (!busy) return;
    // Ручка-диктофон: Esc при фокусе на кнопке плеера не всегда доходит — «Отложить ручку».
    if (await page.getByTestId('pen-view').count()) await page.getByTestId('pen-away').click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

// ───────────────────────── стена ─────────────────────────

/** Пустая пробка стены (за неё тянут доску): ближе к краю, от которого тянуть (dx, dy). */
async function emptyCork(page: Page, dx: number, dy: number) {
  return page.evaluate(
    ([dx, dy]) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let x = 20; x < 1350; x += 30) xs.push(x);
      for (let y = 140; y < 750; y += 30) ys.push(y);
      if (dx < 0) xs.reverse();
      if (dy < 0) ys.reverse();
      for (const x of xs)
        for (const y of ys)
          if (document.elementFromPoint(x, y)?.classList.contains('canvas')) return { x, y };
      return null;
    },
    [dx, dy] as const,
  );
}

/**
 * Лист на стене виден и не закрыт — иначе подвинуть доску, как игрок (потянуть за пустую
 * пробку), пока полоска листа не окажется на экране. Возвращает точку полоски.
 */
async function showOnWall(page: Page, id: string) {
  await toWall(page);
  for (let k = 0; k < 10; k++) {
    const box = await sheet(page, id).boundingBox();
    if (!box) throw new Error(`на стене нет ${id}`);
    const pt = { x: box.x + STRIP.position.x, y: box.y + STRIP.position.y };
    const onScreen = pt.x > 30 && pt.x < 1336 && pt.y > 120 && pt.y < 740;
    const free =
      onScreen &&
      (await page.evaluate(
        ([x, y, wid]) => !!document.elementFromPoint(x, y)?.closest(`[data-testid="wall-${wid}"]`),
        [pt.x, pt.y, id] as const,
      ));
    if (free) return pt;
    const start = await emptyCork(page, 683 - pt.x, 440 - pt.y);
    if (!start) throw new Error('нет пустой пробки, чтобы подвинуть доску');
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const end = {
      x: clamp(start.x + (683 - pt.x), 10, 1356),
      y: clamp(start.y + (440 - pt.y), 130, 758),
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
  const box = await sheet(page, id).boundingBox();
  const what = box
    ? await page.evaluate(
        ([x, y]) => {
          const e = document.elementFromPoint(x, y);
          return `${e?.tagName}.${e?.className} ${e?.closest('[data-testid]')?.getAttribute('data-testid')}`;
        },
        [box.x + STRIP.position.x, box.y + STRIP.position.y] as const,
      )
    : '';
  throw new Error(`не удалось показать ${id} на стене: ${JSON.stringify(box)} ${what}`);
}

/** Открыть лист со стены щелчком. */
async function openSheet(page: Page, id: string) {
  const pt = await showOnWall(page, id);
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.waitForTimeout(450); // защита от второго щелчка двойного
}

/** Колесом приблизить открытый лист до крупного плана (CLOSEUP_AT) — «увеличить». */
async function zoomOpenSheet(page: Page) {
  const paper = page.getByTestId('viewer-paper');
  const box = (await paper.count()) ? await paper.boundingBox() : null;
  const x = box ? box.x + box.width / 2 : 683;
  const y = box ? box.y + box.height / 3 : 384;
  await page.mouse.move(x, y);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(40);
  }
  await expect(page.getByTestId('viewer-closeup')).toBeVisible();
}

/** Лист со стены — увеличить — закрыть. */
async function zoomSheet(page: Page, id: string) {
  await openSheet(page, id);
  await zoomOpenSheet(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
}

// ───────────────────────── стол: конверты, вещи ─────────────────────────

async function openEnvelope(page: Page, id: string) {
  await toDesk(page);
  await page.getByTestId(`container-${id}`).click();
  await page.getByTestId('envelope-open').click();
  await page.getByTestId('envelope-stay').click();
  await expect(page.getByTestId('envelope-view')).toBeHidden();
}

/** Коробка пачек 29 → пачка в руках. */
async function stackInHands(page: Page, id: string) {
  await toDesk(page);
  await handsFree(page);
  await page.getByTestId('device-29').click();
  await expect(page.getByTestId(`stack-${id}`)).toHaveCount(1);
  const held = page.getByTestId('held');
  await expect(async () => {
    if (!((await held.getAttribute('aria-label')) ?? '').startsWith(`Пачка ${id}`))
      await page.getByTestId(`stack-${id}`).dispatchEvent('click');
    await expect(held).toHaveAttribute('aria-label', new RegExp(`^Пачка ${id}`), { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId('stack-leaf')).toHaveCount(1);
}

async function leafTo(page: Page, n: number) {
  for (let k = 2; k <= n; k++) {
    await page.getByTestId('stack-leaf').click({ force: true });
    await expect(page.getByTestId('held-caption')).toContainText(`лист ${k} из`);
  }
}

/** Перелистнуть пачку на один лист и отложить. */
async function leafStack(page: Page, id: string) {
  await stackInHands(page, id);
  await leafTo(page, 2);
  await handsFree(page);
}

/** Повернуть пачку торцом к игроку (взяв за верхний лист). */
async function edgeOn(page: Page) {
  await page.mouse.move(683, 330);
  await page.mouse.down();
  await page.mouse.move(683 - 175, 330, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function deviceUp(page: Page, id: string, label: RegExp) {
  await toDesk(page);
  await handsFree(page);
  await page.getByTestId(`device-${id}`).click();
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', label);
}

// ───────────────────────── компьютер и сайты ─────────────────────────

async function pcUp(page: Page) {
  await toDesk(page);
  await handsFree(page);
  await page.getByTestId('computer-monitor').click();
  await expect(page.getByTestId('pc-desktop')).toBeVisible();
}

async function pcBrowser(page: Page) {
  await pcUp(page);
  if (!(await page.getByTestId('pc-browser').isVisible()))
    await page.getByTestId('lap-icon-Браузер').dblclick();
  await expect(page.getByTestId('pc-browser')).toBeVisible();
}

/** Сайт — адресной строкой браузера компьютера следователя: новая вкладка. */
async function siteByAddressBar(page: Page, address: string): Promise<Page> {
  await pcBrowser(page);
  await page.getByTestId('pc-url').fill(address);
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByTestId('pc-url').press('Enter'),
  ]);
  await expect(tab.getByTestId('site')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('computer')).toHaveCount(0);
  return tab;
}

/** Сайт — щелчком по ссылке-адресу в листе со стены (листая страницы, если надо). */
async function siteByLink(page: Page, sheetId: string, domain: string): Promise<Page> {
  await openSheet(page, sheetId);
  const link = page.getByTestId('viewer').locator('a.site-link', { hasText: domain }).first();
  const inView = async () => {
    const b = await link.boundingBox().catch(() => null);
    return !!b && b.x > 0 && b.x < 1366 && b.y > 0 && b.y < 768 && (await link.isVisible());
  };
  for (let k = 0; k < 12 && !(await inView()); k++) {
    if (!(await page.getByTestId('page-next').count())) break;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
  }
  if (!(await inView())) {
    // Ссылки нет (адрес только в e-mail или не размечен) — игрок наберёт адрес сам.
    test.info().annotations.push({
      type: 'сайт',
      description: `${domain}: ссылки в ${sheetId} нет — адресная строка`,
    });
    await page.keyboard.press('Escape');
    return siteByAddressBar(page, domain);
  }
  test.info().annotations.push({ type: 'сайт', description: `${domain}: ссылкой в ${sheetId}` });
  const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await expect(tab.getByTestId('site')).toBeVisible();
  await page.keyboard.press('Escape');
  return tab;
}

const fill = async (tab: Page, form: string, values: Record<string, string>) => {
  for (const [k, v] of Object.entries(values)) await tab.getByTestId(`site-${form}-${k}`).fill(v);
  await tab.getByTestId(`site-${form}-submit`).click();
};

/** Вернуться во вкладку игры (как игрок: окно снова в фокусе). */
async function backToGame(page: Page) {
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

// ───────────────────────── проход ─────────────────────────

test('QA-C: всё дело через интерфейс — от нового дела до титров, все закрытые материалы', async ({
  page,
}) => {
  test.setTimeout(20 * 60_000);
  expect(ALL_LOCKED.length).toBe(78);

  await test.step('новое дело: конверты опечатаны, закрытых материалов нет', async () => {
    const have = await mine(page);
    expect(ALL_LOCKED.filter((id) => have.has(id))).toEqual([]);
    await expect(page.getByTestId('container-scene')).toBeVisible();
  });

  await test.step('вскрыть конверты архива и коробку «Личные вещи»', async () => {
    for (const id of ['protocols', 'scene', 'bunker', 'personal']) await openEnvelope(page, id);
    for (const d of ['24', '29', '47', '48', '49', '50'])
      await expect(page.getByTestId(`device-${d}`)).toBeVisible();
  });

  await test.step('камера инженера: T — крупно (L905), DISP — время (L973)', async () => {
    await deviceUp(page, '24', /Камера/);
    await page.getByTestId('device-use').click();
    await expect(page.getByTestId('camera-view')).toBeVisible();
    await page.getByTestId('camera-t').click();
    await expect(page.getByTestId('camera-zoom')).toHaveText('×2');
    await page.getByTestId('camera-w').click();
    await page.getByTestId('camera-disp').click();
    await expect(page.getByTestId('camera-info')).toContainText('13.10.2009');
    await handsFree(page);
    await opened(page, ['L905', 'L973']);
  });

  await test.step('листы со стены — «увеличить» колесом', async () => {
    const zooms: [string, string][] = [
      ['22', 'L912'],
      ['26', 'L915'],
      ['12', 'L922'],
      ['39', 'L933'],
      ['40', 'L940'],
      ['41', 'L941'],
      ['43', 'L948'],
      ['44', 'L944'],
      ['45', 'L945'],
      ['46', 'L946'],
      ['51', 'L951'],
      ['42', 'L952'],
    ];
    for (const [id, got] of zooms) {
      await zoomSheet(page, id);
      await opened(page, [got]);
    }
  });

  await test.step('фильм 13 и ролики 14 — плеером со стены, «увеличить» колесом (L913, L914)', async () => {
    for (const [id, got] of [
      ['13', 'L913'],
      ['14', 'L914'],
    ] as const) {
      await openSheet(page, id);
      await expect(page.getByTestId('media-player')).toBeVisible();
      await zoomOpenSheet(page);
      await page.keyboard.press('Escape');
      await opened(page, [got]);
    }
  });

  await test.step('радиопост 50: регистратор вплотную — снимок стойки крупно (L906), «Свойства файла» (L975)', async () => {
    await deviceUp(page, '50', /./);
    await page.getByTestId('device-use').click();
    await expect(page.getByTestId('radio-strip')).toBeVisible();
    await page.getByTestId('radio-photo-2').click();
    await expect(page.getByTestId('radio-photo-text')).toBeVisible();
    await page.getByTestId('media-props').click();
    await expect(page.getByTestId('media-props-view')).toContainText('radiopost_RL2.wav');
    await handsFree(page);
    await opened(page, ['L906', 'L975']);
  });

  await test.step('«Свойства файла» записей 13, 14, 21, 49 (L971, L970, L972, L974)', async () => {
    for (const [id, file] of [
      ['13', 'VL31_intro.mov'],
      ['14', 'VL31_meet_01.mov'],
      ['21', 'vm_20091013_0702.wav'],
    ] as const) {
      await openSheet(page, id);
      await expect(page.getByTestId('media-player')).toBeVisible();
      await page.getByTestId('media-props').click();
      await expect(page.getByTestId('media-props-view')).toContainText(file);
      await page.keyboard.press('Escape');
      await handsFree(page);
    }
    await deviceUp(page, '49', /./);
    await page.getByTestId('device-use').click();
    await expect(page.getByTestId('pen-view')).toBeVisible();
    await page.getByTestId('media-props').click();
    await expect(page.getByTestId('media-props-view')).toContainText('REC001.wav');
    await page.keyboard.press('Escape');
    await handsFree(page);
    await expect(page.getByTestId('pen-view')).toHaveCount(0);
    await opened(page, ['L971', 'L970', 'L972', 'L974']);
  });

  await test.step('ноутбук 47: картинка учётной записи крупно (L947), ключ (L560–L565)', async () => {
    await deviceUp(page, '47', /Ноутбук/);
    await page.getByTestId('device-use').click();
    await expect(page.getByTestId('laptop-view')).toBeVisible();
    await page.locator('.lap-avatar').first().dblclick();
    await opened(page, ['L947']);
    await drawKey(page, [5, 1, 2, 3, 6, 9, 8, 7, 4]);
    await expect(page.getByTestId('laptop-desktop')).toBeVisible();
    await opened(page, ['L560', 'L561', 'L562', 'L563', 'L564', 'L565']);
    await handsFree(page);
  });

  await test.step('телефон 48: обои крупно (L949), код 0110 (L540)', async () => {
    await deviceUp(page, '48', /Телефон/);
    await page.getByTestId('device-use').click();
    await expect(page.getByTestId('phone-view')).toBeVisible();
    // Обои видны там, где их не закрывают часы, уведомления и панель кода.
    const wallpaperSpot = () =>
      page.evaluate(() => {
        const wp = document.querySelector('.ph-wallpaper');
        const r = wp?.getBoundingClientRect();
        if (!wp || !r) return null;
        for (let y = r.top + 4; y < r.bottom; y += 6)
          for (let x = r.left + 4; x < r.right; x += 6)
            if (document.elementFromPoint(x, y) === wp) return { x, y };
        return null;
      });
    const before = await wallpaperSpot();
    // Находка: до кода панель кода закрывает обои целиком — двойной щелчок по ним невозможен.
    expect
      .soft(before, 'до ввода кода обои экрана блокировки видны хоть где-то (L949)')
      .not.toBeNull();
    if (before) await page.mouse.dblclick(before.x, before.y);
    for (const d of '0110') await page.getByTestId(`phone-key-${d}`).click();
    await expect(page.getByTestId('phone-home')).toBeVisible();
    await opened(page, ['L540']);
    if (!(await mine(page)).has('L949')) {
      // После кода экран блокировки — «slide to unlock» без панели кода: обои видны.
      await handsFree(page);
      await deviceUp(page, '48', /Телефон/);
      await page.getByTestId('device-use').click();
      await expect(page.getByTestId('phone-slide')).toBeVisible();
      const after = await wallpaperSpot();
      if (!after) throw new Error('обои экрана блокировки закрыты и после кода');
      await page.mouse.dblclick(after.x, after.y);
    }
    await opened(page, ['L949']);
    await handsFree(page);
  });

  await test.step('пачки П-01…П-09: листать (L982…L989)', async () => {
    for (const [id, got] of [
      ['П-03', 'L983'],
      ['П-04', 'L984'],
      ['П-05', 'L985'],
      ['П-06', 'L986'],
      ['П-07', 'L987'],
      ['П-08', 'L988'],
      ['П-09', 'L989'],
      ['П-01', 'L982'],
    ] as const) {
      await leafStack(page, id);
      await opened(page, [got]);
    }
  });

  await test.step('П-05: долистать до листов 19–24 текстом вниз — перевернуть (L957)', async () => {
    await stackInHands(page, 'П-05');
    await leafTo(page, 19);
    await expect(page.getByTestId('stack-leaf')).toHaveAttribute('aria-label', 'Перевернуть листы');
    await page.getByTestId('stack-leaf').click({ force: true });
    await expect(page.getByTestId('viewer-paper')).toContainText('Справка о выбытии');
    await handsFree(page);
    await opened(page, ['L957']);
  });

  await test.step('П-02: картон сбоку — вытащить папку A-24 (L981, L991); папка крупно (L956)', async () => {
    await stackInHands(page, 'П-02');
    await edgeOn(page);
    await page.getByTestId('stack-layer-18').click({ force: true });
    await expect(page.getByTestId('held')).toHaveAttribute('aria-label', 'Папка A-24');
    await handsFree(page);
    await opened(page, ['L981', 'L991']);
    // Папка A-24 на стене (L991) — приблизить колесом: крупный план листов (L956, F5).
    await openSheet(page, 'F:П-02/18');
    const paper = await page.getByTestId('viewer-paper').boundingBox();
    if (paper) await page.mouse.move(paper.x + paper.width / 2, paper.y + paper.height / 3);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -120);
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await opened(page, ['L956']);
  });

  await test.step('обрывок из 42 — к половине 51 на стене: совместить (L990)', async () => {
    await openSheet(page, '42');
    await page.getByTestId('sheet-piece').click();
    await expect(page.getByTestId('sheet-piece-gone')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet(page, 'S:42/1')).toBeAttached();
    await joinPieceTo51(page);
    await expect(sheet(page, 'L990')).toBeVisible();
    await opened(page, ['L990']);
  });

  await test.step('телефон на столе: HealthWay, номер партии 0418 (линии ничего не открывают)', async () => {
    await toDesk(page);
    await handsFree(page);
    await page.getByTestId('desk-phone').click();
    await expect(scene(page)).toHaveAttribute('data-spot', 'phone');
    await settle(page);
    for (const d of '88005553120') await page.getByTestId(`dp-key-${d}`).click();
    await page.getByTestId('dp-handset').click();
    await expect(page.getByTestId('dp-heard')).toContainText('введите номер партии');
    for (const d of '0418') await page.getByTestId(`dp-key-${d}`).click();
    await expect(page.getByTestId('dp-heard')).toContainText('Партия 0418');
    await page.getByTestId('dp-handset').click();
    await page.keyboard.press('Escape');
    await expect(scene(page)).toHaveAttribute('data-spot', 'desk');
  });

  await test.step('диск сервера: конверт 52 → вскрыть → на стол → в дисковод (L214, L215)', async () => {
    await toDesk(page);
    await handsFree(page);
    await page.getByTestId('server-disc').click();
    await page.getByTestId('disc-envelope-open').click();
    await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Диск/);
    await page.keyboard.press('Escape');
    const disc = page.getByTestId('server-disc-out');
    await expect(disc).toBeVisible();
    const d = await disc.boundingBox();
    const drive = await page.getByTestId('disc-drive').boundingBox();
    if (!d || !drive) throw new Error('нет диска или дисковода');
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
    await page.mouse.down();
    await page.mouse.move(drive.x + drive.width / 2, drive.y + drive.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByTestId('computer')).toBeVisible({ timeout: 8000 });
    await opened(page, ['L214', 'L215']);
  });

  await test.step('программа сервера: сеансы пользователей, код 05 (L387–L390)', async () => {
    await pcUp(page);
    await page.getByTestId('lap-icon-Сервер объекта VL-31').dblclick();
    await page.getByTestId('srv-menu-sessions').click();
    await page.getByTestId('srv-code').fill('05');
    await page.getByTestId('srv-code-open').click();
    await expect(page.getByTestId('srv-session')).toBeVisible();
    await opened(page, ['L387', 'L388', 'L389', 'L390']);
    await page.keyboard.press('Escape');
  });

  await test.step('сайты без замков: ссылками в листах и адресной строкой компьютера', async () => {
    const tabs: Page[] = [];
    // Ссылки в стартовых листах.
    tabs.push(await siteByLink(page, '02', 'vaultline-program.com'));
    await opened(page, ['L101']);
    tabs.push(await siteByLink(page, '05', 'skycell-mobile.com'));
    await opened(page, ['L178']);
    tabs.push(await siteByLink(page, '01', 'okrug-bureau.org'));
    await opened(page, ['L181']);
    tabs.push(await siteByLink(page, '26', 'hexon-bio.com'));
    await opened(page, ['L163']);
    // Остальные адреса — в закрытых материалах на устройствах, в почте и на сайтах: игрок
    // набирает их в адресной строке браузера компьютера.
    for (const [address, got] of [
      ['mailbridge.net', 'L249'],
      ['octon-labs.net', 'L272'],
      ['aspen-bank.com', 'L130'],
      ['radiosolutions-inc.com', 'L177'],
      ['healthway-nutrition.com', 'L179'],
      ['mesa-supply.com', 'L180'],
      ['the-signal-news.com', 'L296'],
    ] as const) {
      tabs.push(await siteByAddressBar(page, address));
      await opened(page, [got]);
    }
    for (const t of tabs) await t.close();
    await backToGame(page);
  });

  await test.step('почта e.pierce.uk: «Забыли пароль?» → «Тоффи» (L453)', async () => {
    const mb = await siteByAddressBar(page, 'mailbridge.net');
    await fill(mb, 'mb-forgot', { address: 'e.pierce.uk@mailbridge.net' });
    await expect(mb.getByTestId('site-question')).toContainText('собаки');
    await fill(mb, 'mb-answer', { answer: 'Тоффи' });
    await expect(mb.getByTestId('site-mail')).toBeVisible();
    await opened(page, ['L453']);
    await mb.close();
    await backToGame(page);
  });

  await test.step('VAULTLINE: вход по кодовому слову k.walsh → «Йен» (L620, PW-B), учёт анкет VL-31 (L618) и A-24/06.10.2008 (L619), хранилище (L735), архив 0417 (L736–L738)', async () => {
    const vl = await siteByLink(page, '02', 'vaultline-program.com');
    await fill(vl, 'vl-forgot', { login: 'k.walsh' });
    await fill(vl, 'vl-word', { answer: 'Йен' });
    await expect(vl).toHaveURL(/\/cabinet$/);
    await opened(page, ['L620']);
    await fill(vl, 'vl-registry', { program: 'VL-31' });
    await opened(page, ['L618']);
    await fill(vl, 'vl-registry', { program: '', code: 'A-24' });
    await expect(vl.getByTestId('site-doc-L619')).toBeVisible();
    await opened(page, ['L619']);
    await fill(vl, 'vl-docs', { title: 'архив проекта' });
    const msg = vl.getByTestId('site-vl-docs-msg');
    await expect(msg).toContainText('docs.hexon-bio.com/vl-31');
    const [hx] = await Promise.all([
      page.context().waitForEvent('page'),
      msg.locator('a.site-link').first().click(),
    ]);
    await expect(hx.getByTestId('site')).toHaveAttribute('data-domain', 'docs.hexon-bio.com');
    await opened(page, ['L735']);
    await fill(hx, 'hx-archive', { password: '0417' });
    await expect(hx.getByTestId('site-docs')).toBeVisible();
    await opened(page, ['L736', 'L737', 'L738']);
    await hx.close();
    await vl.close();
    await backToGame(page);
  });

  await test.step('архив номеров газеты в браузере компьютера: четыре даты (L831–L834)', async () => {
    await pcBrowser(page);
    await page.getByTestId('pc-fav-17').click();
    const issue = async (date: string) => {
      await page.getByTestId('pc-fav-17').click();
      await page.getByTestId('pc-news-date').fill(date);
      await page.getByTestId('pc-news-open').click();
    };
    for (const [date, got] of [
      ['14.12.1987', 'L831'],
      ['06.10.2009', 'L832'],
      ['28.10.2009', 'L834'],
    ] as const) {
      await issue(date);
      await expect(page.getByTestId('pc-issue')).toBeVisible();
      await opened(page, [got]);
    }
    // Сценарий: «10/14/2009» — американская запись даты, как в выпуске (F6).
    await issue('10/14/2009');
    await expect(page.getByTestId('pc-issue')).toBeVisible();
    await opened(page, ['L833']);
    await page.keyboard.press('Escape');
  });

  await test.step('банк: «Сообщить о смерти арендатора» 845/Коул/13.10.2009 → коробка на столе (L460–L462)', async () => {
    const fr = await siteByAddressBar(page, 'aspen-bank.com');
    await fill(fr, 'fr-death', { box: '845', surname: 'Коул', date: '13.10.2009' });
    await expect(fr.getByTestId('site-fr-death-msg')).toContainText('Сообщение принято');
    await opened(page, ['L460', 'L461', 'L462']);
    await fr.close();
    await backToGame(page);
    await toDesk(page);
    const box = page.getByTestId('container-bank');
    await expect(box).toBeVisible();
    await box.click();
    await page.getByTestId('envelope-open').click();
    await page.getByTestId('envelope-stay').click();
    await expect(page.getByTestId('envelope-view')).toBeHidden();
    await expect(sheet(page, 'L461')).toBeAttached();
    // Кассета с проигрывателем — на столе. Находка: на полном столе её место под коробкой 29 —
    // щелчок по середине берёт коробку; щёлкаем по видимому краю, если он есть.
    const free = await visiblePoint(page, 'device-L462');
    expect
      .soft(free, 'проигрыватель микрокассет (L462) на столе не закрыт коробкой 29')
      .not.toBeNull();
    if (free) await page.mouse.click(free.x, free.y);
    else {
      // Обход: карточка кассеты на стене — щелчок берёт вещь в руки.
      const pt = await showOnWall(page, 'L462');
      await page.mouse.click(pt.x, pt.y);
    }
    await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /микрокассет/);
    // Кассета уже в проигрывателе (6.4): щелчок по нему — вплотную, под ним строка записи.
    await page.getByTestId('cassette-player').click();
    await expect(page.getByTestId('cassette-sheet')).toBeVisible();
    await handsFree(page);
  });

  await test.step('все 78 закрытых материалов у игрока (до решения дела — кроме L998, L999)', async () => {
    const have = await mine(page);
    const missing = ALL_LOCKED.filter((id) => !have.has(id) && id !== 'L998' && id !== 'L999');
    expect.soft(missing, 'до «Решить дело» не открыты').toEqual([]);
  });

  await test.step('«Решить дело»: предупреждение (L998) → продолжить (L999) → форма → отправить', async () => {
    await toDesk(page);
    await handsFree(page);
    await page.getByTestId('solve-case').click();
    await expect(page.getByTestId('solve-warning')).toBeVisible();
    await opened(page, ['L998']);
    await page.getByTestId('solve-continue').click();
    await expect(page.getByTestId('verdict-folder')).toBeVisible();
    await opened(page, ['L999']);
    await page.getByTestId('verdict-person-p:moreau').click();
    for (let k = 0; k < 5; k++) await page.getByTestId('verdict-next').click();
    await page.getByTestId('verdict-send').click();
    await expect(page.getByTestId('verdict-result')).toBeVisible();
  });

  await test.step('эпилог → «Завершить дело» → титры → главное меню', async () => {
    await page.getByTestId('verdict-result-next').click();
    await page.getByTestId('epilogue-envelope').click();
    await expect(page.getByTestId('viewer')).toContainText('Эпилог');
    await page.getByTestId('finish-case').click();
    await expect(page.getByTestId('credits')).toContainText('Дело № 09-1128 закрыто');
    await page.getByTestId('credits-menu').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  await test.step('итог: все 78 закрытых материалов пакета у игрока', async () => {
    const have = await mine(page);
    const missing = ALL_LOCKED.filter((id) => !have.has(id));
    expect(missing, `открыто ${78 - missing.length} из 78`).toEqual([]);
  });
});

/** Точка элемента, которую не закрывает ничто другое (или null). */
async function visiblePoint(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    const r = el?.getBoundingClientRect();
    if (!el || !r) return null;
    for (let y = r.top + 3; y < r.bottom; y += 5)
      for (let x = r.left + 3; x < r.right; x += 5) {
        const at = document.elementFromPoint(x, y);
        if (at && el.contains(at)) return { x, y };
      }
    return null;
  }, testId);
}

/** Нарисовать графический ключ ноутбука через точки. */
async function drawKey(page: Page, dots: number[]) {
  const places = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<SVGElement>('[data-testid^="laptop-dot-"]')].map((el) => {
        const b = el.getBoundingClientRect();
        return [
          el.dataset.testid?.slice('laptop-dot-'.length),
          { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        ];
      }),
    ),
  );
  const at = (n: number) => {
    const p = places[String(n)];
    if (!p) throw new Error(`нет точки ${n}`);
    return p;
  };
  const first = at(dots[0] ?? 1);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const n of dots.slice(1)) {
    const p = at(n);
    await page.mouse.move(p.x, p.y, { steps: 2 });
  }
  await page.mouse.up();
}

/**
 * Утащить обрывок S:42/1 за полоску так, чтобы его верх лёг к низу половины 51 (как join.spec):
 * обе карточки сначала на экране.
 */
async function joinPieceTo51(page: Page) {
  await showOnWall(page, '51');
  await showOnWall(page, 'S:42/1');
  const top = await sheet(page, '51').boundingBox();
  const piece = await sheet(page, 'S:42/1').boundingBox();
  if (!top || !piece) throw new Error('нет половин');
  const zoom = top.width / 160;
  const from = { x: piece.x + STRIP.position.x, y: piece.y + STRIP.position.y };
  const to = {
    x: from.x + top.x - piece.x + 8 * zoom,
    y: from.y + top.y + (104 - 10) * zoom - piece.y,
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}
