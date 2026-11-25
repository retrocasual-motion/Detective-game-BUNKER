import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

/** Масштаб и сдвиг доски — из transform мира холста. */
async function wallCam(page: import('@playwright/test').Page) {
  const style = (await page.locator('.wall .canvas-world').getAttribute('style')) ?? '';
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(style);
  if (!m) throw new Error(`нет камеры: ${style}`);
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}

test.describe('тачпад (TP-C)', () => {
  test.use({ input: 'trackpad' });

  test('стена: два пальца сдвигают доску, щипок приближает', async ({ page }) => {
    await toWall(page);
    await expect(page.getByTestId('wall-hint')).toHaveText('Shift + протяжка — выделить несколько');
    await page.mouse.move(800, 400);
    const before = await wallCam(page);
    // Щипок — это прокрутка с Ctrl: доска ближе (со стола она видна целиком — сдвигать некуда).
    await page.keyboard.down('Control');
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -60);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await wallCam(page)).zoom).toBeGreaterThan(before.zoom * 1.3);
    const near = await wallCam(page);
    await page.mouse.wheel(40, 30);
    await expect.poll(async () => (await wallCam(page)).x).toBeCloseTo(near.x - 40, 0);
    expect((await wallCam(page)).y).toBeCloseTo(near.y - 30, 0);
    expect((await wallCam(page)).zoom).toBeCloseTo(near.zoom, 3);
  });

  test('лист: щипок приближает, два пальца сдвигают приближённый лист', async ({ page }) => {
    await toWall(page);
    await sheet(page, '43').click(STRIP);
    await page.getByTestId('bag-open').click();
    const paper = page.getByTestId('viewer-paper');
    const w0 = (await paper.boundingBox())?.width ?? 0;
    await page.mouse.move(700, 380);
    await page.keyboard.down('Control');
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -40);
    await page.keyboard.up('Control');
    await expect
      .poll(async () => (await paper.boundingBox())?.width ?? 0)
      .toBeGreaterThan(w0 * 1.5);
    const x0 = (await paper.boundingBox())?.x ?? 0;
    await page.mouse.wheel(80, 0);
    await expect.poll(async () => (await paper.boundingBox())?.x ?? 0).toBeLessThan(x0 - 40);
  });
});

test('«Настройки» → «Управление»: переключатель меняет подсказку', async ({ page }) => {
  await page.getByTestId('menu-tab').click();
  await page.getByTestId('menu-settings').click();
  await expect(page.getByTestId('menu-input-mouse')).toBeChecked();
  await page.getByTestId('menu-input-trackpad').check();
  await page.getByTestId('menu-back').click();
  await page.getByTestId('menu-continue').click();
  await toWall(page);
  await expect(page.getByTestId('wall-hint')).toHaveText('Shift + протяжка — выделить несколько');
  expect(await page.evaluate(() => localStorage.getItem('bunker.input'))).toBe('trackpad');
});
