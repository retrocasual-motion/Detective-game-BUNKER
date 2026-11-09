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

test('общий отказ адресата (PRE-B) — сразу в папке, письма нет, черновик остаётся', async ({
  page,
}) => {
  await page.route('**/api/petition', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ refused: 'Бюро: не исполнено.' }) }),
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
  await expect(page.getByTestId('petition-refusal')).toContainText('Бюро: не исполнено.');
  await expect(page.getByTestId('petition-refusal')).toContainText('Попытка засчитана');
  await expect(page.getByTestId('petition-stamp')).toHaveCount(0);
  await expect(page.getByTestId('petition-field-ask')).toContainText('36');
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
  // Над папкой — призрак листа поверх неё, поле под курсором подсвечено.
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await expect(page.getByTestId('petition-field-basis')).toHaveClass(/petition-field-target/);
  await expect(page.getByTestId('petition-field-ask')).toHaveClass(/petition-field-droppable/);
  await page.mouse.up();
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  await expect(page.getByTestId('petition-field-basis')).toContainText('39');
  expect(await sheet(page, '39').boundingBox()).toEqual(before);
});

test('карточку тянут в другое поле: в пустое — переходит, с занятым — меняются местами', async ({
  page,
}) => {
  const ask = page.getByTestId('petition-field-ask');
  const basis = page.getByTestId('petition-field-basis');
  const drag = async (from: typeof ask, to: typeof ask) => {
    const a = await from.getByTestId('petition-card').boundingBox();
    const b = await to.boundingBox();
    if (!a || !b) throw new Error('нет карточки или поля');
    await page.mouse.move(a.x + 20, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 200, b.y + b.height / 2, { steps: 8 });
    await expect(to).toHaveClass(/petition-field-target/);
    await page.mouse.up();
  };
  await toWall(page);
  await cardFrom(page, '25', 'ключ плоский металлический');
  await expect(ask).toContainText('ключ плоский');
  await drag(ask, basis);
  await expect(basis).toContainText('ключ плоский');
  await expect(ask.getByTestId('petition-card')).toHaveCount(0);
  await page.getByTestId('petition-field-ask').locator('.petition-line').click();
  await cardFrom(page, '45', 'Бумажник');
  await expect(ask).toContainText('Бумажник');
  await drag(basis, ask);
  await expect(ask).toContainText('ключ плоский');
  await expect(basis).toContainText('Бумажник');
});

test('черновики — стопкой папок: «+» — новая, язычки видны и закрытыми; выбросить и вернуть', async ({
  page,
}) => {
  const pick = async () => {
    await page.getByTestId('petition-field-to').locator('.petition-line').click();
    await page
      .getByTestId('address-book')
      .getByRole('button', { name: 'zapros@okrug-bureau.org' })
      .click();
  };
  await page.getByTestId('petition-corner').click();
  await pick();
  await page.getByTestId('petition-new').click();
  await expect(page.getByTestId('petition-corner-2')).toHaveText('Черновик 2');
  await expect(page.getByTestId('petition-field-to')).not.toContainText('@');
  const saved = savedPut(page);
  await pick();
  await saved;
  // Переключение — язычком: черновик в бланке, но папки не переставляются (правка автора 09.11).
  const at = async () =>
    Promise.all(
      ['petition-corner', 'petition-corner-2'].map((id) => page.getByTestId(id).boundingBox()),
    );
  const placed = await at();
  await page.getByTestId('petition-corner').click();
  await expect(page.getByTestId('petition-corner')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('petition-corner-2')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('petition-field-to')).toContainText('zapros@okrug-bureau.org');
  expect(await at()).toEqual(placed);
  await folder(page).getByRole('button', { name: 'Закрыть' }).click();
  // Закрытая — стопкой внизу слева: оба язычка на экране, задняя папка выше передней.
  const a = await page.getByTestId('petition-corner').boundingBox();
  const b = await page.getByTestId('petition-corner-2').boundingBox();
  await expect(page.getByTestId('petition-corner-2')).toBeInViewport();
  expect((b?.y ?? 0) < (a?.y ?? 0)).toBe(true);
  await page.reload();
  await expect(page.getByTestId('petition-corner-2')).toBeVisible();
  await page.getByTestId('petition-corner').click();
  await expect(page.getByTestId('petition-field-to')).toContainText('zapros@okrug-bureau.org');
  await page.getByTestId('petition-discard').click();
  await expect(folder(page)).toBeHidden();
  await page.getByTestId('petition-discarded').getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.getByTestId('petition-field-to')).toContainText('zapros@okrug-bureau.org');
});

/** Точка экрана посреди слова `word` в листе (по первой строке, где оно есть). */
async function wordPoint(page: Page, word: string, at = 0.5) {
  // Длинный лист — страницами (этап 4b): долистать стрелкой до страницы со словом.
  const where = () =>
    page.getByTestId('viewer-paper').evaluate((el, w) => {
      const flow = el.querySelector('.viewer-flow') as HTMLElement;
      const box = el.querySelector('.viewer-pages') as HTMLElement;
      const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent?.indexOf(w) ?? -1;
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + w.length);
        const b = r.getBoundingClientRect();
        const pr = box.getBoundingClientRect();
        return b.left < pr.left ? -1 : b.right > pr.right ? 1 : 0;
      }
      throw new Error(`нет слова: ${w}`);
    }, word);
  for (let k = 0; k < 20; k++) {
    const d = await where();
    if (d === 0) break;
    await page.keyboard.press(d > 0 ? 'ArrowRight' : 'ArrowLeft');
  }
  return page.getByTestId('viewer-paper').evaluate(
    (el, [w, k]) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent?.indexOf(w as string) ?? -1;
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + (w as string).length);
        const box = r.getBoundingClientRect();
        return { x: box.left + box.width * (k as number), y: box.top + box.height / 2 };
      }
      throw new Error(`нет слова: ${w}`);
    },
    [word, at] as const,
  );
}

test('выделение для ходатайства (SEL-C): щелчок — строка целиком, протяжка — целые слова', async ({
  page,
}) => {
  await toWall(page);
  await sheet(page, '25').click(STRIP);
  const selected = () => page.evaluate(() => window.getSelection()?.toString().trim() ?? '');
  // Щелчок посреди слова — вся строка, где оно стоит.
  const p = await wordPoint(page, 'DUPLICATE');
  await page.mouse.click(p.x, p.y);
  const line = await selected();
  expect(line).toContain('DO NOT DUPLICATE');
  expect(line.length).toBeGreaterThan('DO NOT DUPLICATE'.length + 10);
  await expect(page.getByTestId('to-petition')).toBeVisible();
  // Повторный щелчок по отмеченной строке снимает отметку.
  await page.mouse.click(p.x, p.y);
  await expect.poll(selected).toBe('');
  await expect(page.getByTestId('to-petition')).toHaveCount(0);
  // Протянули от середины слова до середины другого — выделены оба слова целиком.
  const a = await wordPoint(page, 'NOT DUPLICATE', 0.1);
  const b = await wordPoint(page, 'NOT DUPLICATE', 0.7);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(selected).toMatch(/^NOT DUPLICATE\S*$/);
  await page.getByTestId('to-petition').click();
  await expect(page.getByTestId('petition-field-to')).toBeVisible();
  await expect(page.getByTestId('petition-field-ask')).toContainText('NOT DUPLICATE');
});

test('закрытая папка не дрожит: приподнятый язычок не уходит из-под курсора', async ({ page }) => {
  const corner = page.getByTestId('petition-corner');
  const b = await corner.boundingBox();
  if (!b) throw new Error('нет уголка');
  // Самый низ видимого язычка у края экрана.
  const pt = { x: b.x + 40, y: Math.min(b.y + b.height, 768) - 2 };
  await page.mouse.move(pt.x, pt.y);
  await expect.poll(async () => (await corner.boundingBox())?.y).toBeLessThan(b.y);
  const under = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid'),
    pt,
  );
  expect(under).toBe('petition-corner');
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
