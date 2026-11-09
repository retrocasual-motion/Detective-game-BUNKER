import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

test('поиск по делу (RD-C): слово — строки из материалов; щелчок — лист на найденном', async ({
  page,
}) => {
  await page.getByTestId('search-tab').click();
  const input = page.getByTestId('search-input');
  await expect(input).toBeFocused();
  await input.fill('845');
  await expect(page.getByTestId('search-25')).toContainText('номер 845');
  await expect(page.getByTestId('search-count')).toContainText('—');
  await page.getByTestId('search-25').locator('.search-hit').first().click();
  await expect(page.getByTestId('viewer')).toBeVisible();
  // Найденное подсвечено в листе.
  expect(await page.evaluate(() => CSS.highlights.get('case-find')?.size ?? 0)).toBeGreaterThan(0);
  // Лист открыт на странице с найденным (этап 4b): подсветка — внутри видимой части листа.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const r = [...(CSS.highlights.get('case-find') ?? [])][0] as Range | undefined;
        const box = document.querySelector('.viewer-pages')?.getBoundingClientRect();
        const b = r?.getBoundingClientRect();
        return !!b && !!box && b.left >= box.left && b.right <= box.right;
      }),
    )
    .toBe(true);
  // Лист закрыли — панель с результатами на месте; Esc ещё раз закрывает поиск.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
  await expect(page.getByTestId('search-25')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-panel')).toBeHidden();
});

test('Ctrl+F открывает поиск; ничего не найдено — так и сказано', async ({ page }) => {
  await page.keyboard.press('Control+f');
  await expect(page.getByTestId('search-input')).toBeFocused();
  await page.getByTestId('search-input').fill('квазизвездолёт');
  await expect(page.getByTestId('search-count')).toHaveText(
    'В открытых материалах ничего не найдено.',
  );
});

test('время чтения (RD-A): открытый лист попадает в служебную таблицу', async ({ page }) => {
  await toWall(page);
  await sheet(page, '04').click(STRIP);
  await page.mouse.move(600, 300);
  await page.waitForTimeout(2300);
  await page.keyboard.press('Escape');
  await page.getByTestId('dev-line-tab').click();
  await page.getByTestId('dev-reading').click();
  const row = page.getByTestId('dev-reading-table').locator('tr', { hasText: '04' });
  await expect(row).toContainText('0:0');
  await expect(row.locator('td').nth(2)).toHaveText('1');
});
