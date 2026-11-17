import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * Камера инженера (24; A-268 — изъята сама камера с картой; автор 17.11: «как телефон»): в руках
 * вертят, щелчок по экрану — вплотную, экран живой; кнопки на корпусе — ◀ ▶, DISP (время —
 * свойства L973), T (крупно — L905), W (таблица по девять), MENU.
 */

async function cameraUp(page: Page) {
  await page.getByTestId('device-24').click();
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Камера/);
  await page.getByTestId('device-use').click();
  await expect(page.getByTestId('held')).toHaveAttribute('data-focus', 'camera');
  await expect(page.getByTestId('camera-view')).toBeVisible();
}

const frame = (page: Page) => page.getByTestId('camera-view');

test('просмотр: последний кадр, ◀ ▶ листают, подпись — что на кадре', async ({ page }) => {
  await cameraUp(page);
  await expect(frame(page)).toHaveAttribute('data-frame', '61');
  await expect(page.getByTestId('camera-count')).toHaveText('61/61');
  await expect(page.getByTestId('camera-caption')).toContainText('Дверь кабинета снаружи');
  await page.getByTestId('camera-right').click();
  await expect(frame(page)).toHaveAttribute('data-frame', '1');
  await page.getByTestId('camera-left').click();
  await page.getByTestId('camera-left').click();
  await expect(frame(page)).toHaveAttribute('data-frame', '60');
  // Стрелки клавиатуры — те же кнопки.
  await page.keyboard.press('ArrowRight');
  await expect(frame(page)).toHaveAttribute('data-frame', '61');
});

test('W — таблица по девять, стрелки выбирают, SET — кадр; T — крупно (L905)', async ({ page }) => {
  await cameraUp(page);
  await page.getByTestId('camera-w').click();
  await expect(page.getByTestId('camera-index')).toBeVisible();
  for (let k = 0; k < 15; k++) await page.getByTestId('camera-up').click();
  await expect(frame(page)).toHaveAttribute('data-frame', '16');
  await page.getByTestId('camera-left').click();
  await page.getByTestId('camera-left').click();
  await page.getByTestId('camera-set').click();
  await expect(frame(page)).toHaveAttribute('data-mode', 'single');
  await expect(frame(page)).toHaveAttribute('data-frame', '14');
  await expect(page.getByTestId('camera-caption')).toContainText('Подножие сверху');
  await page.getByTestId('camera-t').click();
  await expect(page.getByTestId('camera-zoom')).toHaveText('×2');
  await expect(page.getByTestId('camera-detail')).toContainText('МЕДКАБ');
  await page.getByTestId('camera-w').click();
  await expect(page.getByTestId('camera-detail')).toHaveCount(0);
});

test('DISP — время съёмки (свойства L973); MENU — меню; стереть нельзя: карта защищена', async ({
  page,
}) => {
  await cameraUp(page);
  await page.keyboard.press('ArrowLeft');
  await page.getByTestId('camera-w').click();
  for (let k = 0; k < 15; k++) await page.getByTestId('camera-up').click();
  await page.getByTestId('camera-set').click();
  await expect(frame(page)).toHaveAttribute('data-frame', '15');
  await page.getByTestId('camera-disp').click();
  await expect(page.getByTestId('camera-info')).toHaveText('13.10.2009, 08:56:40');
  await page.getByTestId('camera-disp').click();
  await expect(page.getByTestId('camera-count')).toHaveCount(0);
  await page.getByTestId('camera-menu').click();
  await expect(page.getByTestId('camera-menu-screen')).toBeVisible();
  await page.getByTestId('camera-down').click();
  await page.getByTestId('camera-set').click();
  await expect(page.getByTestId('camera-msg')).toContainText('Card locked');
  // Отошли и взяли снова — время уже открыто, кадр тот же.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toHaveAttribute('data-focus', '');
  await page.getByTestId('device-use').click();
  await expect(frame(page)).toHaveAttribute('data-frame', '15');
});
