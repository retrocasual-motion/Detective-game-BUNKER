import type { Page } from '@playwright/test';
import { expect, STRIP, sheet, test, toWall } from './fixtures.ts';

test.beforeEach(async ({ page }) => {
  await toWall(page);
});

const center = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`нет ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Защита от второго щелчка двойного клика — 400 мс после открытия. */
const pastOpenGuard = (page: Page) => page.waitForTimeout(450);

test('один щелчок по листу открывает материал, Esc закрывает', async ({ page }) => {
  await sheet(page, '01').click(STRIP);
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toContainText('Дело № 09-1128 — возобновление');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('лист — ровно по центру экрана: короткий, длинный и узкий документ', async ({ page }) => {
  const widths = new Set<number>();
  for (const id of ['01', '07', '25', '11']) {
    await sheet(page, id).click(STRIP);
    const box = await page.getByTestId('viewer-paper').boundingBox();
    if (!box) throw new Error(`нет листа ${id}`);
    expect(Math.abs(box.x + box.width / 2 - 1366 / 2), `${id}: по горизонтали`).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 768 / 2), `${id}: по вертикали`).toBeLessThan(2);
    expect(box.width, `${id}: ширина листа не зависит от текста`).toBeGreaterThan(600);
    widths.add(Math.round(box.width));
    await page.keyboard.press('Escape');
  }
  expect(widths.size, 'ширина одна у всех листов').toBe(1);
});

test('щелчок мимо листа закрывает просмотрщик', async ({ page }) => {
  await sheet(page, '01').click(STRIP);
  await pastOpenGuard(page);
  await page.mouse.click(20, 400);
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('крестик — у угла листа, закрывает', async ({ page }) => {
  await sheet(page, '01').click(STRIP);
  const close = page.getByTestId('viewer').getByRole('button', { name: 'Закрыть' });
  const paper = await page.getByTestId('viewer-paper').boundingBox();
  const btn = await close.boundingBox();
  expect((btn?.x ?? 0) - ((paper?.x ?? 0) + (paper?.width ?? 0))).toBeLessThan(40);
  expect((btn?.y ?? 0) - (paper?.y ?? 0)).toBeLessThan(40);
  await close.click();
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('двойной клик по листу открывает и не закрывает сразу', async ({ page }) => {
  await sheet(page, '02').dblclick(STRIP);
  await page.waitForTimeout(200);
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('выделение текста, законченное мимо листа, не закрывает', async ({ page }) => {
  await sheet(page, '01').click(STRIP);
  await pastOpenGuard(page);
  const p = await center(page, 'viewer-paper');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(20, p.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('Enter на листе в фокусе открывает материал', async ({ page }) => {
  await sheet(page, '04').getByRole('button', { name: /^04\./ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('длинный материал — страницами (PG-A): стрелка у края и ←/→ листают до конца', async ({
  page,
}) => {
  await sheet(page, '07').click(STRIP);
  const paper = page.getByTestId('viewer-paper');
  await expect(paper).toContainText('План объекта');
  const no = page.getByTestId('page-no');
  await expect(no).toHaveText(/^1 \/ \d+$/);
  const total = Number((await no.textContent())?.split('/')[1]);
  expect(total).toBeGreaterThan(1);
  await expect(page.getByTestId('page-prev')).toHaveCount(0);
  await page.getByTestId('page-next').click();
  await expect(no).toHaveText(`2 / ${total}`);
  for (let k = 2; k < total; k++) await page.keyboard.press('ArrowRight');
  await expect(no).toHaveText(`${total} / ${total}`);
  await expect(page.getByTestId('page-next')).toHaveCount(0);
  await expect(paper.getByText('служебная лестница и общая лестница')).toBeInViewport();
  await page.keyboard.press('ArrowLeft');
  await expect(no).toHaveText(`${total - 1} / ${total}`);
});

test('лист переворачивают, потянув за поле; на обороте — ответ дела или «Оборот чистый.»; средняя кнопка — лицом', async ({
  page,
}) => {
  await sheet(page, '03').click(STRIP);
  const flip = page.getByTestId('viewer-flip');
  await expect(flip).toHaveAttribute('data-side', 'front');
  const box = await page.getByTestId('viewer-paper').boundingBox();
  if (!box) throw new Error('нет листа');
  // Поле листа (не текст) — тянуть вбок.
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 8 + 340, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(flip).toHaveAttribute('data-side', 'back');
  await expect(page.getByTestId('viewer-back')).toHaveText('Оборот чистый.');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'middle' });
  await expect(flip).toHaveAttribute('data-side', 'front');
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('лист вертят и мимо него: зажал и тянешь — поворот, лист открыт; щелчок мимо — закрыть; уголок — следующая страница', async ({
  page,
}) => {
  await sheet(page, '07').click(STRIP);
  const flip = page.getByTestId('viewer-flip');
  // Мимо листа, слева: зажать и тянуть вправо и чуть вниз.
  await page.mouse.move(120, 300);
  await page.mouse.down();
  await page.mouse.move(470, 360, { steps: 12 });
  await page.mouse.up();
  await expect(flip).toHaveAttribute('data-side', 'back');
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.mouse.click(683, 384, { button: 'middle' });
  await expect(flip).toHaveAttribute('data-side', 'front');
  await expect(page.getByTestId('page-no')).toHaveText(/^1 \//);
  await page.getByTestId('page-corner').click();
  await expect(page.getByTestId('page-no')).toHaveText(/^2 \//);
  // Назад — уголок внизу слева (правка автора 09.11) и торчащая слева стопка.
  await page.getByTestId('page-corner-prev').click();
  await expect(page.getByTestId('page-no')).toHaveText(/^1 \//);
  await page.getByTestId('page-corner').click();
  await page.getByTestId('page-prev').click();
  await expect(page.getByTestId('page-no')).toHaveText(/^1 \//);
  // Щелчок сразу после открытия — второй щелчок двойного, не «закрыть» (OPEN_GUARD_MS).
  await page.waitForTimeout(450);
  await page.mouse.click(120, 300);
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('колесо — ближе к точке под курсором: она остаётся под курсором; глубоко — крупный план от дела', async ({
  page,
}) => {
  await sheet(page, '43').click(STRIP);
  const paper = page.getByTestId('viewer-paper');
  const word = paper.getByText(/Э. Пирс|Пирс/).first();
  const before = await word.boundingBox();
  if (!before) throw new Error('нет слова');
  const at = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => (await word.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width * 2);
  const after = await word.boundingBox();
  expect(Math.abs((after?.x ?? 0) + (after?.width ?? 0) / 2 - at.x)).toBeLessThan(12);
  await expect(page.getByTestId('viewer-closeup')).toBeVisible();
});

test('при открытом просмотрщике колесо не масштабирует стену', async ({ page }) => {
  const before = (await sheet(page, '01').boundingBox())?.width;
  await sheet(page, '01').click(STRIP);
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, -600);
  await page.keyboard.press('Escape');
  await page.mouse.move(1300, 700);
  expect((await sheet(page, '01').boundingBox())?.width).toBe(before);
});

test('стрелки при открытом просмотрщике не переключают вид', async ({ page }) => {
  await sheet(page, '01').click(STRIP);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
});

test('строки шапки письма не склеиваются: «Кому:» ниже «От:»', async ({ page }) => {
  await sheet(page, '01').click(STRIP);
  const paper = page.getByTestId('viewer-paper');
  const from = await paper.getByText('От:', { exact: true }).boundingBox();
  const to = await paper.getByText('Кому:', { exact: true }).boundingBox();
  expect(to?.y ?? 0).toBeGreaterThan((from?.y ?? 0) + 5);
});

/** Знаков в каждой строке абзацев листа — по прямоугольникам символов. */
const lineLengths = (page: Page) =>
  page.getByTestId('viewer-paper').evaluate((paper) => {
    const counts: number[] = [];
    for (const p of paper.querySelectorAll('p, li')) {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const tops = new Map<number, number>();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? '';
        for (let i = 0; i < text.length; i++) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          const rect = r.getBoundingClientRect();
          if (rect.width === 0) continue;
          const top = Math.round(rect.top / 4);
          tops.set(top, (tops.get(top) ?? 0) + 1);
        }
      }
      counts.push(...tops.values());
    }
    return counts;
  });

for (const vp of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`строка листа — не длиннее ~75 знаков при ${vp.width}×${vp.height} (UX-C1)`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    for (const id of ['03', '07']) {
      await sheet(page, id).click(STRIP);
      const lens = await lineLengths(page);
      expect(Math.max(...lens), id).toBeLessThanOrEqual(80);
      const full = lens.filter((n) => n > 40).sort((a, b) => a - b);
      expect(full[Math.floor(full.length / 2)] ?? 0, id).toBeGreaterThanOrEqual(55);
      await page.keyboard.press('Escape');
    }
  });
}

test('абзац не рвётся переносами из файла: строки склеены (UX-C1)', async ({ page }) => {
  await sheet(page, '03').click(STRIP);
  const p = page.getByTestId('viewer-paper').locator('p', { hasText: 'Следователь Б. Коннор' });
  await expect(p).toContainText('по факту гибели Адама Коула, руководителя программы');
  expect(await p.locator('br').count()).toBe(0);
  // Шапка документа — по строкам, как в файле.
  const head = page.getByTestId('viewer-paper').locator('p', { hasText: 'Дело № 09-1128' }).first();
  expect(await head.locator('br').count()).toBeGreaterThan(0);
});

test('крестик неподвижен у верхнего правого угла листа, куда бы ни ушла мышь (правка автора 09.11)', async ({
  page,
}) => {
  await sheet(page, '07').click(STRIP);
  const paper = await page.getByTestId('viewer-paper').boundingBox();
  if (!paper) throw new Error('нет листа');
  const close = page.getByTestId('viewer').getByRole('button', { name: 'Закрыть' });
  const top = await close.boundingBox();
  expect(Math.abs((top?.y ?? 0) - paper.y)).toBeLessThan(12);
  // Правее торчащей стопки страниц (этап 4b).
  expect((top?.x ?? 0) - (paper.x + paper.width)).toBeLessThan(56);
  await page.mouse.move(paper.x + paper.width / 2, paper.y + paper.height - 40, { steps: 4 });
  await page.waitForTimeout(250);
  expect(await close.boundingBox()).toEqual(top);
});
