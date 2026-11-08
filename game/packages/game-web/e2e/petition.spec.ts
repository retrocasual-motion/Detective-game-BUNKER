import { expect, test } from './fixtures.ts';

test('уголок папки внизу слева на всех видах', async ({ page }) => {
  for (const arrow of [null, 'nav-left', 'nav-right', 'nav-right', 'nav-left', 'nav-down']) {
    if (arrow) await page.getByTestId(arrow).click();
    const box = await page.getByTestId('petition-corner').boundingBox();
    expect(box?.x ?? 9999).toBeLessThan(1366 / 3);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(740);
  }
});

test('папка открывается слева на треть экрана, поля — места под карточки, ✕ закрывает', async ({
  page,
}) => {
  const folder = page.getByTestId('petition-folder');
  await expect(folder).toBeHidden();
  await page.getByTestId('petition-corner').click();
  await expect(folder).toBeVisible();
  const box = await folder.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1366 / 2);
  for (const field of ['Кому', 'Прошу', 'На основании']) {
    await expect(folder.getByRole('group', { name: field })).toBeVisible();
  }
  await folder.getByRole('button', { name: 'Закрыть' }).click();
  await expect(folder).toBeHidden();
});

test('уголок папки закрывает её повторным щелчком', async ({ page }) => {
  await page.getByTestId('petition-corner').click();
  await expect(page.getByTestId('petition-folder')).toBeVisible();
  await page.getByTestId('petition-corner').click();
  await expect(page.getByTestId('petition-folder')).toBeHidden();
});

test('открытая папка не мешает: стол рядом работает, стрелки переключают вид', async ({ page }) => {
  await page.getByTestId('petition-corner').click();
  await page.getByTestId('card-07').click();
  await expect(page.getByTestId('viewer')).toBeVisible();
  // Лист открывается правее папки — видны оба.
  const folder = await page.getByTestId('petition-folder').boundingBox();
  const paper = await page.getByTestId('viewer-paper').boundingBox();
  expect(paper?.x ?? 0).toBeGreaterThanOrEqual((folder?.x ?? 0) + (folder?.width ?? 0));
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('view-left')).toBeVisible();
  await expect(page.getByTestId('petition-folder')).toBeVisible();
});

test('щелчок по уголку папки не сдвигает комнату', async ({ page }) => {
  const before = await page.getByTestId('scene').boundingBox();
  await page.getByTestId('petition-corner').click();
  const after = await page.getByTestId('scene').boundingBox();
  expect(after).toEqual(before);
});

test('открытая папка не закрывает стрелку «Слева»', async ({ page }) => {
  await page.getByTestId('petition-corner').click();
  const box = await page.getByTestId('nav-left').boundingBox();
  if (!box) throw new Error('нет стрелки');
  const onTop = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
    { x: box.x + box.width - 4, y: box.y + box.height / 2 },
  );
  expect(onTop).toBe('nav-left');
  await page.getByTestId('nav-left').click();
  await expect(page.getByTestId('view-left')).toBeVisible();
});
