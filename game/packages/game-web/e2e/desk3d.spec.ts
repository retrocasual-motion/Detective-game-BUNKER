import type { Page } from '@playwright/test';
import { expect, savedPut, sheet, test, toWall } from './fixtures.ts';

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

/** Взять конверт со стола, вскрыть (в руках — вскрытый, OP-D), положить: содержимое — на стол. */
async function spill(page: Page, id: string) {
  await page.getByTestId(`container-${id}`).click();
  await page.getByTestId('envelope-open').dispatchEvent('click');
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /» · вскрыт/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toBeHidden();
}

test('3D-стол: конверт высыпается на стол; лист двигается и остаётся после перезагрузки; на стену — висит, где отпустили', async ({
  page,
}) => {
  await expect.poll(() => desk(page)).toBe(true);
  const saved = savedPut(page);
  await spill(page, 'protocols');
  await saved;
  // Все семь протоколов — на столе, не на стене и не во «Входящих».
  await expect.poll(async () => (await pieces(page)).map((q) => q.id).sort()).toEqual([
    '30',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
  ]);
  await expect(page.getByTestId('wall-n:archive-protocols')).toHaveCount(0);
  await expect(page.getByTestId('inbox-30')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/desk3d-spilled.png' });

  // Протянуть лист по столу: лежит там, где отпустили; после перезагрузки — там же.
  const a = await grab(page, '33');
  expect(a).not.toBeNull();
  const before = (await pieces(page)).find((q) => q.id === '33');
  const moved = savedPut(page);
  await page.mouse.move(a?.x ?? 0, a?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move((a?.x ?? 0) - 120, (a?.y ?? 0) + 40, { steps: 15 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await moved;
  const after = (await pieces(page)).find((q) => q.id === '33');
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeGreaterThan(0.05);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/desk3d-moved.png' });
  await page.reload();
  await expect.poll(() => desk(page)).toBe(true);
  await expect
    .poll(async () => (await pieces(page)).find((q) => q.id === '33')?.x)
    .toBeCloseTo(after?.x ?? 0, 4);

  // Щелчок — читать.
  await page.waitForTimeout(600);
  const c = await grab(page, '31');
  await page.mouse.click(c?.x ?? 0, c?.y ?? 0);
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();

  // На стену: дотащить за задний край стола — висит там, со стола ушёл.
  const b = await grab(page, '31');
  const hung = savedPut(page);
  await page.mouse.move(b?.x ?? 0, b?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move(683, 200, { steps: 25 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/desk3d-to-wall.png' });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await hung;
  await expect.poll(async () => (await pieces(page)).some((q) => q.id === '31')).toBe(false);
  await page.screenshot({ path: 'test-results/desk3d-hung.png' });
  await toWall(page);
  await expect(sheet(page, '31')).toBeVisible();
});

test('3D-стол: «Осмотр места» — листы и камера, телефон, ручка на столе; ноутбук и радиопост на местах', async ({
  page,
}) => {
  await spill(page, 'scene');
  await expect
    .poll(async () => new Set((await pieces(page)).map((q) => q.id)))
    .toEqual(new Set(['22', '23', '25', '26', '27', '51', '18', '19', '20', '21', '24', '48', '49']));
  await expect(page.getByTestId('device-47')).toBeVisible();
  await expect(page.getByTestId('device-50')).toBeVisible();
  await expect(page.getByTestId('device-48')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/desk3d-scene.png' });
  // Щелчок по телефону на столе — он в руках.
  const t = await grab(page, '48');
  await page.mouse.click(t?.x ?? 0, t?.y ?? 0);
  await expect(page.getByTestId('held')).toBeVisible();
  await page.keyboard.press('Escape');
});
