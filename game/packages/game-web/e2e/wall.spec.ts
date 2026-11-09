import type { Page } from '@playwright/test';
import { expect, STRIP, savedPut, sheet, stripPoint, test, toWall } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await toWall(page);
});

/** Утащить вещь за полоску в точку экрана. */
async function dragTo(page: Page, id: string, to: { x: number; y: number }) {
  const p = await stripPoint(page, id);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function pinCenter(page: Page, id: string) {
  const b = await page.getByTestId(`pin-${id}`).boundingBox();
  if (!b) throw new Error(`нет кнопки ${id}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Нить кнопкой: потянуть от кнопки одной вещи к полоске другой. */
async function thread(page: Page, from: string, to: string) {
  const a = await pinCenter(page, from);
  const b = await stripPoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId(`thread-${from}-${to}`)).toHaveCount(1);
}

async function threadMiddle(page: Page, from: string, to: string) {
  const a = await pinCenter(page, from);
  const b = await pinCenter(page, to);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const PERSONS = [
  'Адам Коул',
  'Эмма Пирс',
  'Дэн Миллер',
  'Кейт Уолш',
  'Лея Моро',
  'Мика Сато',
  'Ник Харт',
  'Габриэль Силва',
  'Р. Хейл',
];

test('на стене все персонажи и все 51 материал; групп и подписей описи нет', async ({ page }) => {
  for (const name of PERSONS)
    await expect(page.locator('.paper-person', { hasText: name })).toHaveCount(1);
  await expect(page.locator('[data-wall-item]')).toHaveCount(51 + PERSONS.length);
  await expect(page.locator('.column-label')).toHaveCount(0);
});

test('щелчок по листу открывает его; по персонажу — ничего не открывает', async ({ page }) => {
  await sheet(page, '22').click(STRIP);
  await expect(page.getByTestId('viewer')).toContainText('Протокол осмотра');
  await page.keyboard.press('Escape');
  await sheet(page, 'p:cole').click(STRIP);
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('предметы со стола висят карточками с номером бирки; щелчок — взять в руки (ITEM-A, OPEN-A)', async ({
  page,
}) => {
  for (const id of ['24', '40', '47', '50']) {
    await expect(sheet(page, id)).toContainText(`Изъято · ${id}`);
  }
  await sheet(page, '47').click(STRIP);
  await expect(page.getByTestId('viewer')).toContainText('Ноутбук');
});

test('куда отпустили, там и висит: без «магнита» и без следов кнопок; после перезагрузки там же', async ({
  page,
}) => {
  const start = await sheet(page, '03').boundingBox();
  const saved = savedPut(page);
  // Совсем рядом с прежним местом — не притягивается обратно.
  await dragTo(page, '03', { x: (start?.x ?? 0) + 60, y: (start?.y ?? 0) + 80 });
  const box = await sheet(page, '03').boundingBox();
  expect(Math.abs((box?.x ?? 0) - (start?.x ?? 0) - 35)).toBeLessThan(15);
  await expect(page.locator('.pin-hole')).toHaveCount(0);
  await saved;
  await page.reload();
  const again = await sheet(page, '03').boundingBox();
  expect(Math.round(again?.x ?? 0)).toBe(Math.round(box?.x ?? 1));
});

test('щелчок сразу после перетаскивания не открывает лист', async ({ page }) => {
  await dragTo(page, '02', { x: 640, y: 640 });
  await page.mouse.click(640, 640);
  await page.waitForTimeout(200);
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('записка: взять чистую, написать, перенести, нить к персонажу; ✕ снимает, «Вернуть» возвращает', async ({
  page,
}) => {
  await page.getByTestId('new-note').click();
  await page.keyboard.type('Кто звонил в 23:10?');
  await page.mouse.click(1300, 120);
  const note = page.locator('.wall-card-note');
  await expect(note).toContainText('Кто звонил в 23:10?');
  const id = await note.getAttribute('data-wall-item');
  if (!id) throw new Error('нет записки');
  await thread(page, id, 'p:cole');
  await note.hover();
  await page.getByTestId(`delete-${id}`).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByTestId(`thread-${id}-p:cole`)).toHaveCount(0);
  await page.getByTestId('undo-toast').getByRole('button', { name: 'Вернуть' }).click();
  await expect(note).toContainText('Кто звонил в 23:10?');
  await expect(page.getByTestId(`thread-${id}-p:cole`)).toHaveCount(1);
});

test('ярлык — своя группа: текст правится щелчком, сохраняется после перезагрузки', async ({
  page,
}) => {
  await page.getByTestId('new-label').click();
  await page.keyboard.type('Медкабинет');
  await page.keyboard.press('Enter');
  const label = page.locator('.wall-card-label');
  await expect(label).toContainText('Медкабинет');
  await label.locator('button[data-kind]').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' — кто брал?');
  const saved = savedPut(page);
  await page.keyboard.press('Enter');
  await saved;
  await page.reload();
  await expect(page.locator('.wall-card-label')).toContainText('Медкабинет — кто брал?');
});

test('нить от кнопки к другой вещи; сохраняется', async ({ page }) => {
  const saved = savedPut(page);
  await thread(page, '05', 'p:pierce');
  await saved;
  await page.reload();
  await expect(page.getByTestId('thread-05-p:pierce')).toHaveCount(1);
});

test('нить, отпущенная мимо или на свою вещь, не появляется', async ({ page }) => {
  await page.mouse.wheel(0, 2000);
  const a = await pinCenter(page, '01');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(1340, 40, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-testid^="thread-01-"]')).toHaveCount(0);
});

test('нить двумя щелчками: кнопка, затем вещь (UX-J1); Esc отменяет', async ({ page }) => {
  await page.getByTestId('pin-02').click();
  await expect(page.getByTestId('thread-pulling')).toHaveCount(0);
  await page.mouse.move(700, 600);
  await expect(page.getByTestId('thread-pulling')).toHaveCount(1);
  const target = await stripPoint(page, '12');
  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId('thread-02-12')).toHaveCount(1);
  await expect(page.getByTestId('viewer')).toBeHidden();

  await page.getByTestId('pin-03').click();
  await page.keyboard.press('Escape');
  await page.mouse.move(700, 600);
  await expect(page.getByTestId('thread-pulling')).toHaveCount(0);
});

test('подпись — щелчок по нити; двойной щелчок удаляет, «Вернуть» возвращает с подписью', async ({
  page,
}) => {
  await thread(page, 'p:cole', 'p:hale');
  const mid = await threadMiddle(page, 'p:cole', 'p:hale');
  await page.mouse.click(mid.x, mid.y);
  const input = page.getByTestId('thread-label-input');
  await expect(input).toBeVisible();
  await input.fill('звонок?');
  await input.press('Enter');
  await expect(page.locator('.board-thread-label')).toHaveText('звонок?');

  await page.mouse.dblclick(mid.x + 40, mid.y);
  await expect(page.getByTestId('thread-p:cole-p:hale')).toHaveCount(0);
  await page.getByTestId('undo-toast').getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.locator('.board-thread-label')).toHaveText('звонок?');
});

test('колесо меняет масштаб; доску не увести за край', async ({ page }) => {
  const before = (await sheet(page, '01').boundingBox())?.width ?? 0;
  await page.mouse.move(683, 400);
  await page.mouse.wheel(0, -400);
  await expect
    .poll(async () => (await sheet(page, '01').boundingBox())?.width ?? 0)
    .toBeGreaterThan(before);
  await page.mouse.wheel(0, 3000);
  await page.mouse.move(683, 400);
  await page.mouse.down();
  await page.mouse.move(1300, 760, { steps: 6 });
  await page.mouse.up();
  // Середина экрана остаётся над пробкой.
  const cork = await page.locator('.canvas-surface').boundingBox();
  if (!cork) throw new Error('нет доски');
  expect(cork.x).toBeLessThanOrEqual(683);
  expect(cork.y).toBeLessThanOrEqual(384);
  expect(cork.x + cork.width).toBeGreaterThanOrEqual(683);
  expect(cork.y + cork.height).toBeGreaterThanOrEqual(384);
});

test('сервер не сохраняет → «Не сохранено»; следующее изменение сохраняет всё', async ({
  page,
}) => {
  await page.route('**/api/state', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 500 }) : route.continue(),
  );
  await dragTo(page, '02', { x: 300, y: 650 });
  await expect(page.getByTestId('save-error')).toBeVisible();
  const first = await sheet(page, '02').boundingBox();
  await page.unroute('**/api/state');
  const saved = savedPut(page);
  await dragTo(page, '05', { x: 900, y: 650 });
  await saved;
  await expect(page.getByTestId('save-error')).toBeHidden();
  await page.reload();
  expect(Math.round((await sheet(page, '02').boundingBox())?.x ?? 0)).toBe(
    Math.round(first?.x ?? 1),
  );
});

test('листы висят по типу: фото, диск, пакет вещдоков, персонаж различимы (UX-A1)', async ({
  page,
}) => {
  await expect(sheet(page, '39').locator('[data-kind]')).toHaveAttribute('data-kind', 'photos');
  await expect(sheet(page, '21').locator('[data-kind]')).toHaveAttribute('data-kind', 'disc');
  await expect(sheet(page, '41').locator('[data-kind]')).toHaveAttribute('data-kind', 'item');
  await expect(sheet(page, 'p:sato').locator('[data-kind]')).toHaveAttribute('data-kind', 'person');
});

test('чистую карточку можно перетащить на доску — записка появляется там, где отпустили', async ({
  page,
}) => {
  const blank = await page.getByTestId('new-note').boundingBox();
  if (!blank) throw new Error('нет карточки');
  await page.mouse.move(blank.x + 20, blank.y + 10);
  await page.mouse.down();
  await page.mouse.move(700, 500, { steps: 6 });
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await page.mouse.move(900, 450, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  await page.keyboard.type('Алиби Сато');
  await page.mouse.click(1300, 120);
  const note = page.locator('.wall-card-note');
  await expect(note).toContainText('Алиби Сато');
  const box = await note.boundingBox();
  // Кнопка записки — под курсором, где отпустили.
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 900)).toBeLessThan(30);
  expect(Math.abs((box?.y ?? 0) - 450)).toBeLessThan(30);
});

test('у записки — размер шрифта (A−, A+) и ширина ручкой справа; сохраняется', async ({ page }) => {
  await page.getByTestId('new-note').click();
  await page.keyboard.type('Крупно');
  await expect(page.getByTestId('font-size')).toHaveText('16');
  await page.getByTestId('font-up').click();
  await page.getByTestId('font-up').click();
  await expect(page.getByTestId('font-size')).toHaveText('20');
  // Правка не прервалась: текст можно дописать.
  await page.keyboard.type('!');
  await page.mouse.click(1300, 120);
  const note = page.locator('.wall-card-note');
  await expect(note.locator('.note-text')).toHaveCSS('font-size', '20px');
  await expect(note).toContainText('Крупно!');

  const before = await note.boundingBox();
  await note.hover();
  const handle = await note.locator('.wall-resize').boundingBox();
  if (!before || !handle) throw new Error('нет ручки');
  const saved = savedPut(page);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 100, handle.y + handle.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = await note.boundingBox();
  expect((after?.width ?? 0) - before.width).toBeGreaterThan(80);
  await saved;
  await page.reload();
  await expect(page.locator('.wall-card-note .note-text')).toHaveCSS('font-size', '20px');
  const reloaded = await page.locator('.wall-card-note').boundingBox();
  expect(Math.abs((reloaded?.width ?? 0) - (after?.width ?? 0))).toBeLessThan(3);
});
