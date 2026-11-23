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
/** Изъятые устройства в прототипе. */
const DEVICES = ['48', '49', '24'];

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

/** Вещи на столе ни во что не врезаются (автор 23.11: «никаких пересечений»). */
const noCrossing = async (page: Page, when: string) =>
  expect(await call<string[]>(page, 'intersections'), when).toEqual([]);

/** Протянуть настоящей мышью; на середине пути и после — ничего не врезается. */
async function drag(page: Page, from: Pt, to: Pt, hold = 0) {
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await page.mouse.down();
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
  await page.waitForTimeout(120);
  await noCrossing(page, 'в руке, на середине пути');
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(700);
  await noCrossing(page, 'отпустили');
}

test('прототип 3D-стола: вскрыть клапаном; вещь свободно, без примагничивания, только по столу и мимо вещей следователя; с тем, что сверху, — на стену туда, где отпустили', async ({
  page,
}) => {
  // Много протяжек настоящей мышью — дольше обычного.
  test.setTimeout(90_000);
  await page.goto('/proto-desk.html');
  await expect
    .poll(() => page.evaluate(() => 'flap' in ((window as { __proto?: object }).__proto ?? {})))
    .toBe(true);

  // Конверт: тянуть клапан вверх — бумаги и устройства на столе.
  const flap = await call<Pt>(page, 'flap');
  await drag(page, flap, { x: flap.x, y: flap.y - 220 });
  await expect.poll(async () => (await pieces(page)).length).toBe(13);
  await page.waitForTimeout(1800);
  await noCrossing(page, 'высыпали из конверта');
  const blocked = await call<Rect[]>(page, 'blocked');
  const clear = (r: Rect) => !blocked.some((b) => overlap(r, b));

  const all = await pieces(page);
  const papers = all.filter((p) => !DEVICES.includes(p.id));
  const grab = (id: string) => call<Pt>(page, 'grab', id);
  const overlapsNow = async (x: string, y: string) =>
    overlap((await find(page, x)) as Laid, (await find(page, y)) as Laid);

  // На телефон следователя: вещь до него доходит и останавливается рядом, не на нём.
  const a = papers[papers.length - 1] as Laid;
  await drag(page, await grab(a.id), await call<Pt>(page, 'desk', 0.61, 0.64));
  const a1 = (await find(page, a.id)) as Laid;
  expect(clear(a1)).toBe(true);
  expect(Math.hypot(a1.x - a.x, a1.z - a.z)).toBeGreaterThan(0.05);

  // В пустоту за край экрана: вещь у края стола, в зоне.
  await drag(page, await grab(a.id), { x: 1365, y: 767 });
  const a2 = (await find(page, a.id)) as Laid;
  expect(clear(a2)).toBe(true);
  expect(allowed(a2, { inside: () => true, blocked })).toBe(true);

  // Лист на лист — в свободном месте: один — влево, второй — на него со сдвигом. Ложится там,
  // где отпустили (не прыгает к первому), и лежит сверху.
  await drag(page, await grab(a.id), await call<Pt>(page, 'desk', -0.35, 0.58));
  const y = papers[papers.length - 2] as Laid;
  // Сначала — в сторону: лист, вынутый из-под другого, пока его касается, едет под ним (как на
  // столе); вышел — сверху всего.
  await drag(page, await grab(y.id), await call<Pt>(page, 'desk', 0.02, 0.62));
  const under = await call<Pt>(page, 'piece', a.id);
  // Взять за видимую точку и отпустить так, чтобы центр листа лёг чуть правее центра нижнего.
  const gy = await grab(y.id);
  const cy = await call<Pt>(page, 'piece', y.id);
  await drag(page, gy, { x: under.x + (gy.x - cy.x) + 80, y: under.y + (gy.y - cy.y) });
  const y1 = (await find(page, y.id)) as Laid;
  const x1 = (await find(page, a.id)) as Laid;
  expect(Math.abs(y1.x - x1.x)).toBeGreaterThan(0.03);
  // Лёг поверх, внахлёст (со сдвигом — не стопка: удержание её не возьмёт).
  expect(await overlapsNow(a.id, y.id)).toBe(true);
  const layers = new Map(await call<[string, number][]>(page, 'layers'));
  expect(layers.get(y.id) ?? 0).toBeGreaterThan(layers.get(a.id) ?? 0);
  expect(await call<string[]>(page, 'pile', a.id)).not.toContain(y.id);

  // DV-B: на устройство не кладут — ни устройство, ни лист: встают рядом.
  await drag(page, await grab('24'), await call<Pt>(page, 'piece', '48'));
  expect(await overlapsNow('24', '48')).toBe(false);
  const z = papers[0] as Laid;
  await drag(page, await grab(z.id), await call<Pt>(page, 'piece', '48'));
  expect(await overlapsNow(z.id, '48')).toBe(false);
  // А само устройство на бумагу ложится; лист из-под него вытаскивают.
  await drag(page, await grab('49'), await call<Pt>(page, 'piece', y.id));
  expect(await overlapsNow('49', y.id)).toBe(true);
  await drag(page, await grab(y.id), await call<Pt>(page, 'desk', -0.05, 0.62));
  expect(await overlapsNow('49', y.id)).toBe(false);

  // Щелчок — лист крупно; Esc — снова на столе.
  const at = await grab(y.id);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('proto-viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('proto-viewer')).toHaveCount(0);

  // Ручка лежит на нижнем листе: зажать лист и подержать — едет вместе с ней.
  const pile = await call<string[]>(page, 'pile', a.id);
  expect(pile.length).toBeGreaterThan(1);

  // Зажать нижнюю за край, что виден, подержать — вместе с тем, что сверху; на стену — висят там,
  // где отпустили.
  const wall = await call<Pt>(page, 'board', 500, 520);
  await drag(page, await grab(a.id), wall, 650);
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
