import { expect, type Page, test } from '@playwright/test';
import { allowed, overlap, type Rect } from '../src/proto/deskWorld.ts';

/**
 * Прототип 3D-стола (автор 23.11, отдельная страница без сервера): всё — настоящей мышью по
 * вещам. Точки на экране даёт страница (`window.__proto`): вещи — в 3D, кнопок поверх нет.
 */

interface Pt {
  x: number;
  y: number;
}
type Laid = Rect & { id: string };

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([f, a]) =>
      (window as unknown as { __proto: Record<string, (...x: unknown[]) => unknown> }).__proto[
        f as string
      ]?.(...(a as unknown[])),
    [fn, args] as const,
  ) as Promise<T>;

const pieces = (page: Page) => call<Laid[]>(page, 'pieces');
const find = async (page: Page, id: string) => (await pieces(page)).find((p) => p.id === id);

async function drag(page: Page, from: Pt, to: Pt, hold = 0) {
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await page.mouse.down();
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test('прототип 3D-стола: вскрыть клапаном; вещь свободно, без примагничивания, только по столу и мимо вещей следователя; с тем, что сверху, — на стену туда, где отпустили', async ({
  page,
}) => {
  await page.goto('/proto-desk.html');
  await expect
    .poll(() => page.evaluate(() => 'flap' in ((window as { __proto?: object }).__proto ?? {})))
    .toBe(true);

  // Конверт: тянуть клапан вверх — бумаги и устройства на столе.
  const flap = await call<Pt>(page, 'flap');
  await drag(page, flap, { x: flap.x, y: flap.y - 220 });
  await expect.poll(async () => (await pieces(page)).length).toBe(13);
  await page.waitForTimeout(1800);
  const blocked = await call<Rect[]>(page, 'blocked');
  const clear = (r: Rect) => !blocked.some((b) => overlap(r, b));

  // На телефон следователя: вещь до него доходит и останавливается рядом, не на нём.
  const all = await pieces(page);
  const a = all[all.length - 1] as Laid;
  await drag(page, await call<Pt>(page, 'piece', a.id), await call<Pt>(page, 'desk', 0.61, 0.64));
  const a1 = (await find(page, a.id)) as Laid;
  expect(clear(a1)).toBe(true);
  expect(Math.hypot(a1.x - a.x, a1.z - a.z)).toBeGreaterThan(0.05);

  // В пустоту за край экрана: вещь у края стола, в зоне.
  await drag(page, await call<Pt>(page, 'piece', a.id), { x: 1365, y: 767 });
  const a2 = (await find(page, a.id)) as Laid;
  expect(clear(a2)).toBe(true);
  expect(allowed(a2, { inside: () => true, blocked })).toBe(true);

  // Лист на лист — в свободном месте: верхнюю — влево, следующую — на неё со сдвигом. Ложится там,
  // где отпустили (не прыгает к первой), и лежит сверху.
  await drag(page, await call<Pt>(page, 'piece', a.id), await call<Pt>(page, 'desk', -0.35, 0.58));
  const y = all[all.length - 2] as Laid;
  const under = await call<Pt>(page, 'piece', a.id);
  await drag(page, await call<Pt>(page, 'piece', y.id), { x: under.x + 60, y: under.y });
  const y1 = (await find(page, y.id)) as Laid;
  const x1 = (await find(page, a.id)) as Laid;
  expect(Math.abs(y1.x - x1.x)).toBeGreaterThan(0.03);
  const pile = await call<string[]>(page, 'pile', a.id);
  expect(pile).toContain(y.id);

  // Щелчок — лист крупно; Esc — снова на столе.
  const at = await call<Pt>(page, 'piece', y.id);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('proto-viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('proto-viewer')).toHaveCount(0);

  // Зажать нижнюю за край, что виден, подержать — вместе с тем, что сверху; на стену — висят там,
  // где отпустили.
  const low = await call<Pt>(page, 'piece', a.id);
  const wall = await call<Pt>(page, 'board', 500, 520);
  await drag(page, { x: low.x - 40, y: low.y }, wall, 650);
  await expect(page.getByTestId('proto-help')).toContainText(`На стене: ${pile.length} из 13`);
  await expect.poll(async () => (await pieces(page)).length).toBe(13 - pile.length);

  await page.getByTestId('nav-up').click();
  // Камера доехала до стены — доска плоская, координаты экрана = координаты доски.
  await expect(page.getByTestId('proto')).toHaveAttribute('data-moving', 'false');
  const card = page.getByTestId(`wall-${pile[pile.length - 1]}`);
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 500)).toBeLessThan(25);
});
