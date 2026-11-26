import { expect, test } from './fixtures.ts';

test('при входе — главное меню: «Продолжить дело» ведёт к столу, «Меню» — обратно', async ({
  page,
}) => {
  await page.goto('/?opened=all');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('main-menu')).toContainText('БУНКЕР');
  await page.getByTestId('menu-continue').click();
  await expect(page.getByTestId('main-menu')).toHaveCount(0);
  await expect(page.getByTestId('room')).toBeVisible();
  await page.getByTestId('menu-tab').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
});

test.describe('без «уменьшить движение» в фикстуре', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('настройки: «уменьшить движение» включается и сохраняется', async ({ page }) => {
    await page.goto('/?opened=all');
    await page.getByTestId('menu-settings').click();
    const box = page.getByTestId('menu-reduce-motion');
    await expect(box).not.toBeChecked();
    await box.check();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    await page.reload();
    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('menu-reduce-motion')).toBeChecked();
  });
});

test('«Новое дело» — после подтверждения всё с начала; титры — и назад в меню', async ({
  page,
}) => {
  // Фикстура вскрыла конверты; заходим как игрок — через меню.
  await page.goto('/');
  await page.getByTestId('menu-credits').click();
  await expect(page.getByTestId('credits')).toBeVisible();
  await page.getByTestId('credits-menu').click();
  await page.getByTestId('menu-new').click();
  await page.getByTestId('menu-new-confirm').click();
  // Дело с начала: конверты опечатаны, меню пропущено.
  await expect(page.getByTestId('room')).toBeVisible();
  await expect(page.getByTestId('main-menu')).toHaveCount(0);
  await expect(page.getByTestId('container-protocols')).toBeVisible();
});

test('под меню стрелки и Esc не трогают комнату (RV-90); лист над поиском — Esc закрывает только верхнее (2b-П1)', async ({
  page,
}) => {
  const room = page.locator('[data-view]').first();
  await expect(room).toHaveAttribute('data-view', 'desk');
  await page.getByTestId('menu-tab').click();
  await expect(page.getByTestId('menu-continue')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-continue')).toBeVisible();
  await page.getByTestId('menu-continue').click();
  await expect(room).toHaveAttribute('data-view', 'desk');
  // Лист над поиском: первый Esc — лист, второй — поиск.
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('845');
  await page.getByTestId('search-25').locator('.search-hit').first().click();
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
  await expect(page.getByTestId('search-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-panel')).toBeHidden();
});

test('Esc в поле поиска сначала снимает фокус, второй — закрывает поиск', async ({ page }) => {
  await page.getByTestId('search-tab').click();
  const input = page.getByTestId('search-input');
  await input.fill('845');
  await page.keyboard.press('Escape');
  await expect(input).not.toBeFocused();
  await expect(page.getByTestId('search-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-panel')).toBeHidden();
});
