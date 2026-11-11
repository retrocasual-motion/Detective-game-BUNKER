import type { Page } from '@playwright/test';
import { expect, sheet, test } from './fixtures.ts';

/**
 * Компьютер следователя (этап 4c-3; решения автора 11.11 — CO-A, DI-A, TM-A; полицейский вид):
 * рабочее место бюро, «Поступления» — вложения ответов, «Экспорт сервера VL-31» — терминал с
 * вкладками по мере ответов, браузер с архивом номеров газеты. Файлы остаются на компьютере.
 */

/** Ответы бюро — служебной строкой движка (как в сквозном проходе пакета), затем перезагрузка. */
async function grant(page: Page, lines: string[]) {
  for (const line of lines) {
    const r = await page.request.post('/api/dev/action-line', { data: { line } });
    expect(r.ok(), line).toBe(true);
  }
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
}

const BUREAU = [
  'ХОДАТАЙСТВО | zapros@okrug-bureau.org | прошу: 20, «вызов переведён на голосовую почту» ; основание: 20, «приложение № 7»',
  'ХОДАТАЙСТВО | zapros@okrug-bureau.org | прошу: 04, «Материалы сеансов пользователей служебного узла» ; основание: L214, «сеанс пользователя 05 — просмотр и экспорт»',
  'АДРЕС | браузер | mailbridge.net',
  'ХОДАТАЙСТВО | lawful-requests@mailbridge.net | прошу: L249, «Запросы органов» ; основание: L387, «e.pierce.uk@mailbridge.net»',
];

async function pcUp(page: Page) {
  await page.getByTestId('computer-monitor').click();
  await expect(page.getByTestId('pc-desktop')).toBeVisible();
}

const icon = (page: Page, name: string) => page.getByTestId(`lap-icon-${name}`);

test('рабочее место бюро: значки, служебная полоса, часы; пусто, пока бюро не ответило', async ({
  page,
}) => {
  await pcUp(page);
  await expect(page.getByTestId('computer')).toContainText('ОКРУЖНОЕ БЮРО РАССЛЕДОВАНИЙ');
  await expect(page.getByTestId('pc-clock')).toContainText(':');
  await icon(page, 'Поступления').dblclick();
  await expect(page.getByTestId('pc-incoming-empty')).toBeVisible();
  await icon(page, 'Экспорт сервера VL-31').dblclick();
  await expect(page.getByTestId('pc-terminal-empty')).toContainText('НЕТ ДАННЫХ');
  // Стрелки при открытом компьютере не переключают вид; Esc и щелчок мимо — отойти.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('computer')).toHaveCount(0);
  await pcUp(page);
  // Окна на месте после выхода (сохранение).
  await expect(page.getByTestId('pc-terminal')).toBeVisible();
  await page.getByTestId('computer-close').click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('computer')).toHaveCount(0);
});

test('ответы бюро — в «Поступлениях»; терминал — вкладки по F-клавишам; на стене и во «Входящих» их нет', async ({
  page,
}) => {
  await grant(page, BUREAU);
  await expect(page.getByTestId('inbox-L214')).toHaveCount(0);
  await expect(sheet(page, 'L214')).toHaveCount(0);
  await pcUp(page);
  await icon(page, 'Поступления').dblclick();
  for (const id of ['L452', 'mbx', 'L214', 'L387', 'L388'])
    await expect(page.getByTestId(`pc-in-${id}`)).toBeVisible();
  await page.getByTestId('pc-in-L214').dblclick();
  const term = page.getByTestId('pc-terminal');
  await expect(term).toBeVisible();
  await expect(page.getByTestId('pc-term-F1')).toContainText('Приложение № 7');
  await expect(page.getByTestId('pc-term-body')).toHaveAttribute('data-material', 'L214');
  // L214 — семь вкладок, затем L387 и копии экспортов.
  await expect(page.getByTestId('pc-term-F8')).toContainText('Материалы сеансов');
  await page.getByTestId('pc-term-F2').click();
  await expect(page.getByTestId('pc-term-body')).toContainText('F2');
  await term.focus();
  await page.keyboard.press('F8');
  await expect(page.getByTestId('pc-term-body')).toHaveAttribute('data-material', 'L387');
});

test('экспорт ящика: неверный пароль — «Неверный пароль.»; «тоффи» — почта с письмами', async ({
  page,
}) => {
  await grant(page, BUREAU);
  await pcUp(page);
  await icon(page, 'Поступления').dblclick();
  await page.getByTestId('pc-in-mbx').dblclick();
  const input = page.getByTestId('pc-password-input');
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill('Bobby');
  await page.getByTestId('pc-password-ok').click();
  await expect(page.getByTestId('pc-password-msg')).toHaveText('Неверный пароль.');
  await input.fill('тоффи');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pc-mail')).toBeVisible();
  await expect(page.getByTestId('pc-letter-11')).toBeVisible();
  await page.getByTestId('pc-letter-2').click();
  await expect(page.getByTestId('pc-mail-read')).toContainText('j.mercer@sentinel-labs.net');
  await expect(page.getByTestId('inbox-L453')).toHaveCount(0);
});

test('пароль ящика: пять неверных — поле ждёт (LK-A)', async ({ page }) => {
  await grant(page, BUREAU);
  await pcUp(page);
  await icon(page, 'Поступления').dblclick();
  await page.getByTestId('pc-in-mbx').dblclick();
  const msg = page.getByTestId('pc-password-msg');
  for (let k = 0; k < 5; k++) {
    await page.getByTestId('pc-password-input').fill(`нет${k}`);
    await page.getByTestId('pc-password-ok').click();
    await expect(msg).not.toHaveText('');
  }
  await expect(msg).toContainText('Поле не принимает значение. Повторите через 1:5');
  await expect(page.getByTestId('pc-password-input')).toBeDisabled();
});

test('браузер: архив номеров — дата выпуска; неоцифрованная дата — отказ', async ({ page }) => {
  await pcUp(page);
  await icon(page, 'Браузер').dblclick();
  await expect(page.getByTestId('pc-web')).toContainText('Выпуск открывается по дате');
  await page.getByTestId('pc-news-date').fill('12.12.1987');
  await page.getByTestId('pc-news-open').click();
  await expect(page.getByTestId('pc-news-msg')).toHaveText('Выпуск за эту дату не оцифрован.');
  await page.getByTestId('pc-news-date').fill('14-10-2009');
  await page.getByTestId('pc-news-open').click();
  await expect(page.getByTestId('pc-issue')).toContainText('14.10.2009');
  await expect(page.getByTestId('pc-web')).toHaveAttribute('data-material', 'L833');
  // Выпуск — на компьютере, не на стене.
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'L833')).toHaveCount(0);
});

test('из поиска — компьютер открыт на нужном месте', async ({ page }) => {
  await grant(page, BUREAU);
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('сеансов пользователя 05');
  await page.getByTestId('search-L387').locator('.search-hit').first().click();
  await expect(page.getByTestId('pc-terminal')).toBeVisible();
  await expect(page.getByTestId('pc-term-body')).toHaveAttribute('data-material', 'L387');
});

test('архив проекта: пароль 0417 — три документа; документ — окном на компьютере', async ({
  page,
}) => {
  await grant(page, [
    'АДРЕС | браузер | vaultline-program.com',
    'ОСМОТР | 29__бумаги_из_помещений (пачка П-02, слой картона сбоку) | вытащить картон',
    'ХОДАТАЙСТВО | documents@vaultline-program.com | прошу: L991, «Выбыл досрочно. Опись — архив проекта» ; основание: 26, «бланк VAULTLINE № VL-31»',
  ]);
  await pcUp(page);
  await icon(page, 'Поступления').dblclick();
  await page.getByTestId('pc-in-L735').dblclick();
  await expect(page.getByTestId('pc-doc')).toHaveAttribute('data-material', 'L735');
  await icon(page, 'Поступления').dblclick();
  await page.getByTestId('pc-in-enc').dblclick();
  await page.getByTestId('pc-password-input').fill('0417');
  await page.getByTestId('pc-password-ok').click();
  await expect(page.getByTestId('pc-archive')).toBeVisible();
  await page.getByTestId('pc-archive-L737').dblclick();
  await expect(page.getByTestId('pc-doc').last()).toHaveAttribute('data-material', 'L737');
  await expect(page.getByTestId('inbox-L737')).toHaveCount(0);
});
