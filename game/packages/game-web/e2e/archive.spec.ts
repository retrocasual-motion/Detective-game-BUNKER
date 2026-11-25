import type { Page } from '@playwright/test';
import { expect, savedPut, sheet, test, toWall } from './fixtures.ts';

// Новое дело, как у игрока: конверты архива опечатаны (A-260).
test.use({ sealed: true });

/** Взять конверт со стола, вскрыть (в руках — вскрытый, OP-D), положить. */
async function openEnvelope(page: Page, id: string) {
  await page.getByTestId(`container-${id}`).click();
  await page.getByTestId('envelope-open').dispatchEvent('click');
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /» · вскрыт/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toBeHidden();
}

/** Протянуть мышью по вещи в руках (вращать). */
async function drag(page: Page, dx: number, dy = 0) {
  await page.mouse.move(683, 384);
  await page.mouse.down();
  await page.mouse.move(683 + dx, 384 + dy, { steps: 10 });
  await page.mouse.up();
}

test('старт: на стене персонажи и 01–07; на столе конверты, коробка, газета; устройств нет', async ({
  page,
}) => {
  await expect(sheet(page, '07')).toBeAttached();
  await expect(sheet(page, '25')).toHaveCount(0);
  await expect(sheet(page, '15')).toHaveCount(0);
  for (const [id, label] of [
    ['protocols', 'Протоколы опроса'],
    ['scene', 'Осмотр места происшествия и изъятое'],
    ['bunker', 'Документация объекта и программы'],
    ['personal', 'Личные вещи'],
  ] as const)
    await expect(page.getByTestId(`container-${id}`)).toHaveText(label);
  await expect(page.getByTestId('device-47')).toHaveCount(0);
  await expect(page.getByTestId('newspaper')).toBeVisible();
});

test('щелчок по конверту — он в руках: протянуть — перевернуть; печать видна только спереди; Esc — положить, ничего не вскрыто', async ({
  page,
}) => {
  await page.getByTestId('container-protocols').click();
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('aria-label', 'Конверт «Протоколы опроса»');
  await expect(held).toHaveAttribute('data-side', 'front');
  await expect(page.getByTestId('envelope-open')).toBeVisible();
  await drag(page, 260);
  await expect(held).toHaveAttribute('data-side', 'back');
  // Печать — на лице: с оборота её не нажать.
  await expect(page.getByTestId('envelope-open')).toBeHidden();
  // Немного протянуть и отпустить — лист ложится обратно оборотом, не боком.
  await drag(page, 60);
  await expect(held).toHaveAttribute('data-side', 'back');
  // Правая кнопка — как было (лицом), вещь остаётся в руках (правка автора 10.11).
  await page.mouse.click(683, 384, { button: 'right' });
  await expect(held).toHaveAttribute('data-side', 'front');
  await expect(held).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(held).toBeHidden();
  await expect(page.getByTestId('container-protocols')).toBeVisible();
  await toWall(page);
  await expect(sheet(page, '30')).toHaveCount(0);
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

test('OG-B: клапан тянут мышью — вскрыт; за клапан конверт не крутится, не дотянули — цел; крышку коробки — так же', async ({
  page,
}) => {
  await page.getByTestId('container-protocols').click();
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('aria-label', 'Конверт «Протоколы опроса»');
  const seal = await page.getByTestId('envelope-open').boundingBox();
  if (!seal) throw new Error('печати не видно');
  // Точка на клапане — над печатью.
  const x = seal.x + seal.width / 2;
  const y = seal.y + seal.height / 2 - 40;
  // Вбок за клапан: конверт не повернулся, клапан не дотянут — лёг обратно.
  await pull(page, x, y, 260, 0);
  await expect(held).toHaveAttribute('data-side', 'front');
  await expect(held).toHaveAttribute('aria-label', 'Конверт «Протоколы опроса»');
  // Вверх чуть-чуть — тоже не вскрыт.
  await pull(page, x, y, 0, -40);
  await expect(held).toHaveAttribute('aria-label', 'Конверт «Протоколы опроса»');
  // Дотянули — вскрыт.
  const saved = savedPut(page);
  await pull(page, x, y, 10, -220);
  await saved;
  await expect(held).toHaveAttribute('aria-label', 'Конверт «Протоколы опроса» · вскрыт');
  await page.keyboard.press('Escape');
  await expect(held).toBeHidden();

  // Коробка: тянут пломбу с крышкой вверх.
  await page.getByTestId('container-personal').click();
  await expect(held).toHaveAttribute('aria-label', 'Коробка «Личные вещи»');
  const tape = await page.getByTestId('envelope-open').boundingBox();
  if (!tape) throw new Error('пломбы не видно');
  await pull(page, tape.x + tape.width / 2, tape.y + tape.height / 2, 0, -220);
  await expect(held).toHaveAttribute('aria-label', /Коробка «Личные вещи» · вскрыт/);
});

test('«Вскрыть» — вскрытый конверт в руках, содержимое на ребре (OP-D): вынуть лист — читать, закрыть — снова конверт; положить — группа на стене; после перезагрузки так же', async ({
  page,
}) => {
  await page.getByTestId('container-protocols').click();
  const saved = savedPut(page);
  await page.getByTestId('envelope-open').dispatchEvent('click');
  await saved;
  const held = page.getByTestId('held');
  await expect(held).toHaveAttribute('aria-label', 'Конверт «Протоколы опроса» · вскрыт');
  // Окна со списком и выбора «стол или стена» больше нет.
  await expect(page.getByTestId('envelope-view')).toHaveCount(0);
  for (const id of ['30', '33', '36'])
    await expect(page.getByTestId(`unpack-${id}`)).toHaveCount(1);
  // Ярлыки тесные: мышь берёт саму вещь (как конверты в коробе 29), кнопка — клавиатуре и тестам.
  await page.getByTestId('unpack-33').dispatchEvent('click');
  await expect(page.getByTestId('viewer')).toContainText('Сато');
  await expect(held).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer')).toBeHidden();
  await expect(held).toHaveAttribute('aria-label', 'Конверт «Протоколы опроса» · вскрыт');
  await page.keyboard.press('Escape');
  await expect(held).toBeHidden();
  await expect(page.getByTestId('container-protocols')).toHaveCount(0);
  await toWall(page);
  for (const id of ['30', '33', '36']) await expect(sheet(page, id)).toBeVisible();
  await expect(page.getByTestId('wall-n:archive-protocols')).toContainText('Протоколы опроса');
  // Всё, что пришло из конверта, светится (правка автора 10.11) — пока не взялись за стену.
  for (const id of ['30', '33', '36'])
    await expect(sheet(page, id)).toHaveAttribute('data-found', 'true');
  await page.mouse.click(40, 700);
  await expect(sheet(page, '30')).not.toHaveAttribute('data-found', 'true');
  await page.reload();
  await expect(sheet(page, '30')).toBeAttached();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('container-protocols')).toHaveCount(0);
});

test('«Осмотр места происшествия и изъятое» приносит на стол устройства; коробка вскрывается', async ({
  page,
}) => {
  await openEnvelope(page, 'scene');
  await expect(page.getByTestId('device-47')).toBeVisible();
  await expect(page.getByTestId('device-50')).toBeVisible();
  await openEnvelope(page, 'personal');
  // Вскрытая коробка уходит со стола (R.4, автор 21.11).
  await expect(page.getByTestId('container-personal')).toHaveCount(0);
  await toWall(page);
  await expect(sheet(page, '48')).toBeAttached();
  await expect(sheet(page, '45')).toBeAttached();
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
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2, { steps: 4 });
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
  await toWall(page);
  await expect(sheet(page, '42')).toBeVisible();
  await sheet(page, '42').click();
  await expect(held).toHaveAttribute('aria-label', 'Пакет · Личные вещи Н. Харта');
  await page.keyboard.press('Escape');
  await expect(held).toBeHidden();
  await expect(page.getByTestId('viewer')).toBeHidden();
});

test('поиск не видит невскрытого; после вскрытия — находит', async ({ page }) => {
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('DO NOT DUPLICATE');
  await expect(page.getByTestId('search-count')).toHaveText(
    'В открытых материалах ничего не найдено.',
  );
  await page.getByTestId('search-panel').getByRole('button', { name: 'Закрыть поиск' }).click();
  await openEnvelope(page, 'scene');
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('DO NOT DUPLICATE');
  await expect(page.getByTestId('search-25')).toBeVisible();
});

test('газета на столе — бумажный номер; сайт газеты — закладки на компьютере', async ({ page }) => {
  await page.getByTestId('newspaper').click();
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
