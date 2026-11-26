import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, takeDevice, test, toWall } from './fixtures.ts';

/**
 * Блокнот следователя и папка запроса поверх всего (правка автора 11.11, DV-A): файлы
 * устройств на стену не переносятся — что важно, игрок записывает сам.
 */

const text = (page: Page) => page.getByTestId('notebook-text');

/** Точка внутри элемента принадлежит ему — он сверху, а не под другим слоем. */
async function isOnTop(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (el === hit || el.contains(hit));
  });
}

async function laptopUp(page: Page) {
  await takeDevice(page, '47');
  await page.getByTestId('device-use').click();
  await expect(page.getByTestId('laptop-lock')).toBeVisible();
}

test('блокнот: язычок — страница, записи сохраняются после перезагрузки; Esc закрывает', async ({
  page,
}) => {
  await page.getByTestId('notebook-tab').click();
  await expect(text(page)).toBeVisible();
  await expect(text(page)).toBeFocused();
  await text(page).fill('Спросить про ящик Эммы');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('notebook-tab')).toHaveAttribute('aria-expanded', 'false');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
  await page.getByTestId('notebook-tab').click();
  await expect(text(page)).toHaveValue('Спросить про ящик Эммы');
});

test('закрытый блокнот торчит краем, как папка запроса: щелчок по краю — открыть', async ({
  page,
}) => {
  const peek = page.getByTestId('notebook-peek');
  const box = await peek.boundingBox();
  const vh = page.viewportSize()?.height ?? 768;
  if (!box) throw new Error('нет края');
  // Видна полоска блокнота под язычком (не один язычок в воздухе).
  expect(vh - box.y).toBeGreaterThan(20);
  await page.mouse.click(box.x + box.width / 2, vh - 10);
  await expect(page.getByTestId('notebook-tab')).toHaveAttribute('aria-expanded', 'true');
  await expect(text(page)).toBeFocused();
  // Язычок — закрыть.
  await page.getByTestId('notebook-tab').click();
  await expect(page.getByTestId('notebook-tab')).toHaveAttribute('aria-expanded', 'false');
});

test('пишут на любой строке: щелчок по пятой строке пустой страницы — курсор там', async ({
  page,
}) => {
  await page.getByTestId('notebook-tab').click();
  const box = await text(page).boundingBox();
  if (!box) throw new Error('нет страницы');
  await page.mouse.click(box.x + 120, box.y + 30 * 4 + 15);
  await page.keyboard.type('пятая');
  await expect(text(page)).toHaveValue('\n\n\n\nпятая');
});

test('ниже записи щёлкнули — пишут там, а не в начале первой строки', async ({ page }) => {
  await page.getByTestId('notebook-tab').click();
  await text(page).pressSequentially('Ящик Эммы');
  const box = await text(page).boundingBox();
  if (!box) throw new Error('нет страницы');
  await page.mouse.click(box.x + 100, box.y + 30 * 3 + 12);
  await page.keyboard.type('вопрос');
  await expect(text(page)).toHaveValue(/^Ящик Эммы\n+вопрос$/);
});

test('страницы: листают вперёд и назад, на каждой своё; после перезагрузки так же', async ({
  page,
}) => {
  await page.getByTestId('notebook-tab').click();
  await expect(page.getByTestId('notebook-next')).toBeDisabled();
  await text(page).fill('первая');
  await page.getByTestId('notebook-next').click();
  await expect(page.getByTestId('notebook-page')).toHaveText('2');
  await expect(text(page)).toHaveValue('');
  await text(page).fill('вторая');
  await page.getByTestId('notebook-prev').click();
  await expect(text(page)).toHaveValue('первая');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
  await page.getByTestId('notebook-tab').click();
  // Открывается на последней исписанной странице.
  await expect(page.getByTestId('notebook-page')).toHaveText('2');
  await expect(text(page)).toHaveValue('вторая');
});

test('страница кончилась: Enter на последней строке — следующая страница', async ({ page }) => {
  await page.getByTestId('notebook-tab').click();
  await text(page).fill(Array.from({ length: 15 }, (_, k) => `строка ${k + 1}`).join('\n'));
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('notebook-page')).toHaveText('2');
  await page.keyboard.type('дальше');
  await expect(text(page)).toHaveValue('дальше');
});

test('поверх листа: лист не закрывается, стрелки и Esc в блокноте до листа не доходят', async ({
  page,
}) => {
  await toWall(page);
  await sheet(page, '01').click(STRIP);
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.getByTestId('notebook-tab').click();
  await expect(text(page)).toBeVisible();
  expect(await isOnTop(page, 'notebook-text')).toBe(true);
  await text(page).pressSequentially('заметка');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('notebook-tab')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('viewer')).toBeVisible();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
});

test('поверх ноутбука: цифры и Enter в блокноте не трогают ключ; ноутбук уходит в свободное место', async ({
  page,
}) => {
  await laptopUp(page);
  const frame = page.locator('.held-screen');
  const before = await frame.boundingBox();
  await page.getByTestId('notebook-tab').click();
  await expect(text(page)).toBeVisible();
  expect(await isOnTop(page, 'notebook-text')).toBe(true);
  await text(page).pressSequentially('5123');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('laptop-lock-msg')).toHaveText('Нарисуйте ключ или щёлкайте по точкам');
  await expect(page.getByTestId('laptop-view')).toBeVisible();
  const after = await frame.boundingBox();
  const pad = await page.getByTestId('notebook').boundingBox();
  if (!before || !after || !pad) throw new Error('нет рамки');
  expect(after.width).toBeLessThan(before.width);
  expect(after.x + after.width).toBeLessThanOrEqual(pad.x + 1);
});
