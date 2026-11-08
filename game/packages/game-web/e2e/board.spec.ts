import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** Прикрепить материал со стола: щелчок — просмотрщик — «Прикрепить к доске» — Esc. */
async function pin(page: Page, cardId: string) {
  await page.getByTestId(`card-${cardId}`).click();
  await page.getByTestId('viewer').getByRole('button', { name: 'Прикрепить к доске' }).click();
  await page.keyboard.press('Escape');
}

const items = (page: Page) => page.locator('[data-testid^="board-item-"]');
const threads = (page: Page) =>
  page.locator('[data-testid^="board-thread-"]:not([data-testid$="pulling"])');
const itemId = async (page: Page, n: number) =>
  (await items(page).nth(n).getAttribute('data-board-item')) ?? '';

const center = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`нет ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Потянуть нить от булавки копии a к копии b (или в точку). */
async function pull(page: Page, a: string, to: { x: number; y: number }) {
  const p = await center(page, `board-pin-${a}`);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function twoOnBoard(page: Page) {
  await pin(page, '01');
  await pin(page, '03');
  await page.getByTestId('nav-right').click();
  await expect(items(page)).toHaveCount(2);
  return [await itemId(page, 0), await itemId(page, 1)] as const;
}

async function connected(page: Page) {
  const [a, b] = await twoOnBoard(page);
  await pull(page, a, await center(page, `board-item-${b}`));
  await expect(threads(page)).toHaveCount(1);
  return [a, b] as const;
}

test('копии на доске, материал остаётся на столе', async ({ page }) => {
  await twoOnBoard(page);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(46);
  await expect(items(page).nth(0)).toContainText('Входящее письмо');
});

test('нить тянется от булавки к другой копии', async ({ page }) => {
  await connected(page);
});

test('нить можно отпустить на булавку копии, у которой уже есть нить', async ({ page }) => {
  const [a, b] = await connected(page);
  await page.getByTestId('nav-left').click();
  await pin(page, '05');
  await page.getByTestId('nav-right').click();
  await expect(items(page)).toHaveCount(3);
  const ids = await items(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-board-item')),
  );
  const c = ids.find((id) => id !== a && id !== b) ?? '';
  // Отпускаем ровно на булавку b — там кончается нить a→b.
  await pull(page, c, await center(page, `board-pin-${b}`));
  await expect(threads(page)).toHaveCount(2);
});

test('двойной щелчок по подписи открывает правку, а не удаляет нить', async ({ page }) => {
  await connected(page);
  await threads(page).first().click({ force: true });
  await page.getByTestId('thread-label-input').fill('дата');
  await page.getByTestId('thread-label-input').press('Enter');
  await page.getByTestId('view-right').getByText('дата').dblclick();
  await expect(page.getByTestId('thread-label-input')).toBeVisible();
  await expect(threads(page)).toHaveCount(1);
});

test('нить, отпущенная мимо копии или на свою копию, не появляется', async ({ page }) => {
  const [a] = await twoOnBoard(page);
  await pull(page, a, { x: 900, y: 600 });
  await pull(page, a, await center(page, `board-item-${a}`));
  await expect(threads(page)).toHaveCount(0);
});

test('пока тянут нить, за курсором идёт пунктир', async ({ page }) => {
  const [a] = await twoOnBoard(page);
  const p = await center(page, `board-pin-${a}`);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 200, p.y + 200, { steps: 4 });
  await expect(page.getByTestId('board-thread-pulling')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('board-thread-pulling')).toHaveCount(0);
});

test('нить идёт за копией во время перетаскивания, а не после', async ({ page }) => {
  const [, b] = await connected(page);
  const line = threads(page).first();
  const x2 = () => line.evaluate((el) => Number(el.getAttribute('x2')));
  const before = await x2();
  const c = await center(page, `board-item-${b}`);
  await page.mouse.move(c.x, c.y + 40);
  await page.mouse.down();
  await page.mouse.move(c.x + 150, c.y + 140, { steps: 6 });
  expect(await x2()).toBeCloseTo(before + 150, 0);
  await page.mouse.up();
});

test('щелчок по копии открывает материал', async ({ page }) => {
  const [a] = await twoOnBoard(page);
  await page.getByTestId(`board-item-${a}`).click();
  await expect(page.getByTestId('viewer')).toContainText('Входящее письмо');
});

test('подпись — щелчок по нити; сохраняется после перезагрузки', async ({ page }) => {
  await connected(page);
  await threads(page).first().click({ force: true });
  const label = page.getByTestId('thread-label-input');
  await label.fill('одна дата');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/state') && r.request().method() === 'PUT',
  );
  await label.press('Enter');
  await expect(page.getByTestId('view-right')).toContainText('одна дата');
  await saved;
  await page.reload();
  await expect(threads(page)).toHaveCount(1);
  await expect(page.getByTestId('view-right')).toContainText('одна дата');
});

test('двойной щелчок по нити удаляет её; «Вернуть» возвращает с подписью', async ({ page }) => {
  await connected(page);
  await threads(page).first().click({ force: true });
  await page.getByTestId('thread-label-input').fill('одна дата');
  await page.getByTestId('thread-label-input').press('Enter');

  await threads(page).first().dblclick({ force: true });
  await expect(threads(page)).toHaveCount(0);
  await expect(page.getByTestId('thread-label-input')).toBeHidden();
  await page.getByTestId('undo-toast').getByRole('button', { name: 'Вернуть' }).click();
  await expect(threads(page)).toHaveCount(1);
  await expect(page.getByTestId('view-right')).toContainText('одна дата');
});

test('✕ снимает копию вместе с её нитями; «Вернуть» возвращает обе', async ({ page }) => {
  const [a] = await connected(page);
  await page.getByTestId(`board-item-${a}`).hover();
  await page.getByTestId(`board-remove-${a}`).click();
  await expect(items(page)).toHaveCount(1);
  await expect(threads(page)).toHaveCount(0);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(46);
  await page.getByTestId('undo-toast').getByRole('button', { name: 'Вернуть' }).click();
  await expect(items(page)).toHaveCount(2);
  await expect(threads(page)).toHaveCount(1);
});

test('нить и её подпись не закрыты карточками', async ({ page }) => {
  await connected(page);
  await threads(page).first().click({ force: true });
  await page.getByTestId('thread-label-input').fill('одна дата');
  await page.getByTestId('thread-label-input').press('Enter');
  const label = page.getByTestId('view-right').getByText('одна дата');
  const box = await label.boundingBox();
  if (!box) throw new Error('нет подписи');
  const topmost = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.textContent ?? '',
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmost).toBe('одна дата');
});

test('Escape отменяет подпись нити', async ({ page }) => {
  await connected(page);
  await threads(page).first().click({ force: true });
  await page.getByTestId('thread-label-input').fill('неверно');
  await page.getByTestId('thread-label-input').press('Escape');
  await expect(page.getByTestId('thread-label-input')).toBeHidden();
  await expect(page.getByTestId('view-right')).not.toContainText('неверно');
});

test('нить двумя щелчками: булавка, затем копия — без удержания кнопки (UX-J1)', async ({
  page,
}) => {
  const [a, b] = await twoOnBoard(page);
  await page.getByTestId(`board-pin-${a}`).click();
  const target = await center(page, `board-item-${b}`);
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await expect(page.getByTestId('board-thread-pulling')).toBeVisible();
  await page.mouse.click(target.x, target.y);
  await expect(threads(page)).toHaveCount(1);
  // Щелчок, который привязал нить, не открыл копию.
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('нить двумя щелчками отменяется щелчком мимо и Esc', async ({ page }) => {
  const [a] = await twoOnBoard(page);
  await page.getByTestId(`board-pin-${a}`).click();
  await page.mouse.click(900, 600);
  await expect(page.getByTestId('board-thread-pulling')).toHaveCount(0);
  await page.getByTestId(`board-pin-${a}`).click();
  await page.mouse.move(900, 600, { steps: 3 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('board-thread-pulling')).toHaveCount(0);
  await expect(threads(page)).toHaveCount(0);
});
