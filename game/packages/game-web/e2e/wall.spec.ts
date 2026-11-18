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

test('конверты вскрыты: на стене все персонажи и 48 материалов (газета на столе, сайт — в закладках); групп описи нет', async ({
  page,
}) => {
  for (const name of PERSONS)
    await expect(page.locator('.paper-person', { hasText: name })).toHaveCount(1);
  await expect(page.locator('[data-wall-item]')).toHaveCount(48 + PERSONS.length);
  await expect(sheet(page, '15')).toHaveCount(0);
  await expect(page.locator('.column-label')).toHaveCount(0);
});

test('щелчок по листу открывает его; по персонажу — карточка крупно', async ({ page }) => {
  await sheet(page, '22').click(STRIP);
  await expect(page.getByTestId('viewer')).toContainText('Протокол осмотра');
  await page.keyboard.press('Escape');
  await sheet(page, 'p:cole').click(STRIP);
  await expect(page.getByTestId('viewer-paper')).toContainText('Адам Коул');
  await expect(page.getByTestId('viewer-paper')).toContainText('руководитель программы');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('предметы со стола висят карточками с номером бирки; щелчок — взять в руки (ITEM-A, OPEN-A)', async ({
  page,
}) => {
  for (const id of ['24', '40', '47', '50']) {
    await expect(sheet(page, id)).toContainText(`Изъято · ${id}`);
  }
  // Устройство — в руках (этап 4a); щелчок по экрану ноутбука — экран крупно (4c-1).
  await sheet(page, '47').click(STRIP);
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Ноутбук/);
  await page.getByTestId('device-use').click();
  await expect(page.getByTestId('laptop-view')).toBeVisible();
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
  await expect(page.getByTestId('font-size')).toHaveText('20');
  await page.getByTestId('font-up').click();
  await page.getByTestId('font-up').click();
  await expect(page.getByTestId('font-size')).toHaveText('24');
  // Правка не прервалась: текст можно дописать.
  await page.keyboard.type('!');
  await page.mouse.click(1300, 120);
  const note = page.locator('.wall-card-note');
  await expect(note.locator('.note-text')).toHaveCSS('font-size', '24px');
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
  await expect(page.locator('.wall-card-note .note-text')).toHaveCSS('font-size', '24px');
  const reloaded = await page.locator('.wall-card-note').boundingBox();
  expect(Math.abs((reloaded?.width ?? 0) - (after?.width ?? 0))).toBeLessThan(3);
});

// ── Выделить несколько и тащить вместе (MS-D, решение автора 10.11) ──

const box = async (page: Page, id: string) => {
  const b = await sheet(page, id).locator('.card').boundingBox();
  if (!b) throw new Error(`нет ${id}`);
  return b;
};

/** Рамка от левого верхнего угла a до правого нижнего угла b (с запасом в несколько px). */
async function frame(page: Page, a: string, b: string, button: 'right' | 'left' = 'right') {
  const p = await box(page, a);
  const q = await box(page, b);
  await page.mouse.move(p.x - 6, p.y - 6);
  await page.mouse.down({ button });
  await page.mouse.move(q.x + q.width + 4, q.y + q.height + 4, { steps: 6 });
  await expect(page.getByTestId('wall-marquee')).toBeVisible();
  await page.mouse.up({ button });
  await expect(page.getByTestId('wall-marquee')).toHaveCount(0);
}

const selectedIds = (page: Page) =>
  page
    .locator('[data-wall-item][data-selected]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-wall-item')).sort());

test('правая кнопка — рамка выделяет; потянуть одну выделенную — едут все, нити за ними; после перезагрузки там же', async ({
  page,
}) => {
  await expect(page.getByTestId('wall-hint')).toContainText('Правая кнопка');
  await thread(page, '01', '05');
  await frame(page, '01', '03');
  expect(await selectedIds(page)).toEqual(['01', '02', '03']);
  // Меню браузера по правой кнопке на стене нет.
  const prevented = await page.evaluate(() => {
    const el = document.querySelector('.wall .canvas');
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    el?.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);

  const before = await Promise.all(['01', '02', '03', '04'].map((id) => box(page, id)));
  const line = page.getByTestId('thread-01-05');
  const lineBefore = await line.getAttribute('x1');
  const p = await stripPoint(page, '02');
  const saved = savedPut(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 320, { steps: 8 });
  await page.mouse.up();
  await saved;
  // Мышь — с листа: лист под курсором растёт (W8-A), а меряем место.
  await page.mouse.move(5, 400);
  const after = await Promise.all(['01', '02', '03', '04'].map((id) => box(page, id)));
  for (const k of [0, 1, 2]) {
    expect(after[k]?.x).toBeCloseTo((before[k]?.x ?? 0) + 60, -1);
    expect(after[k]?.y).toBeCloseTo((before[k]?.y ?? 0) + 320, -1);
  }
  // Невыделенная — на месте; нить ушла за выделенной 01.
  expect(after[3]?.x).toBeCloseTo(before[3]?.x ?? 0, 0);
  expect(await line.getAttribute('x1')).not.toBe(lineBefore);
  // Выделение остаётся — можно тащить дальше; после перезагрузки вещи там же, выделения нет.
  expect(await selectedIds(page)).toEqual(['01', '02', '03']);
  await page.reload();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
  const reloaded = await box(page, '02');
  expect(reloaded.x).toBeCloseTo(after[1]?.x ?? 0, -1);
  expect(await selectedIds(page)).toEqual([]);
});

test('правый щелчок по вещи — добавить или убрать; Esc и щелчок по пустой пробке снимают выделение', async ({
  page,
}) => {
  const a = await stripPoint(page, '01');
  const b = await stripPoint(page, '04');
  await page.mouse.click(a.x, a.y, { button: 'right' });
  await page.mouse.click(b.x, b.y, { button: 'right' });
  expect(await selectedIds(page)).toEqual(['01', '04']);
  await page.mouse.click(a.x, a.y, { button: 'right' });
  expect(await selectedIds(page)).toEqual(['04']);
  // Правый щелчок не открывает лист.
  await expect(page.getByTestId('viewer')).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await selectedIds(page)).toEqual([]);
  await page.mouse.click(b.x, b.y, { button: 'right' });
  expect(await selectedIds(page)).toEqual(['04']);
  // Пустая пробка — правее всего дела.
  await page.mouse.click(1250, 600);
  expect(await selectedIds(page)).toEqual([]);
});

test('тачпад: Shift + протяжка левой — та же рамка; Shift + щелчок по вещи — добавить, лист не открывается', async ({
  page,
}) => {
  await page.keyboard.down('Shift');
  await frame(page, '01', '02', 'left');
  const c = await stripPoint(page, '05');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.up('Shift');
  expect(await selectedIds(page)).toEqual(['01', '02', '05']);
  await expect(page.getByTestId('viewer')).toHaveCount(0);
  // Протяжка без Shift по пустой пробке — двигает доску, как раньше (выделение не теряется).
  await page.mouse.wheel(0, -600);
  const world = page.locator('.wall .canvas-world');
  const cam = await world.getAttribute('style');
  await page.mouse.move(1250, 600);
  await page.mouse.down();
  await page.mouse.move(1150, 560, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => world.getAttribute('style')).not.toBe(cam);
  expect(await selectedIds(page)).toEqual(['01', '02', '05']);
});
