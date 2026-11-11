import type { Page } from '@playwright/test';
import { expect, savedPut, sheet, test, toWall } from './fixtures.ts';

// Новое дело, как у игрока: конверты архива опечатаны (A-260).
test.use({ sealed: true });

/** Взять конверт со стола, вскрыть, остаться у стола. */
async function openEnvelope(page: Page, id: string) {
  await page.getByTestId(`container-${id}`).click();
  await page.getByTestId('envelope-open').click();
  await page.getByTestId('envelope-stay').click();
  await expect(page.getByTestId('envelope-view')).toBeHidden();
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

test('«Вскрыть» — документы карточками, «всё на стене»; «Перейти к стене» — группа под названием; после перезагрузки так же', async ({
  page,
}) => {
  await page.getByTestId('container-protocols').click();
  const saved = savedPut(page);
  await page.getByTestId('envelope-open').click();
  await saved;
  await expect(page.getByTestId('envelope-opened')).toContainText('Протокол опроса · Н. Харт');
  await expect(page.getByTestId('envelope-done')).toContainText('«Протоколы опроса»');
  await page.getByTestId('envelope-to-wall').click();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'wall');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-moving', 'false');
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
  await expect(page.getByTestId('bags-box')).toHaveText('Личные вещи · 40–46');
  await toWall(page);
  await expect(sheet(page, '48')).toBeAttached();
  await expect(sheet(page, '45')).toBeAttached();
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
