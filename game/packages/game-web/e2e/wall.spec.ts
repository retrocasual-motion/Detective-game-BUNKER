import type { Page } from '@playwright/test';
import { expect, STRIP, savedPut, sheet, stripPoint, test, toWall } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await toWall(page);
});

/** Утащить лист за полоску в точку экрана. */
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

/** Нить кнопкой: потянуть от кнопки одного листа к полоске другого. */
async function thread(page: Page, from: string, to: string) {
  const a = await pinCenter(page, from);
  const b = await stripPoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId(`thread-${from}-${to}`)).toHaveCount(1);
}

/** Середина нити — между кнопками. */
async function threadMiddle(page: Page, from: string, to: string) {
  const a = await pinCenter(page, from);
  const b = await pinCenter(page, to);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const FIELD = { x: 640, y: 640 };

test('колонки «как пришло» по описи: 9 колонок, все 51 материал висят в колонках', async ({
  page,
}) => {
  await expect(page.getByTestId('column-s1')).toHaveText('Опись № 1–5');
  await expect(page.locator('.column-label')).toHaveCount(9);
  await expect(page.locator('[data-wall-item][data-place="column"]')).toHaveCount(51);
});

test('лесенка: шапка каждого листа видна, щелчок по ней открывает лист', async ({ page }) => {
  await sheet(page, '22').click(STRIP);
  await expect(page.getByTestId('viewer')).toContainText('Протокол осмотра');
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

test('лист из колонки переезжает в поле, на месте — след кнопки; после перезагрузки там же', async ({
  page,
}) => {
  const saved = savedPut(page);
  await dragTo(page, '03', FIELD);
  await expect(sheet(page, '03')).toHaveAttribute('data-place', 'field');
  await expect(page.getByTestId('hole-03')).toBeVisible();
  const box = await sheet(page, '03').boundingBox();
  await saved;
  await page.reload();
  await expect(sheet(page, '03')).toHaveAttribute('data-place', 'field');
  const again = await sheet(page, '03').boundingBox();
  expect(Math.round(again?.x ?? 0)).toBe(Math.round(box?.x ?? 1));
});

test('«↩» возвращает лист в колонку; отпущенный у своей колонки — тоже', async ({ page }) => {
  await dragTo(page, '03', FIELD);
  await sheet(page, '03').hover();
  await page.getByTestId('return-03').click();
  await expect(sheet(page, '03')).toHaveAttribute('data-place', 'column');
  await expect(page.getByTestId('hole-03')).toHaveCount(0);

  await dragTo(page, '31', FIELD);
  await expect(sheet(page, '31')).toHaveAttribute('data-place', 'field');
  const col = await page.getByTestId('column-s30').boundingBox();
  if (!col) throw new Error('нет колонки');
  await dragTo(page, '31', { x: col.x + 30, y: col.y + 120 });
  await expect(sheet(page, '31')).toHaveAttribute('data-place', 'column');
});

test('щелчок сразу после перетаскивания не открывает лист', async ({ page }) => {
  await dragTo(page, '02', FIELD);
  await page.mouse.click(FIELD.x, FIELD.y);
  await page.waitForTimeout(200);
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('нить от кнопки к другому листу — между колонками и полем; сохраняется', async ({ page }) => {
  await dragTo(page, '05', FIELD);
  const saved = savedPut(page);
  await thread(page, '05', '47');
  await saved;
  await page.reload();
  await expect(page.getByTestId('thread-05-47')).toHaveCount(1);
});

test('нить, отпущенная мимо листа или на свой лист, не появляется', async ({ page }) => {
  const a = await pinCenter(page, '01');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(FIELD.x, FIELD.y + 80, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-testid^="thread-01-"]')).toHaveCount(0);
});

test('нить двумя щелчками: кнопка, затем лист (UX-J1); Esc отменяет', async ({ page }) => {
  await page.getByTestId('pin-02').click();
  await expect(page.getByTestId('thread-pulling')).toHaveCount(0);
  await page.mouse.move(FIELD.x, FIELD.y);
  await expect(page.getByTestId('thread-pulling')).toHaveCount(1);
  const target = await stripPoint(page, '12');
  await page.mouse.click(target.x, target.y);
  await expect(page.getByTestId('thread-02-12')).toHaveCount(1);
  await expect(page.getByTestId('viewer')).toBeHidden();

  await page.getByTestId('pin-03').click();
  await page.keyboard.press('Escape');
  await page.mouse.move(FIELD.x, FIELD.y);
  await expect(page.getByTestId('thread-pulling')).toHaveCount(0);
});

test('подпись — щелчок по нити; двойной щелчок удаляет, «Вернуть» возвращает с подписью', async ({
  page,
}) => {
  await dragTo(page, '05', { x: 300, y: 650 });
  await dragTo(page, '12', { x: 900, y: 650 });
  await thread(page, '05', '12');
  const mid = await threadMiddle(page, '05', '12');
  await page.mouse.click(mid.x, mid.y);
  const input = page.getByTestId('thread-label-input');
  await expect(input).toBeVisible();
  await input.fill('кто подписал?');
  await input.press('Enter');
  await expect(page.locator('.board-thread-label')).toHaveText('кто подписал?');

  await page.mouse.dblclick(mid.x + 40, mid.y);
  await expect(page.getByTestId('thread-05-12')).toHaveCount(0);
  await page.getByTestId('undo-toast').getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.locator('.board-thread-label')).toHaveText('кто подписал?');
});

test('колесо меняет масштаб; стену не увести за край доски', async ({ page }) => {
  const before = (await sheet(page, '01').boundingBox())?.width ?? 0;
  await page.mouse.move(683, 400);
  await page.mouse.wheel(0, -400);
  await expect
    .poll(async () => (await sheet(page, '01').boundingBox())?.width ?? 0)
    .toBeGreaterThan(before);
  // Отдалить сильно и утащить — пробка всё равно закрывает экран.
  await page.mouse.wheel(0, 3000);
  await page.mouse.move(683, 400);
  await page.mouse.down();
  await page.mouse.move(1300, 760, { steps: 6 });
  await page.mouse.up();
  // Середина экрана остаётся над пробкой: доску не увести за край.
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
  await page.unroute('**/api/state');
  const saved = savedPut(page);
  await dragTo(page, '05', { x: 900, y: 650 });
  await saved;
  await expect(page.getByTestId('save-error')).toBeHidden();
  await page.reload();
  await expect(sheet(page, '02')).toHaveAttribute('data-place', 'field');
  await expect(sheet(page, '05')).toHaveAttribute('data-place', 'field');
});

test('листы висят по типу: фото, диск, пакет вещдоков различимы (UX-A1)', async ({ page }) => {
  await expect(sheet(page, '39').locator('[data-kind]')).toHaveAttribute('data-kind', 'photos');
  await expect(sheet(page, '21').locator('[data-kind]')).toHaveAttribute('data-kind', 'disc');
  await expect(sheet(page, '41').locator('[data-kind]')).toHaveAttribute('data-kind', 'item');
});
