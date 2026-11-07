import { expect, test } from './fixtures.ts';

test('старт — вид «Стол»', async ({ page }) => {
  await expect(page.getByTestId('view-desk')).toBeVisible();
});

test('вкладка «Справа» открывает доску', async ({ page }) => {
  await page.getByTestId('view-tab-right').click();
  await expect(page.getByTestId('view-right')).toBeVisible();
});

test('стрелки: ← со стола — «Слева», → дважды — «Справа»', async ({ page }) => {
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('view-left')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('view-right')).toBeVisible();
});

test('вид сохраняется после перезагрузки', async ({ page }) => {
  await page.getByTestId('view-tab-left').click();
  await expect(page.getByTestId('view-left')).toBeVisible();
  await page.waitForResponse(
    (r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT',
  );
  await page.reload();
  await expect(page.getByTestId('view-left')).toBeVisible();
});

test('«Комната»: три зоны переключают виды', async ({ page }) => {
  for (const [zone, view] of [
    ['Слева', 'left'],
    ['Стол', 'desk'],
    ['Справа', 'right'],
  ] as const) {
    await page.getByTestId('view-tab-room').click();
    await page.getByTestId('view-room').getByRole('button', { name: zone, exact: true }).click();
    await expect(page.getByTestId(`view-${view}`)).toBeVisible();
  }
});

test('уголок папки виден на всех видах и открывает пустую папку', async ({ page }) => {
  for (const view of ['desk', 'room', 'left', 'right']) {
    await page.getByTestId(`view-tab-${view}`).click();
    await expect(page.getByTestId('petition-corner')).toBeVisible();
  }
  await page.getByTestId('petition-corner').click();
  const folder = page.getByTestId('petition-folder');
  for (const field of ['Кому', 'Прошу', 'На основании']) {
    await expect(folder.getByLabel(field)).toBeDisabled();
  }
  await folder.getByRole('button', { name: 'Закрыть' }).click();
  await expect(folder).toBeHidden();
});

test('при 1366×768 нет горизонтальной прокрутки, вкладки видны', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.getByTestId('view-tab-desk')).toBeInViewport();
  await expect(page.getByTestId('petition-corner')).toBeInViewport();
});

test('щелчок по уголку папки не сдвигает комнату', async ({ page }) => {
  const before = await page.getByTestId('view-tab-desk').boundingBox();
  await page.getByTestId('petition-corner').click();
  const after = await page.getByTestId('view-tab-desk').boundingBox();
  expect(after?.y).toBe(before?.y);
});
