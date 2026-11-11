import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

/**
 * Блокнот следователя и папка ходатайства поверх всего (правка автора 11.11, DV-A): файлы
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
  await page.getByTestId('device-47').click();
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
  await expect(text(page)).toBeHidden();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
  await page.getByTestId('notebook-tab').click();
  await expect(text(page)).toHaveValue('Спросить про ящик Эммы');
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
  await expect(text(page)).toBeHidden();
  await expect(page.getByTestId('viewer')).toBeVisible();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
});

test('поверх ноутбука: цифры и Enter в блокноте не трогают ключ; ноутбук уходит в свободное место', async ({
  page,
}) => {
  await laptopUp(page);
  const frame = page.locator('.laptop-frame');
  const before = await frame.boundingBox();
  await page.getByTestId('notebook-tab').click();
  await expect(text(page)).toBeVisible();
  expect(await isOnTop(page, 'notebook-text')).toBe(true);
  await text(page).pressSequentially('5123');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('laptop-lock-msg')).toHaveText('Нарисуйте ключ');
  await expect(page.getByTestId('laptop-view')).toBeVisible();
  const after = await frame.boundingBox();
  const pad = await page.getByTestId('notebook').boundingBox();
  if (!before || !after || !pad) throw new Error('нет рамки');
  expect(after.width).toBeLessThan(before.width);
  expect(after.x + after.width).toBeLessThanOrEqual(pad.x + 1);
});

test('папка ходатайства — поверх ноутбука: карточка видна сразу, подпись — файл ноутбука', async ({
  page,
}) => {
  await laptopUp(page);
  for (const n of [5, 1, 2, 3, 6, 9, 8, 7, 4]) await page.keyboard.press(String(n));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('laptop-desktop')).toBeVisible();
  await page.getByTestId('lap-icon-Доклад_Р.txt').dblclick();
  const pad = page.getByTestId('lap-notepad');
  await pad.evaluate((el) => {
    const node = el.firstChild;
    if (!node) return;
    const word = 'e.pierce.uk@mailbridge.net';
    const i = (node.textContent ?? '').indexOf(word);
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(node, i + word.length);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(r);
  });
  const box = await pad.boundingBox();
  if (!box) throw new Error('нет блокнота');
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.up();
  await page.getByTestId('laptop-to-petition').click();
  // Ноутбук не закрывали: папка выехала поверх него, карточка на виду.
  await expect(page.getByTestId('laptop-view')).toBeVisible();
  const card = page.getByTestId('petition-card').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('Ноутбук · Доклад_Р.txt');
  await expect(card).not.toContainText('L563');
  expect(await isOnTop(page, 'petition-card')).toBe(true);
  const frame = await page.locator('.laptop-frame').boundingBox();
  const folder = await page.getByTestId('petition-folder').boundingBox();
  if (!frame || !folder) throw new Error('нет рамки');
  expect(frame.x).toBeGreaterThanOrEqual(folder.x + folder.width - 1);
});
