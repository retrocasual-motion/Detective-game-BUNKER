import type { Page } from '@playwright/test';
import {
  deskSettled,
  expect,
  START,
  savedPut,
  sheet,
  takeDevice,
  test,
  toWall,
} from './fixtures.ts';

// Новое дело, как у игрока: конверты архива опечатаны (A-260).
test.use({ sealed: true });

type Pt = { x: number; y: number };
const desk = (page: Page) =>
  page.evaluate(() => (window as unknown as { __desk?: unknown }).__desk !== undefined);
const grab = (page: Page, id: string) =>
  page.evaluate(
    (i) => (window as unknown as { __desk: { grab(id: string): Pt | null } }).__desk.grab(i),
    id,
  );
const pieces = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __desk: { pieces(): { id: string; x: number; z: number }[] } }
    ).__desk.pieces(),
  );
/** Что на столе, кроме стартовой стопки 01–07 (ST-B: она лежит с начала дела, тут не о ней). */
const ids = async (page: Page) =>
  (await pieces(page))
    .map((q) => q.id)
    .filter((id) => !START.includes(id) && id !== '04')
    .sort();

/**
 * Открыть со стола (FM-B, DC-B; автор 25.11 — папку тоже в руки): папку или короб вещдоков — в руки
 * и открыть: из рук уходит, листы стопкой (устройства) — на столе.
 */
async function spill(page: Page, id: string, close = true) {
  const saved = savedPut(page);
  // За верх: перед коробом может лежать стопка листов — щелчок в середину взял бы лист (took.ts).
  const box = await page.getByTestId(`container-${id}`).boundingBox();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) * 0.15,
  );
  await expect(page.getByTestId('held')).toHaveAttribute(
    'aria-label',
    id === 'seized' ? /^Короб вещдоков/ : /^Папка/,
  );
  await page.getByTestId('envelope-open').dispatchEvent('click');
  // Папка: открыл — сразу чтение с первого листа (автор 27.11); закрыли — прочитанный на стене.
  if (id !== 'seized') {
    await expect(page.getByTestId('viewer')).toBeVisible();
    if (!close) {
      await saved;
      return;
    }
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('viewer')).toBeHidden();
  }
  await expect(page.getByTestId('held')).toBeHidden();
  await saved;
  await expect(page.getByTestId(`container-${id}`)).toHaveCount(0);
}

test('3D-стол (DC-B): конверт — стопкой на стол; читать подряд; прочитанное — на стену группой, оставленное — на столе; после перезагрузки так же', async ({
  page,
}) => {
  await expect.poll(() => desk(page)).toBe(true);
  // С начала дела на столе — газета (автор 25.11).
  await expect.poll(() => ids(page)).toEqual([]);
  // Открыли папку — сразу верхний лист (30), «1 из 7»; под ним стопка уже на столе.
  await spill(page, 'protocols', false);
  const all = ['30', '31', '32', '33', '34', '35', '36'];
  await expect.poll(() => ids(page)).toEqual(all);
  await expect(page.getByTestId('wall-n:archive-protocols')).toHaveCount(0);
  await expect(page.getByTestId('inbox-30')).toHaveCount(0);
  // Стопка: все листы в одном месте, первый по описи — сверху.
  await page.waitForTimeout(1200);
  const ps = (await pieces(page)).filter((q) => all.includes(q.id));
  const spread = Math.max(...ps.map((q) => q.x)) - Math.min(...ps.map((q) => q.x));
  expect(spread).toBeLessThan(0.02);
  await page.screenshot({ path: 'test-results/desk3d-stack.png' });

  await expect(page.getByTestId('viewer')).toHaveAttribute('data-material', '30');
  await expect(page.getByTestId('desk-run-count')).toHaveText('Со стола · 1 из 7');
  await page.getByTestId('desk-next').click();
  await expect(page.getByTestId('desk-run-count')).toHaveText('Со стола · 2 из 7');
  // Второй (31) оставить на столе.
  await page.getByTestId('desk-keep').click();
  await expect(page.getByTestId('desk-keep')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('desk-next').click();
  await expect(page.getByTestId('desk-run-count')).toHaveText('Со стола · 3 из 7');
  await page.getByTestId('desk-prev').click();
  await expect(page.getByTestId('desk-keep')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('desk-next').click();
  await page.screenshot({ path: 'test-results/desk3d-reading.png' });

  // Закрыли: 30 и 32 — на стене под ярлыком конверта; 31 и непрочитанные — на столе.
  const filed = savedPut(page);
  await page.keyboard.press('Escape');
  await filed;
  await expect.poll(() => ids(page)).toEqual(['31', '33', '34', '35', '36']);
  await page.reload();
  await expect.poll(() => desk(page)).toBe(true);
  await expect.poll(() => ids(page)).toEqual(['31', '33', '34', '35', '36']);
  await toWall(page);
  await expect(page.getByTestId('wall-n:archive-protocols')).toBeVisible();
  await expect(sheet(page, '30')).toBeVisible();
  await expect(sheet(page, '32')).toBeVisible();
  await expect(sheet(page, '31')).toHaveCount(0);
});

test('3D-стол: лист двигается и остаётся после перезагрузки; дотащили до стены — висит, где отпустили', async ({
  page,
}) => {
  await spill(page, 'protocols');
  await page.waitForTimeout(1200);
  // Верхний лист стопки (30 прочитан при открытии и на стене) — протянуть по столу.
  await deskSettled(page);
  const a = await grab(page, '31');
  expect(a).not.toBeNull();
  const before = (await pieces(page)).find((q) => q.id === '31');
  const moved = savedPut(page);
  await page.mouse.move(a?.x ?? 0, a?.y ?? 0);
  await page.mouse.down();
  // К середине стола: папка «Протоколы» — справа у переднего края (ряд папок, автор 26.11).
  await page.mouse.move((a?.x ?? 0) - 160, (a?.y ?? 0) - 40, { steps: 15 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await moved;
  const after = (await pieces(page)).find((q) => q.id === '31');
  expect(
    Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.z ?? 0) - (before?.z ?? 0)),
  ).toBeGreaterThan(0.05);
  await page.reload();
  await expect.poll(() => desk(page)).toBe(true);
  await expect
    .poll(async () => (await pieces(page)).find((q) => q.id === '31')?.x)
    .toBeCloseTo(after?.x ?? 0, 4);

  // На стену: дотащить за задний край стола — висит там, со стола ушёл.
  await page.waitForTimeout(600);
  await deskSettled(page);
  const b = await grab(page, '31');
  const hung = savedPut(page);
  await page.mouse.move(b?.x ?? 0, b?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move(683, 200, { steps: 25 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await hung;
  await expect.poll(async () => (await pieces(page)).some((q) => q.id === '31')).toBe(false);
  await toWall(page);
  await expect(sheet(page, '31')).toBeVisible();
});

test('3D-стол: «Осмотр места» — папка стопкой; пакет «Изъятое» — все пять устройств на столе; телефон — в руки', async ({
  page,
}) => {
  await spill(page, 'scene');
  // Первый лист (22) прочитан при открытии — на стене.
  const sheets = ['18', '19', '20', '21', '23', '25', '26', '27', '51'];
  await expect.poll(() => ids(page)).toEqual(sheets);
  await spill(page, 'seized');
  const devices = ['24', '47', '48', '49', '50'];
  await expect.poll(() => ids(page)).toEqual([...sheets, ...devices].sort());
  await expect(page.getByTestId('device-48')).toHaveCount(0);
  // Устройства долетают из пакета не сразу.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/desk3d-scene.png' });
  // Щелчок по телефону на столе — он в руках.
  await deskSettled(page);
  const t = await grab(page, '48');
  await page.mouse.click(t?.x ?? 0, t?.y ?? 0);
  await expect(page.getByTestId('held')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
});

test('устройство проходит мимо другого (автор 26.11): приёмник — вперёд через ноутбук', async ({
  page,
}) => {
  await spill(page, 'seized');
  await page.waitForTimeout(1200);
  await deskSettled(page);
  const at = async (id: string) => (await pieces(page)).find((q) => q.id === id);
  const laptop = await at('47');
  const radio0 = await at('50');
  expect((radio0?.z ?? 0) < (laptop?.z ?? 0)).toBe(true);
  const g = await grab(page, '50');
  const saved = savedPut(page);
  await page.mouse.move(g?.x ?? 0, g?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move((g?.x ?? 0) - 40, (g?.y ?? 0) + 170, { steps: 20 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await saved;
  const radio = await at('50');
  // Прошёл мимо ноутбука и встал перед ним, а не упёрся сзади.
  expect(radio?.z ?? 0).toBeGreaterThan(laptop?.z ?? 0);
});

test('потеря изображения 3D (RV-11): плашка «обновите страницу»; вернул браузер — плашки нет', async ({
  page,
}) => {
  type R = { forceContextLoss(): void; forceContextRestore(): void };
  const lose = (restore: boolean) =>
    page.evaluate((r) => {
      const gl = (window as unknown as { __gl?: R[] }).__gl?.[0];
      if (!gl) return false;
      if (r) gl.forceContextRestore();
      else gl.forceContextLoss();
      return true;
    }, restore);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __gl?: unknown[] }).__gl?.length ?? 0))
    .toBeGreaterThan(0);
  expect(await lose(false)).toBe(true);
  await expect(page.getByTestId('gl-lost')).toContainText('Обновить страницу');
  await lose(true);
  await expect(page.getByTestId('gl-lost')).toBeHidden();
});

test('вещь взяли и положили — плашки «изображение пропало» нет (проверка Fable)', async ({
  page,
}) => {
  await page.getByTestId('container-seized').click();
  await expect(page.getByTestId('held')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toBeHidden();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('gl-lost')).toHaveCount(0);
});

test('окно стало меньше (вышли из F11, RV-3): ручка у края — в кадре и берётся', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await spill(page, 'seized');
  await page.waitForTimeout(1200);
  await deskSettled(page);
  const g = await grab(page, '49');
  const saved = savedPut(page);
  await page.mouse.move(g?.x ?? 0, g?.y ?? 0);
  await page.mouse.down();
  // К ближнему краю большого окна.
  await page.mouse.move(g?.x ?? 0, 1065, { steps: 40 });
  await page.waitForTimeout(1000);
  await page.mouse.up();
  await saved;
  // Вышли из полноэкранного: окно ниже (панель браузера).
  await page.setViewportSize({ width: 1920, height: 900 });
  await expect
    .poll(async () => {
      const p = await grab(page, '49');
      return !!p && p.x > 0 && p.x < 1920 && p.y > 0 && p.y < 900;
    })
    .toBe(true);
  await deskSettled(page);
  const t = await grab(page, '49');
  await page.mouse.click(t?.x ?? 0, t?.y ?? 0);
  await expect(page.getByTestId('held')).toBeVisible();
});

const folders = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __desk?: { folders(): { id: string; x: number; z: number }[] } }
      ).__desk?.folders() ?? [],
  );

test('пока читают только что открытую папку — на столе она закрыта; закрыли лист — открыта, листы на ней (автор 27.11)', async ({
  page,
}) => {
  await spill(page, 'protocols', false);
  // Под листом на столе — та же закрытая папка: раскладки не видно.
  await expect(page.getByTestId('container-protocols')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
  await expect(page.getByTestId('container-protocols')).toHaveCount(0);
  await expect
    .poll(async () => (await folders(page)).map((f) => f.id))
    .toEqual(['folder:protocols']);
});

test('папка — вещь стола (автор 27.11): тянут папку — едут листы на ней; лист — один; на стену не уходит; после перезагрузки там же', async ({
  page,
}) => {
  // Соседняя папка открыта — на её месте больше нет закрытой папки (она преграда), есть куда тянуть.
  await spill(page, 'scene');
  await spill(page, 'protocols');
  await page.waitForTimeout(1200);
  await deskSettled(page);
  const sheetsOn = ['31', '32', '33', '34', '35', '36'];
  const at = async () => new Map((await pieces(page)).map((q) => [q.id, q]));
  const before = await at();
  const f0 = (await folders(page)).find((f) => f.id === 'folder:protocols');
  // Тянуть папку (за край, что не под листами).
  const g = await grab(page, 'folder:protocols');
  expect(g).not.toBeNull();
  const moved = savedPut(page);
  await page.mouse.move(g?.x ?? 0, g?.y ?? 0);
  await page.mouse.down();
  // К середине стола (слева — соседняя закрытая папка, сквозь неё не пройти).
  await page.mouse.move((g?.x ?? 0) - 260, (g?.y ?? 0) - 60, { steps: 25 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await moved;
  const f1 = (await folders(page)).find((f) => f.id === 'folder:protocols');
  const dx = (f1?.x ?? 0) - (f0?.x ?? 0);
  const dz = (f1?.z ?? 0) - (f0?.z ?? 0);
  expect(Math.hypot(dx, dz)).toBeGreaterThan(0.05);
  const after = await at();
  for (const id of sheetsOn) {
    expect(after.get(id)?.x ?? 0).toBeCloseTo((before.get(id)?.x ?? 0) + dx, 3);
    expect(after.get(id)?.z ?? 0).toBeCloseTo((before.get(id)?.z ?? 0) + dz, 3);
  }
  // Лист тянут — едет один.
  await page.waitForTimeout(600);
  await deskSettled(page);
  const s = await grab(page, '31');
  const one = savedPut(page);
  await page.mouse.move(s?.x ?? 0, s?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move((s?.x ?? 0) + 120, (s?.y ?? 0) - 60, { steps: 15 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await one;
  const next = await at();
  expect(Math.hypot((next.get('31')?.x ?? 0) - (after.get('31')?.x ?? 0), 1e-9)).toBeGreaterThan(
    0.02,
  );
  expect(next.get('32')?.x ?? 0).toBeCloseTo(after.get('32')?.x ?? 0, 4);
  // Папку — к стене: не уходит, остаётся на столе.
  await page.waitForTimeout(600);
  await deskSettled(page);
  const h = await grab(page, 'folder:protocols');
  await page.mouse.move(h?.x ?? 0, h?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move(683, 150, { steps: 25 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(800);
  await expect.poll(async () => (await folders(page)).length).toBe(2);
  await toWall(page);
  await expect(sheet(page, '33')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  // После перезагрузки — там же.
  const mine = async () => (await folders(page)).find((f) => f.id === 'folder:protocols');
  const f2 = await mine();
  await page.reload();
  await expect.poll(async () => (await mine())?.x).toBeCloseTo(f2?.x ?? 0, 4);
});

type M = { id: string; mode: string; cy: number; dist: number };
/** Записывать положение вещей стола каждый кадр, мс (проверка движения по кадрам). */
const sample = (page: Page, ms: number) =>
  page.evaluate((ms) => {
    const w = window as unknown as { __desk: { motion(): M[] }; __frames?: M[][] };
    w.__frames = [];
    const end = performance.now() + ms;
    const tick = () => {
      w.__frames?.push(w.__desk.motion());
      if (performance.now() < end) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
const frames = (page: Page) =>
  page.evaluate(() => (window as unknown as { __frames: M[][] }).__frames);

test.describe('движение по кадрам (автор 27.11)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('папку отпустили — листы ложатся вместе с ней, не догоняют', async ({ page }) => {
    await spill(page, 'scene');
    await spill(page, 'protocols');
    await page.waitForTimeout(1500);
    await deskSettled(page);
    const g = await grab(page, 'folder:protocols');
    await page.mouse.move(g?.x ?? 0, g?.y ?? 0);
    await page.mouse.down();
    await page.mouse.move((g?.x ?? 0) - 200, (g?.y ?? 0) - 50, { steps: 20 });
    await page.waitForTimeout(500);
    await sample(page, 900);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const fr = await frames(page);
    // Высота листа над папкой — та же в каждом кадре укладки (±1 px округления).
    const gap = (f: M[], id: string) =>
      (f.find((m) => m.id === id)?.cy ?? 0) - (f.find((m) => m.id === 'folder:protocols')?.cy ?? 0);
    for (const id of ['31', '33', '36']) {
      const gaps = fr.map((f) => gap(f, id));
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(2);
    }
  });

  test('окно меняется — вещи стола на своих местах в каждом кадре, не доезжают', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await spill(page, 'protocols');
    await page.waitForTimeout(1500);
    await sample(page, 1200);
    for (const h of [1040, 1000, 960, 920, 880]) {
      await page.setViewportSize({ width: 1920, height: h });
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(1300);
    const lag = (await frames(page)).map((f) =>
      Math.max(0, ...f.filter((m) => m.mode === 'rest').map((m) => m.dist)),
    );
    expect(Math.max(...lag)).toBeLessThanOrEqual(1);
  });
});
