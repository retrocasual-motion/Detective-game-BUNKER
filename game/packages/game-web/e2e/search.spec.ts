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

// ── SR-D (решение автора 10.11): открыть на найденном и показать на доске ──

test('со стола: лист открыт на найденном, под ним — стена, карточка подсвечена и по центру свободной части; следующий результат — одним щелчком', async ({
  page,
}) => {
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('Хейл');
  const rows = page
    .locator('[data-testid^="search-"]')
    .filter({ has: page.locator('.search-hit') });
  await expect(rows.first()).toBeVisible();
  // Два результата, которые висят на стене.
  const ids: string[] = [];
  for (const tid of await rows.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid')),
  )) {
    const id = tid?.replace('search-', '') ?? '';
    if ((await page.getByTestId(`wall-${id}`).count()) > 0) ids.push(id);
    if (ids.length === 2) break;
  }
  expect(ids).toHaveLength(2);
  const [a, b] = ids as [string, string];

  await page.getByTestId(`search-${a}`).locator('.search-hit').first().click();
  await expect(page.getByTestId('viewer')).toBeVisible();
  expect(await page.evaluate(() => CSS.highlights.get('case-find')?.size ?? 0)).toBeGreaterThan(0);
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
  await expect(page.getByTestId(`wall-${a}`)).toHaveAttribute('data-found', 'true');

  // Панель поиска работает поверх листа: следующий результат — сразу другой лист.
  const title = await page.getByTestId('viewer').getAttribute('aria-label');
  await page.getByTestId(`search-${b}`).locator('.search-hit').first().click();
  await expect(page.getByTestId('viewer')).not.toHaveAttribute('aria-label', title ?? '');
  await expect(page.getByTestId(`wall-${b}`)).toHaveAttribute('data-found', 'true');
  await expect(page.getByTestId(`wall-${a}`)).not.toHaveAttribute('data-found', 'true');
  // Лист не под панелью.
  const panel = await page.getByTestId('search-panel').boundingBox();
  const paper = await page.getByTestId('viewer-paper').boundingBox();
  expect((paper?.x ?? 0) + (paper?.width ?? 0)).toBeLessThanOrEqual(panel?.x ?? 0);

  // Закрыли лист — карточка на доске: видна, левее панели, не мельче масштаба 0,6.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
  await expect(page.getByTestId('search-panel')).toBeVisible();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-moving', 'false');
  const card = page.getByTestId(`wall-${b}`).locator('.card');
  await expect
    .poll(async () => {
      const c = await card.boundingBox();
      return !!c && c.x > 0 && c.x + c.width < (panel?.x ?? 0) && c.y > 0 && c.y + c.height < 768;
    })
    .toBe(true);
  expect((await card.boundingBox())?.width ?? 0).toBeGreaterThan(160 * 0.6 - 4);
  // Взялись за стену — подсветка ушла.
  await page.mouse.click(40, 700);
  await expect(page.getByTestId(`wall-${b}`)).not.toHaveAttribute('data-found', 'true');
});

test('найденное не на стене (газета на столе) — просто открыть, вид не меняется', async ({
  page,
}) => {
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('Вестник Блэквуда');
  await page.getByTestId('search-15').locator('.search-hit').first().click();
  await expect(page.getByTestId('viewer')).toBeVisible();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
});
