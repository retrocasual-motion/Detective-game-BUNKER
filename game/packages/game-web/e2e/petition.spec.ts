import type { Page } from '@playwright/test';
import { expect, STRIP, savedPut, sheet, stripPoint, test, toWall } from './fixtures.ts';

const folder = (page: Page) => page.getByTestId('petition-folder');

/** Выделить строку в открытом листе — как мышью (и отпустить кнопку на листе). */
async function selectText(page: Page, text: string) {
  await page.getByTestId('viewer-paper').evaluate((el, t) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent?.indexOf(t) ?? -1;
      if (i < 0) continue;
      n.parentElement?.scrollIntoView({ block: 'center' });
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + t.length);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return;
    }
    throw new Error(`нет текста: ${t}`);
  }, text);
}

/** Карточка из листа: открыть со стены, выделить строку, «В ходатайство», закрыть. */
async function cardFrom(page: Page, id: string, text: string) {
  await sheet(page, id).click(STRIP);
  await selectText(page, text);
  await page.getByTestId('to-petition').click();
  await page.keyboard.press('Escape');
}

test('уголок папки внизу слева на обоих видах', async ({ page }) => {
  for (const arrow of [null, 'nav-up', 'nav-down']) {
    if (arrow) await page.getByTestId(arrow).click();
    const box = await page.getByTestId('petition-corner').boundingBox();
    expect(box?.x ?? 9999).toBeLessThan(1366 / 3);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(740);
  }
});

test('папка — бланк: Кому, Прошу, На основании, номер дела; ✕ закрывает', async ({ page }) => {
  await expect(folder(page)).toBeHidden();
  await page.getByTestId('petition-corner').click();
  await expect(folder(page)).toBeVisible();
  const box = await folder(page).boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1366 / 2);
  await expect(folder(page)).toContainText('дело № 09-1128');
  for (const f of ['to', 'ask', 'basis']) {
    await expect(page.getByTestId(`petition-field-${f}`)).toBeVisible();
  }
  await folder(page).getByRole('button', { name: 'Закрыть' }).click();
  await expect(folder(page)).toBeHidden();
});

test('«Кому» — из адресной книги: в ней адреса из материалов дела', async ({ page }) => {
  await page.getByTestId('petition-corner').click();
  await page.getByTestId('petition-field-to').locator('.petition-line').click();
  const book = page.getByTestId('address-book');
  await expect(book).toContainText('zapros@okrug-bureau.org');
  await book.getByRole('button', { name: 'zapros@okrug-bureau.org' }).click();
  await expect(page.getByTestId('petition-field-to')).toContainText('zapros@okrug-bureau.org');
  await expect(book).toBeHidden();
});

test('пустые поля при отправке подсвечены, письмо не уходит (E-A)', async ({ page }) => {
  let sent = false;
  await page.route('**/api/petition', (r) => {
    sent = true;
    return r.continue();
  });
  await page.getByTestId('petition-corner').click();
  await page.getByTestId('petition-send').click();
  await expect(page.getByTestId('petition-error')).toContainText('Заполните');
  await expect(page.getByTestId('petition-field-ask')).toHaveClass(/petition-field-missing/);
  expect(sent).toBe(false);
});

test('ошибка оформления от адресата — в папке; папка не закрывается (FORM-B)', async ({ page }) => {
  await page.route('**/api/petition', (r) =>
    r.fulfill({ status: 422, body: JSON.stringify({ error: 'Бюро: укажите один код.' }) }),
  );
  await toWall(page);
  await page.getByTestId('petition-corner').click();
  await page.getByTestId('petition-field-to').locator('.petition-line').click();
  await page
    .getByTestId('address-book')
    .getByRole('button', { name: 'zapros@okrug-bureau.org' })
    .click();
  await cardFrom(page, '36', 'Протокол');
  await sheet(page, '35').click(STRIP);
  await page.getByTestId('viewer-whole-to-petition').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('petition-send').click();
  await expect(page.getByTestId('petition-error')).toHaveText('Бюро: укажите один код.');
  await expect(folder(page)).toBeVisible();
  await expect(page.getByTestId('petition-stamp')).toHaveCount(0);
});

test('собрать из карточек, отправить — штамп; ответ приходит письмом во «Входящие» (MAIL-B)', async ({
  page,
}) => {
  await toWall(page);
  await page.getByTestId('petition-corner').click();
  await page.getByTestId('petition-field-to').locator('.petition-line').click();
  await page
    .getByTestId('address-book')
    .getByRole('button', { name: 'zapros@okrug-bureau.org' })
    .click();
  await cardFrom(page, '25', 'ключ плоский металлический, штамп DO NOT DUPLICATE, номер 845');
  await expect(page.getByTestId('petition-field-ask')).toContainText('номер 845');
  await cardFrom(page, '45', 'Бумажник');
  await expect(page.getByTestId('petition-field-basis')).toContainText('Бумажник');
  await page.getByTestId('petition-send').click();
  await expect(page.getByTestId('petition-stamp')).toContainText('Отправлено · № 1');
  await expect(folder(page)).toBeHidden();
  await expect(page.getByTestId('petition-sent-note')).toContainText('во «Входящие» на столе');
  // Черновик ушёл вместе с письмом.
  await expect(page.getByTestId('petition-corner')).toHaveText('Ходатайство');
  // Письмо приходит через задержку (в автотестах — 1,5 с).
  await expect(page.getByTestId('arrival-note')).toContainText('M001', { timeout: 10_000 });
  await page.getByTestId('arrival-note').click();
  await page.getByTestId('inbox-M001').click();
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toContainText('Ответ на ходатайство № 1');
  await expect(viewer).toContainText('Прошу: 25');
});

test('лист со стены можно бросить в поле — карточка «материал целиком»; лист остаётся на стене', async ({
  page,
}) => {
  await toWall(page);
  await page.getByTestId('petition-corner').click();
  const before = await sheet(page, '39').boundingBox();
  const field = await page.getByTestId('petition-field-basis').boundingBox();
  if (!field) throw new Error('нет поля');
  const p = await stripPoint(page, '39');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(field.x + 100, field.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('petition-field-basis')).toContainText('39');
  expect(await sheet(page, '39').boundingBox()).toEqual(before);
});

test('черновики: закрытая папка хранит черновик, «+» — второй уголок; выбросить и вернуть', async ({
  page,
}) => {
  await page.getByTestId('petition-corner').click();
  await page.getByTestId('petition-field-to').locator('.petition-line').click();
  const saved = savedPut(page);
  await page
    .getByTestId('address-book')
    .getByRole('button', { name: 'zapros@okrug-bureau.org' })
    .click();
  await saved;
  await page.getByTestId('petition-new').click();
  await expect(page.getByTestId('petition-corner-2')).toHaveText('Черновик 2');
  await expect(page.getByTestId('petition-field-to')).not.toContainText('@');
  await page.getByTestId('petition-corner').click();
  await expect(page.getByTestId('petition-field-to')).toContainText('zapros@okrug-bureau.org');
  await page.reload();
  await page.getByTestId('petition-corner').click();
  await expect(page.getByTestId('petition-field-to')).toContainText('zapros@okrug-bureau.org');
  await page.getByTestId('petition-discard').click();
  await expect(folder(page)).toBeHidden();
  await page.getByTestId('petition-discarded').getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.getByTestId('petition-field-to')).toContainText('zapros@okrug-bureau.org');
});

test('открытая папка не мешает: лист открывается правее, стрелки работают', async ({ page }) => {
  await toWall(page);
  await page.getByTestId('petition-corner').click();
  await sheet(page, '36').click(STRIP);
  await expect(page.getByTestId('viewer')).toBeVisible();
  const f = await folder(page).boundingBox();
  const paper = await page.getByTestId('viewer-paper').boundingBox();
  expect(paper?.x ?? 0).toBeGreaterThanOrEqual((f?.x ?? 0) + (f?.width ?? 0));
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
  await expect(folder(page)).toBeVisible();
});

test('щелчок по уголку папки не сдвигает комнату', async ({ page }) => {
  const before = await page.getByTestId('scene').boundingBox();
  await page.getByTestId('petition-corner').click();
  expect(await page.getByTestId('scene').boundingBox()).toEqual(before);
});

test('открытая папка не закрывает стрелку «Стол»', async ({ page }) => {
  await toWall(page);
  await page.getByTestId('petition-corner').click();
  const box = await page.getByTestId('nav-down').boundingBox();
  if (!box) throw new Error('нет стрелки');
  const onTop = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
    { x: box.x + box.width - 4, y: box.y + box.height / 2 },
  );
  expect(onTop).toBe('nav-down');
});
