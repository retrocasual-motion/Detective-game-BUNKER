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

test('лист чуть длиннее экрана — страницами, по центру (поля абзацев в счёт; CI, A-272)', async ({
  page,
}) => {
  // Как другой шрифт в CI: текст письма 01 становится чуть выше страницы.
  await page.addStyleTag({ content: '.viewer-flow p { line-height: 1.4 !important; }' });
  await sheet(page, '01').click(STRIP);
  await page.waitForTimeout(200);
  const box = await page.getByTestId('viewer-paper').boundingBox();
  if (!box) throw new Error('нет листа');
  expect(Math.abs(box.y + box.height / 2 - 768 / 2)).toBeLessThan(2);
  expect(box.y + box.height).toBeLessThanOrEqual(768);
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
  // Уголки: внизу слева — назад, внизу справа — вперёд; торчащая слева стопка — назад.
  await page.getByTestId('page-corner-prev').click();
  await expect(no).toHaveText(`${total - 2} / ${total}`);
  await page.getByTestId('page-corner').click();
  await expect(no).toHaveText(`${total - 1} / ${total}`);
  await page.getByTestId('page-prev').click();
  await expect(no).toHaveText(`${total - 2} / ${total}`);
});

test('угол листа листает не только по нарисованному уголку: рядом с ним и по торчащей под ним стопке; пустой низ листа строку не отмечает', async ({
  page,
}) => {
  await sheet(page, '07').click(STRIP);
  const no = page.getByTestId('page-no');
  const box = await page.getByTestId('viewer-paper').boundingBox();
  if (!box) throw new Error('нет листа');
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  await page.waitForTimeout(450); // щелчок сразу после открытия — второй щелчок двойного
  // Пустое поле внизу листа — не строка: ничего не отмечено, кнопки у выделения нет.
  await page.mouse.click(box.x + box.width / 2 - 80, bottom - 8);
  await expect(page.getByTestId('viewer')).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  await expect(page.locator('.to-petition')).toHaveCount(0);
  // Угол листа в 45 px от края — мимо нарисованного уголка (34 px), но вперёд.
  await page.mouse.click(right - 45, bottom - 45);
  await expect(no).toHaveText(/^2 \//);
  // Торчащий под углом край стопки (ниже и правее листа) — тоже вперёд, не «закрыть».
  await page.mouse.click(right + 12, bottom + 14);
  await expect(no).toHaveText(/^3 \//);
  await expect(page.getByTestId('viewer')).toBeVisible();
  // Слева внизу — так же назад.
  await page.mouse.click(box.x + 45, bottom - 45);
  await expect(no).toHaveText(/^2 \//);
  await page.mouse.click(box.x - 12, bottom + 14);
  await expect(no).toHaveText(/^1 \//);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
});

test.describe('живой лист (движение не уменьшено)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('системное «уменьшить движение» (Windows) игру не выключает — лист живой (RM-A)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sheet(page, '07').click(STRIP);
    const box = await page.getByTestId('viewer-paper').boundingBox();
    if (!box) throw new Error('нет листа');
    await page.mouse.move(box.x + box.width - 20, box.y + 20, { steps: 4 });
    await expect
      .poll(async () => (await page.getByTestId('viewer-flip').getAttribute('style')) ?? '')
      .toMatch(/rotateY\(-[1-9]/);
  });

  test('мышь внизу слева от листа — лист помнит, где она: наклон к ней, а не ровно', async ({
    page,
  }) => {
    await sheet(page, '07').click(STRIP);
    const vp = page.viewportSize();
    if (!vp) throw new Error('нет окна');
    await page.mouse.move(40, vp.height - 40, { steps: 6 });
    // Мышь внизу слева от листа — лист наклонён к ней (левый нижний край приподнят).
    await expect
      .poll(async () => (await page.getByTestId('viewer-flip').getAttribute('style')) ?? '')
      .toMatch(/rotateX\([1-9][\d.]*deg\) rotateY\([1-9]/);
  });

  test('лист «живой», как карточка: край под мышью приподнимается; лист не переворачивается; тянуть мимо — ничего, щелчок мимо — закрыть', async ({
    page,
  }) => {
    await sheet(page, '07').click(STRIP);
    const flip = page.getByTestId('viewer-flip');
    const box = await page.getByTestId('viewer-paper').boundingBox();
    if (!box) throw new Error('нет листа');
    // Мышь у правого верхнего угла листа — лист чуть наклоняется (до нескольких градусов).
    await page.mouse.move(box.x + box.width - 20, box.y + 20, { steps: 4 });
    const angles = async (): Promise<[number, number]> => {
      const style = (await flip.getAttribute('style')) ?? '';
      const [, rx, ry] = style.match(/rotateX\(([-\d.]+)deg\) rotateY\(([-\d.]+)deg\)/) ?? [];
      return [Number(rx), Number(ry)];
    };
    // Правый верхний угол под мышью приподнимается к игроку (не уезжает из-под неё).
    await expect.poll(async () => (await angles())[1]).toBeLessThan(-1);
    expect((await angles())[0]).toBeLessThan(0);
    const [rx, ry] = await angles();
    expect(Math.abs(rx)).toBeLessThanOrEqual(6);
    expect(Math.abs(ry)).toBeLessThanOrEqual(6);
    // Тянуть мимо листа — лист не вертится и не закрывается.
    await page.mouse.move(120, 300);
    await page.mouse.down();
    await page.mouse.move(470, 360, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId('viewer')).toBeVisible();
    await expect(page.getByTestId('viewer-back')).toHaveCount(0);
    // Щелчок сразу после открытия — второй щелчок двойного, не «закрыть» (OPEN_GUARD_MS).
    await page.waitForTimeout(450);
    await page.mouse.click(120, 300);
    await expect(page.getByTestId('viewer')).toBeHidden();
  });
});

test('колесо — ближе к точке под курсором: она остаётся под курсором; глубоко — крупный план от дела', async ({
  page,
}) => {
  await sheet(page, '43').click(STRIP);
  await page.getByTestId('bag-open').click();
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

test('правая кнопка — как было; зажатое колесо — сдвинуть приближённый лист (правка автора 10.11)', async ({
  page,
}) => {
  await sheet(page, '07').click(STRIP);
  const zoom = page.locator('.viewer-zoom');
  const box = await page.getByTestId('viewer-paper').boundingBox();
  if (!box) throw new Error('нет листа');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120);
  // Три шага колеса по 1,2 — масштаб 1,728.
  await expect.poll(() => zoom.getAttribute('style')).toContain('scale(1.728)');
  const before = await zoom.getAttribute('style');
  // Зажатое колесо — лист едет за мышью, масштаб тот же.
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 120, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  const after = await zoom.getAttribute('style');
  expect(after).not.toBe(before);
  expect(/scale\(([\d.]+)\)/.exec(after ?? '')?.[1]).toBe(
    /scale\(([\d.]+)\)/.exec(before ?? '')?.[1],
  );
  await expect(page.getByTestId('viewer')).toBeVisible();
  // Правая кнопка — как было: без приближения, лист открыт.
  await page.mouse.click(box.x + box.width / 2, box.y + 40, { button: 'right' });
  await expect.poll(() => zoom.getAttribute('style')).toContain('scale(1)');
  await expect(page.getByTestId('viewer')).toBeVisible();
});

test('OP-A: опись дела — галочка у строки того, что открывали; у неоткрытого — нет', async ({
  page,
}) => {
  await sheet(page, '02').click(STRIP);
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
  await pastOpenGuard(page);
  await sheet(page, '04').click(STRIP);
  await expect(page.getByTestId('viewer-paper')).toContainText('Опись материалов дела');
  await expect(page.locator('tr[data-inventory="02"]')).toHaveClass(/inventory-done/);
  // Сама опись открыта — тоже отмечена.
  await expect(page.locator('tr[data-inventory="04"]')).toHaveClass(/inventory-done/);
  await expect(page.locator('tr[data-inventory="03"]')).not.toHaveClass(/inventory-done/);
  // Строка из нескольких файлов — только когда открыты все.
  await expect(page.locator('tr[data-inventory="30,31,32,33,34,35,36"]')).not.toHaveClass(
    /inventory-done/,
  );
});
