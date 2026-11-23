import { expect, type Page, test } from '@playwright/test';

/**
 * Прототип 3D-стола (автор 23.11, отдельная страница без сервера): всё — настоящей мышью по
 * вещам. Точки на экране даёт страница (`window.__proto`): вещи — в 3D, кнопок поверх нет.
 */

interface Pt {
  x: number;
  y: number;
}

const call = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    ([f, a]) =>
      (window as unknown as { __proto: Record<string, (...x: unknown[]) => unknown> }).__proto[
        f as string
      ]?.(...(a as unknown[])),
    [fn, args] as const,
  ) as Promise<T>;

const pieces = (page: Page) => call<{ id: string; stack: string }[]>(page, 'pieces');

async function drag(page: Page, from: Pt, to: Pt, hold = 0) {
  await page.mouse.move(from.x, from.y, { steps: 3 });
  await page.mouse.down();
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

test('прототип 3D-стола: клапан — вскрыт, лист на лист — стопка, щелчок — читать, вся стопка — на стену', async ({
  page,
}) => {
  await page.goto('/proto-desk.html');
  await expect
    .poll(() => page.evaluate(() => 'flap' in ((window as { __proto?: object }).__proto ?? {})))
    .toBe(true);

  // Конверт: тянуть клапан вверх — содержимое на столе.
  const flap = await call<Pt>(page, 'flap');
  await drag(page, flap, { x: flap.x, y: flap.y - 220 });
  await expect.poll(async () => (await pieces(page)).length).toBe(10);
  await page.waitForTimeout(1800);

  // Верхний лист — на нижний: ложится сверху, в одну стопку.
  const before = await pieces(page);
  const top = before[before.length - 1]?.id ?? '';
  const bottom = before[0]?.id ?? '';
  await drag(page, await call<Pt>(page, 'piece', top), await call<Pt>(page, 'piece', bottom));
  await expect
    .poll(async () => {
      const ps = await pieces(page);
      const s = ps.find((p) => p.id === top)?.stack;
      return s !== top && ps.filter((p) => p.stack === s).length >= 2;
    })
    .toBe(true);
  await page.waitForTimeout(800);

  // Щелчок по верхнему — лист крупно; Esc — снова на столе.
  const at = await call<Pt>(page, 'piece', top);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('proto-viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('proto-viewer')).toHaveCount(0);

  // Зажать и подержать — вся стопка; дотащить до стены — карточки на доске.
  const ps = await pieces(page);
  const stack = ps.find((p) => p.id === top)?.stack;
  const n = ps.filter((p) => p.stack === stack).length;
  const wall = await call<Pt>(page, 'board', 683, 330);
  await drag(page, await call<Pt>(page, 'piece', top), wall, 600);
  await expect(page.getByTestId('proto-help')).toContainText(`На стене: ${n} из 10`);
  await expect.poll(async () => (await pieces(page)).length).toBe(10 - n);

  // У стены: карточки в группе конверта.
  await page.getByTestId('nav-up').click();
  await expect(page.getByTestId(`wall-${top}`)).toBeVisible();
});
