import type { Page } from '@playwright/test';
import { deskSettled, expect, START, savedPut, sheet, test, toWall } from './fixtures.ts';

// Новое дело, как у игрока: папки дела и пакет вещдоков на столе не открыты (A-260, FM-B).
test.use({ sealed: true });

type Pt = { x: number; y: number };
/** Что на 3D-столе, кроме стартовой стопки (ST-B) и описи на планшете (OPS-A). */
const pieces = async (page: Page) =>
  (
    await page.evaluate(() =>
      (
        (window as unknown as { __desk?: { pieces(): { id: string }[] } }).__desk?.pieces() ?? []
      ).map((q) => q.id),
    )
  ).filter((id) => !START.includes(id) && id !== '04');
const allPieces = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as { __desk?: { pieces(): { id: string }[] } }).__desk?.pieces() ?? []).map(
      (q) => q.id,
    ),
  );
const grab = (page: Page, id: string) =>
  page.evaluate(
    (i) => (window as unknown as { __desk: { grab(id: string): Pt | null } }).__desk.grab(i),
    id,
  );

/** Папка дела (FM-B; автор 25.11 — в руки, покрутить, открыть): листы стопкой на столе (DC-B). */
async function openFolder(page: Page, id: string) {
  const saved = savedPut(page);
  await page.getByTestId(`container-${id}`).click();
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /^Папка «/);
  await page.getByTestId('envelope-open').dispatchEvent('click');
  await saved;
  await expect(page.getByTestId(`container-${id}`)).toHaveCount(0);
  await expect(page.getByTestId('held')).toBeHidden();
}

/** Короб вещдоков или коробку — в руки и вскрыть: короб уходит из рук, коробка остаётся вскрытой. */
async function openSealed(page: Page, id: string) {
  // За верх: перед коробом может лежать стопка листов — щелчок в середину взял бы лист (took.ts).
  const box = await page.getByTestId(`container-${id}`).boundingBox();
  await page.mouse.click(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) * 0.15,
  );
  await page.getByTestId('envelope-open').dispatchEvent('click');
  if (id === 'seized') await expect(page.getByTestId('held')).toBeHidden();
  else {
    await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /» · вскрыт/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('held')).toBeHidden();
  }
}

/** Протянуть мышью по вещи в руках (вращать). */
async function drag(page: Page, dx: number, dy = 0) {
  await page.mouse.move(683, 384);
  await page.mouse.down();
  await page.mouse.move(683 + dx, 384 + dy, { steps: 10 });
  await page.mouse.up();
}

test('старт (ST-B): на стене только персонажи; на столе стопка 01–07, папки, короб вещдоков, коробка, газета; устройств нет', async ({
  page,
}) => {
  await expect(sheet(page, '07')).toHaveCount(0);
  await expect(sheet(page, '01')).toHaveCount(0);
  await expect
    .poll(async () => (await allPieces(page)).filter((id) => START.includes(id)).sort())
    .toEqual(START);
  await expect(sheet(page, '25')).toHaveCount(0);
  await expect(sheet(page, '15')).toHaveCount(0);
  for (const [id, label] of [
    ['protocols', 'Протоколы опроса'],
    ['scene', 'Осмотр места происшествия'],
    ['seized', 'Изъятое при осмотре места'],
    ['bunker', 'Документация объекта и программы'],
    ['personal', 'Личные вещи'],
  ] as const)
    await expect(page.getByTestId(`container-${id}`)).toHaveText(label);
  // На 3D-столе — только газета (автор 25.11).
  await expect.poll(() => pieces(page)).toEqual([]);
});

test('щелчок по папке — она в руках: протянуть — перевернуть; обложку открывают только спереди; Esc — положить, ничего не открыто', async ({
  page,
}) => {
  await page.getByTestId('container-protocols').click();
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('aria-label', 'Папка «Протоколы опроса»');
  await expect(held).toHaveAttribute('data-side', 'front');
  await expect(page.getByTestId('envelope-open')).toBeVisible();
  await drag(page, 260);
  await expect(held).toHaveAttribute('data-side', 'back');
  // Обложка — на лице: с оборота её не открыть.
  await expect(page.getByTestId('envelope-open')).toBeHidden();
  // Немного протянуть и отпустить — ложится обратно оборотом, не боком.
  await drag(page, 60);
  await expect(held).toHaveAttribute('data-side', 'back');
  // Правая кнопка — как было (лицом), вещь остаётся в руках (правка автора 10.11).
  await page.mouse.click(683, 384, { button: 'right' });
  await expect(held).toHaveAttribute('data-side', 'front');
  await expect(held).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(held).toBeHidden();
  await expect(page.getByTestId('container-protocols')).toBeVisible();
  await expect.poll(() => pieces(page)).toEqual([]);
});

test('RV-1: папку открывают щелчком в любом месте обложки — как конверт и пломбу', async ({
  page,
}) => {
  await page.getByTestId('container-scene').click();
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /^Папка «/);
  // Папка долетела до рук — щелчок по ней, а не мимо (мимо — положить).
  await page.waitForTimeout(600);
  const saved = savedPut(page);
  // Середина обложки, левее полосы, за которую тянут.
  await page.mouse.click(600, 384);
  await saved;
  await expect(page.getByTestId('held')).toBeHidden();
  await expect.poll(async () => (await pieces(page)).includes('22')).toBe(true);
});

/** Зажать в точке и протянуть настоящей мышью. */
async function pull(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  // Не дотянутый клапан ложится обратно не мгновенно — следующая протяжка после него, как у человека.
  await page.waitForTimeout(500);
}

test('OG-B: обложку папки тянут мышью — открыта; за обложку папка не крутится, не дотянули — закрыта; крышку коробки — так же', async ({
  page,
}) => {
  await page.getByTestId('container-protocols').click();
  const held = page.getByTestId('held');
  const sealed = 'Папка «Протоколы опроса»';
  await expect(held).toHaveAttribute('aria-label', sealed);
  const seal = await page.getByTestId('envelope-open').boundingBox();
  if (!seal) throw new Error('обложки не видно');
  // Точка на обложке.
  const x = seal.x + seal.width / 2;
  const y = seal.y + seal.height / 2 - 40;
  // Вбок за обложку: папка не повернулась, обложка не дотянута — легла обратно.
  await pull(page, x, y, 260, 0);
  await expect(held).toHaveAttribute('data-side', 'front');
  await expect(held).toHaveAttribute('aria-label', sealed);
  // Вверх чуть-чуть — тоже не вскрыт.
  await pull(page, x, y, 0, -40);
  await expect(held).toHaveAttribute('aria-label', sealed);
  // Дотянули — открыта: папка уходит из рук, листы — стопкой на столе (DC-B, FM-B).
  const saved = savedPut(page);
  await pull(page, x, y, 10, -220);
  await saved;
  await expect(held).toBeHidden();
  await expect.poll(async () => (await pieces(page)).includes('30')).toBe(true);

  // Коробка: тянут пломбу с крышкой вверх.
  await page.getByTestId('container-personal').click();
  await expect(held).toHaveAttribute('aria-label', 'Коробка «Личные вещи»');
  const tape = await page.getByTestId('envelope-open').boundingBox();
  if (!tape) throw new Error('пломбы не видно');
  await pull(page, tape.x + tape.width / 2, tape.y + tape.height / 2, 0, -220);
  await expect(held).toHaveAttribute('aria-label', /Коробка «Личные вещи» · вскрыт/);
});

test('папка — в руки и открыть, стопкой на стол (FM-B, DC-B): прочитали и закрыли — группа на стене светится; после перезагрузки так же', async ({
  page,
}) => {
  await openFolder(page, 'protocols');
  await expect.poll(async () => (await pieces(page)).length).toBe(7);
  await page.waitForTimeout(1200);
  await deskSettled(page);
  const top = await grab(page, '30');
  await page.mouse.click(top?.x ?? 0, top?.y ?? 0);
  await expect(page.getByTestId('viewer')).toContainText('Протокол опроса');
  await page.getByTestId('desk-next').click();
  await page.getByTestId('desk-next').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
  await toWall(page);
  for (const id of ['30', '31', '32']) await expect(sheet(page, id)).toBeVisible();
  await expect(sheet(page, '33')).toHaveCount(0);
  await expect(page.getByTestId('wall-n:archive-protocols')).toContainText('Протоколы опроса');
  // Всё, что пришло со стола, светится (правка автора 10.11) — пока не взялись за стену.
  for (const id of ['30', '31', '32'])
    await expect(sheet(page, id)).toHaveAttribute('data-found', 'true');
  await page.mouse.click(40, 700);
  await expect(sheet(page, '30')).not.toHaveAttribute('data-found', 'true');
  await page.reload();
  await expect(sheet(page, '30')).toBeAttached();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('container-protocols')).toHaveCount(0);
});

test('«Осмотр места» — листы; короб «Изъятое» — устройства на столе; коробка вскрывается', async ({
  page,
}) => {
  await openFolder(page, 'scene');
  await expect.poll(async () => (await pieces(page)).includes('25')).toBe(true);
  await expect.poll(async () => (await pieces(page)).includes('47')).toBe(false);
  await openSealed(page, 'seized');
  for (const id of ['24', '47', '48', '49', '50'])
    await expect.poll(async () => (await pieces(page)).includes(id)).toBe(true);
  await openSealed(page, 'personal');
  // Вскрытая коробка остаётся на столе открытой, пакеты — в ней, не на стене (BOX-B, автор 26.11).
  await expect(page.getByTestId('container-personal')).toHaveCount(1);
  await toWall(page);
  await expect(sheet(page, '45')).toHaveCount(0);
  // Устройства на стене не висят (DEVICES_ON_WALL).
  await expect(sheet(page, '48')).toHaveCount(0);
});

test('«Личные вещи» — семь пакетов (EB-A): пакет в руках, ярлык «чьи»; щелчок — опись листом, закрыли — пакет, положили — коробка; со стены — пакет в руки', async ({
  page,
}) => {
  await page.getByTestId('container-personal').click();
  await page.getByTestId('envelope-open').dispatchEvent('click');
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('aria-label', 'Коробка «Личные вещи» · вскрыта');
  for (let n = 40; n <= 46; n++) await expect(page.getByTestId(`unpack-${n}`)).toHaveCount(1);
  await expect(page.getByTestId('unpack-40')).toHaveAttribute('aria-label', /Взять пакет/);
  // Мышью — по ярлыку пакета: он поднимается и выходит из коробки.
  const tab = await page.getByTestId('unpack-40').boundingBox();
  if (!tab) throw new Error('нет ярлыка');
  // Сразу на ярлык (без пути над соседними пакетами — они приподнимаются при наведении).
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
  await page.waitForTimeout(400);
  await page.mouse.click(tab.x + tab.width / 2, tab.y + tab.height / 2);
  await expect(held).toHaveAttribute('aria-label', 'Пакет · Личные вещи Л. Моро');
  await page.getByTestId('bag-open').click();
  await expect(page.getByTestId('viewer')).toContainText('Блокнот для эскизов');
  await page.keyboard.press('Escape');
  await expect(held).toHaveAttribute('aria-label', 'Пакет · Личные вещи Л. Моро');
  await page.keyboard.press('Escape');
  await expect(held).toHaveAttribute('aria-label', 'Коробка «Личные вещи» · вскрыта');
  await page.keyboard.press('Escape');
  await expect(held).toBeHidden();
  // BOX-B: коробка лежит на столе открытой, пакеты — в ней; на стене их нет. Щелчок — снова в руках.
  await toWall(page);
  await expect(sheet(page, '42')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
  await page.getByTestId('container-personal').dispatchEvent('click');
  await expect(held).toHaveAttribute('aria-label', 'Коробка «Личные вещи» · вскрыта');
  await expect(page.getByTestId('unpack-42')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(held).toBeHidden();
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('поиск не видит неоткрытого; после открытия папки — находит', async ({ page }) => {
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('DO NOT DUPLICATE');
  await expect(page.getByTestId('search-count')).toHaveText(
    'В открытых материалах ничего не найдено.',
  );
  await page.getByTestId('search-panel').getByRole('button', { name: 'Закрыть поиск' }).click();
  await openFolder(page, 'scene');
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('DO NOT DUPLICATE');
  await expect(page.getByTestId('search-25')).toBeVisible();
});

test('газета — во «Входящих» (автор 26.11): бумажный номер; сайт газеты — закладки на компьютере', async ({
  page,
}) => {
  // Середина стола свободна: газета не на столе, а в лотке.
  await expect.poll(() => pieces(page)).toEqual([]);
  await expect(page.getByTestId('inbox-tray')).toHaveText('Входящие · 1');
  await page.getByTestId('inbox-15').click();
  await expect(page.getByTestId('viewer')).toContainText('номер от 16 ноября 2009');
  // Колонка «Помним» (A-262): Том — одна из трёх записей.
  await expect(page.getByTestId('viewer')).toContainText('Гарольд Финч');
  await expect(page.getByTestId('viewer')).toContainText('Вчера, 15 ноября, ему исполнилось бы 35');
  await page.keyboard.press('Escape');
  await page.getByTestId('computer-monitor').click();
  await page.getByTestId('lap-icon-Браузер').dblclick();
  await page.getByTestId('pc-fav-17').click();
  await expect(page.getByTestId('pc-web')).toContainText('Выпуск открывается по дате');
});

test('OPS-A: опись — на планшете на столе отдельно; прочитали — осталась на столе, на стене её нет', async ({
  page,
}) => {
  await expect.poll(async () => (await allPieces(page)).includes('04')).toBe(true);
  await deskSettled(page);
  await page.waitForTimeout(800);
  const at = await grab(page, '04');
  await page.mouse.click(at?.x ?? 0, at?.y ?? 0);
  await expect(page.getByTestId('viewer-paper')).toContainText('Опись материалов дела');
  // Читается одна, не вместе со стартовой стопкой.
  await expect(page.getByTestId('desk-next')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
  await page.waitForTimeout(600);
  expect(await allPieces(page)).toContain('04');
  await toWall(page);
  await expect(sheet(page, '04')).toHaveCount(0);
});
