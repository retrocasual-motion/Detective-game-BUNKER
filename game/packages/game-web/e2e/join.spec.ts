import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

/**
 * Совмещение на стене (этап 4b-2b, решения автора 10.11 — WL-A, MG-A, SRC-A, JN-A): обрывок
 * вынимают из личных вещей Харта (42), на стене сводят его рваный край с низом половины 51 —
 * встаёт встык, и обе становятся одним листом L990.
 */

/** Вынуть обрывок из листа 42: он ушёл на стену и, когда лист закрыт, светится. */
async function takePiece(page: Page) {
  await sheet(page, '42').click(STRIP);
  await expect(page.getByTestId('viewer')).toHaveAttribute('aria-label', 'Личные вещи Н. Харта');
  await page.getByTestId('sheet-piece').click();
  await expect(page.getByTestId('sheet-piece-gone')).toBeVisible();
  await expect(sheet(page, 'S:42/1')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'S:42/1')).toHaveAttribute('data-found', 'true');
}

/** Утащить обрывок за полоску так, чтобы его верх лёг к низу 51 со сдвигом (мировые px). */
async function bringPieceTo51(page: Page, off = { x: 0, y: 0 }) {
  const top = await sheet(page, '51').boundingBox();
  const piece = await sheet(page, 'S:42/1').boundingBox();
  if (!top || !piece) throw new Error('нет половин');
  // Масштаб стены — по ширине карточки (160 мировых px).
  const zoom = top.width / 160;
  const from = { x: piece.x + STRIP.position.x, y: piece.y + STRIP.position.y };
  const to = {
    x: from.x + top.x - piece.x + off.x * zoom,
    y: from.y + top.y + (104 + off.y) * zoom - piece.y,
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await toWall(page);
});

test('обрывок из 42 — своей карточкой; открыть — только он; в 42 — «вынут»', async ({ page }) => {
  await takePiece(page);
  await sheet(page, 'S:42/1').click(STRIP);
  await expect(page.getByTestId('viewer')).toHaveAttribute(
    'aria-label',
    /^Половина листа, обгоревшая/,
  );
  await expect(page.getByTestId('viewer-paper')).toContainText('за рулём');
  await expect(page.getByTestId('viewer-paper')).not.toContainText('Зажигалка');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(sheet(page, 'S:42/1')).toBeAttached();
});

test('свели рваные края — встык и один лист L990 вместо половин; после перезагрузки так же', async ({
  page,
}) => {
  await takePiece(page);
  await bringPieceTo51(page, { x: 8, y: -10 });
  await expect(sheet(page, 'L990')).toBeVisible();
  await expect(sheet(page, 'L990')).toHaveAttribute('data-found', 'true');
  await expect(sheet(page, '51')).toHaveCount(0);
  await expect(sheet(page, 'S:42/1')).toHaveCount(0);
  await page.reload();
  await expect(sheet(page, 'L990')).toBeAttached();
  await expect(sheet(page, '51')).toHaveCount(0);
  // Открыть — лист целиком, сверху вниз.
  await toWall(page);
  await sheet(page, 'L990').click(STRIP);
  await expect(page.getByTestId('viewer-paper')).toContainText('за рулём');
});

test('отпустили далеко от края — половины так и висят порознь', async ({ page }) => {
  await takePiece(page);
  await bringPieceTo51(page, { x: 0, y: 260 });
  await page.waitForTimeout(700);
  await expect(sheet(page, 'L990')).toHaveCount(0);
  await expect(sheet(page, '51')).toBeVisible();
  await expect(sheet(page, 'S:42/1')).toBeVisible();
});
