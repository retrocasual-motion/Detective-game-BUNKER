import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * Регистратор радиопоста (этап 4d-1; решения автора 12.11 — PL-A, ST-A, NV-A с правкой, PM-A,
 * K8): лицом к игроку, счётчик, «перейти к», шкала с полосами звука, подпись по месту, метки.
 */

async function radioUp(page: Page) {
  await page.getByTestId('device-50').click();
  await expect(page.getByTestId('held')).toBeVisible();
  await page.getByTestId('device-use').click();
  await expect(page.getByTestId('radio-view')).toBeVisible();
}

test('по умолчанию — отрезок с тревоги; на шкале полосы звука; щелчок по счётчику — перейти к 13.10 08:45', async ({
  page,
}) => {
  await radioUp(page);
  await expect(page.getByTestId('radio-win-alarm')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.rl2-bar').count()).toBeGreaterThan(10);
  await page.getByTestId('radio-counter').click();
  await page.getByTestId('radio-goto').fill('13.10 08:45:03');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('radio-counter')).toHaveText('13.10 08:45:03');
  await expect(page.getByTestId('radio-caption')).toContainText('удар');
  // Неверный ввод — подсказка у поля, перемотка не двигается.
  await page.getByTestId('radio-goto-btn').click();
  await page.getByTestId('radio-goto').fill('вчера');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('radio-goto-msg')).toContainText('ДД.ММ ЧЧ:ММ');
});

test('пауза — «прослушать» эту точку: в 09:00 в эфире всё ещё дикторский голос (ответ движка)', async ({
  page,
}) => {
  await radioUp(page);
  await page.getByTestId('radio-goto-btn').click();
  await page.getByTestId('radio-goto').fill('13.10 09:00');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('radio-heard')).toContainText('дикторский');
});

test('play идёт по записи; скорость; метка ставится и сохраняется; Esc — снова в руках', async ({
  page,
}) => {
  await radioUp(page);
  await page.getByTestId('radio-goto-btn').click();
  await page.getByTestId('radio-goto').fill('13.10 08:44:00');
  await page.keyboard.press('Enter');
  await page.getByTestId('radio-speed-16').click();
  await page.getByTestId('radio-play').click();
  await expect(page.getByTestId('radio-counter')).not.toHaveText('13.10 08:44:00');
  await page.getByTestId('radio-play').click();
  await page.getByTestId('radio-mark-add').click();
  await page.getByTestId('radio-mark-label').fill('шаги?');
  await page.getByTestId('radio-mark-save').click();
  await expect(page.getByTestId('radio-mark-0')).toContainText('шаги?');
  await expect(page.locator('.rl2-mark')).toHaveCount(1);
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('radio-view')).toHaveCount(0);
  await expect(page.getByTestId('held')).toBeVisible();
  await page.reload();
  await radioUp(page);
  await expect(page.getByTestId('radio-mark-0')).toContainText('шаги?');
});

test('снимки стойки — описание по щелчку; другие сутки — шкала дня', async ({ page }) => {
  await radioUp(page);
  await page.getByTestId('radio-photo-1').click();
  await expect(page.getByTestId('radio-photo-text')).toContainText('приёмник');
  await page.getByTestId('radio-photo-1').click();
  await page.getByTestId('radio-win-d20').click();
  await expect(page.getByTestId('radio-counter')).toHaveText(/^20\.10/);
});
