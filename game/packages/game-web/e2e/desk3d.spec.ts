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
async function spill(page: Page, id: string) {
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
  await spill(page, 'protocols');
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

  // Щелчок по стопке — верхний лист (30), «1 из 7»; дальше — подряд.
  await deskSettled(page);
  const top = await grab(page, '30');
  await page.mouse.click(top?.x ?? 0, top?.y ?? 0);
  await expect(page.getByTestId('viewer')).toBeVisible();
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
  // Верхний лист стопки — протянуть по столу.
  await deskSettled(page);
  const a = await grab(page, '30');
  expect(a).not.toBeNull();
  const before = (await pieces(page)).find((q) => q.id === '30');
  const moved = savedPut(page);
  await page.mouse.move(a?.x ?? 0, a?.y ?? 0);
  await page.mouse.down();
  // К середине стола: папка «Протоколы» — справа у переднего края (ряд папок, автор 26.11).
  await page.mouse.move((a?.x ?? 0) - 160, (a?.y ?? 0) - 40, { steps: 15 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await moved;
  const after = (await pieces(page)).find((q) => q.id === '30');
  expect(
    Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.z ?? 0) - (before?.z ?? 0)),
  ).toBeGreaterThan(0.05);
  await page.reload();
  await expect.poll(() => desk(page)).toBe(true);
  await expect
    .poll(async () => (await pieces(page)).find((q) => q.id === '30')?.x)
    .toBeCloseTo(after?.x ?? 0, 4);

  // На стену: дотащить за задний край стола — висит там, со стола ушёл.
  await page.waitForTimeout(600);
  await deskSettled(page);
  const b = await grab(page, '30');
  const hung = savedPut(page);
  await page.mouse.move(b?.x ?? 0, b?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move(683, 200, { steps: 25 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await hung;
  await expect.poll(async () => (await pieces(page)).some((q) => q.id === '30')).toBe(false);
  await toWall(page);
  await expect(sheet(page, '30')).toBeVisible();
});

test('3D-стол: «Осмотр места» — папка стопкой; пакет «Изъятое» — все пять устройств на столе; телефон — в руки', async ({
  page,
}) => {
  await spill(page, 'scene');
  const sheets = ['18', '19', '20', '21', '22', '23', '25', '26', '27', '51'];
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
