import { expect, savedPut, sheet, test, toWall } from './fixtures.ts';

// Новое дело, как у игрока: конверты архива опечатаны (A-260).
test.use({ sealed: true });

test('старт: на стене персонажи и 01–07; на столе конверты, коробка, газета; устройств нет', async ({
  page,
}) => {
  await expect(sheet(page, '07')).toBeAttached();
  await expect(sheet(page, '25')).toHaveCount(0);
  await expect(sheet(page, '15')).toHaveCount(0);
  for (const [id, label] of [
    ['protocols', 'Протоколы опроса'],
    ['scene', 'Место происшествия и улики'],
    ['bunker', 'Бункер и программа'],
    ['personal', 'Личные вещи'],
  ] as const)
    await expect(page.getByTestId(`container-${id}`)).toHaveText(label);
  await expect(page.getByTestId('device-47')).toHaveCount(0);
  await expect(page.getByTestId('newspaper')).toBeVisible();
});

test('конверт вскрывается щелчком: содержимое — на стену группой под названием; после перезагрузки так же', async ({
  page,
}) => {
  const saved = savedPut(page);
  await page.getByTestId('container-protocols').click();
  await saved;
  await expect(page.getByTestId('container-protocols')).toHaveCount(0);
  await toWall(page);
  for (const id of ['30', '33', '36']) await expect(sheet(page, id)).toBeVisible();
  await expect(page.getByTestId('wall-n:archive-protocols')).toContainText('Протоколы опроса');
  await page.reload();
  await expect(sheet(page, '30')).toBeAttached();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('container-protocols')).toHaveCount(0);
});

test('«Место происшествия и улики» приносит на стол устройства; коробка вскрывается', async ({
  page,
}) => {
  await page.getByTestId('container-scene').click();
  await expect(page.getByTestId('device-47')).toBeVisible();
  await expect(page.getByTestId('device-50')).toBeVisible();
  await page.getByTestId('container-personal').click();
  await expect(page.getByTestId('bags-box')).toHaveText('Личные вещи · 40–46');
  await toWall(page);
  await expect(sheet(page, '48')).toBeAttached();
  await expect(sheet(page, '45')).toBeAttached();
});

test('поиск не видит невскрытого; после вскрытия — находит', async ({ page }) => {
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('DO NOT DUPLICATE');
  await expect(page.getByTestId('search-count')).toHaveText('Ничего не найдено.');
  await page.getByTestId('search-panel').getByRole('button', { name: 'Закрыть поиск' }).click();
  await page.getByTestId('container-scene').click();
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('DO NOT DUPLICATE');
  await expect(page.getByTestId('search-25')).toBeVisible();
});

test('газета на столе — бумажный номер; сайт газеты — закладки на компьютере', async ({ page }) => {
  await page.getByTestId('newspaper').click();
  await expect(page.getByTestId('viewer')).toContainText('номер от 16 ноября 2009');
  await page.keyboard.press('Escape');
  await page.getByTestId('computer-monitor').click();
  await page.getByTestId('computer-tab-Закладки').click();
  await page.getByTestId('bookmark-16').click();
  await expect(page.getByTestId('viewer')).toContainText('Год, как не стало');
});
