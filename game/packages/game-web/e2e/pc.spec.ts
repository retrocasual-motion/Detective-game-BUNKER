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

test('«Поступления» — только письма; вложение — свой файл с замком; терминал — документы, выделение щелчком', async ({
  page,
}) => {
  await grant(page, BUREAU);
  await expect(page.getByTestId('inbox-L214')).toHaveCount(0);
  await expect(sheet(page, 'L214')).toHaveCount(0);
  await pcUp(page);
  await icon(page, 'Поступления').dblclick();
  await expect(page.getByTestId('pc-in-L452')).toContainText('Ответ Mailbridge');
  await expect(page.getByTestId('pc-in-L452')).toContainText('на рабочем столе');
  await expect(page.getByTestId('pc-in-L214')).toHaveCount(0);
  await expect(icon(page, 'mailbox_export_e.pierce.uk.mbx')).toBeVisible();
  await page.getByTestId('pc-in-L452').dblclick();
  await expect(page.getByTestId('pc-doc')).not.toContainText('Ввод:');
  // Терминал: три документа (журнал, пользователь 05, копии), журнал — на ленте событий.
  await icon(page, 'Экспорт сервера VL-31').dblclick();
  const term = page.getByTestId('pc-terminal');
  await expect(term).toBeVisible();
  await expect(page.getByTestId('pc-term-F1')).toContainText('Журнал сервера 13.10');
  await expect(page.getByTestId('pc-term-F2')).toContainText('Пользователь 05');
  await expect(page.getByTestId('pc-term-F3')).toContainText('Копии экспортов');
  await expect(page.getByTestId('pc-term-F4')).toHaveCount(0);
  await expect(page.getByTestId('pc-part-1')).toHaveAttribute('aria-pressed', 'true');
  const body = page.getByTestId('pc-term-body');
  await expect(body).toContainText('08:43:10');
  // Щелчок по коду — строки с ним ярче, прочие бледнеют, ничего не пропадает.
  const rows = await body.locator('tbody tr').count();
  await body.locator('td', { hasText: /^05$/ }).first().click();
  await expect(page.getByTestId('pc-mark')).toContainText('05');
  await expect(body.locator('tr.pc-row-on')).toHaveCount(6);
  await expect(body.locator('tbody tr')).toHaveCount(rows);
  await page.getByTestId('pc-part-2').click();
  await expect(body.locator('tr.pc-row-on').first()).toContainText('05');
  await page.getByTestId('pc-mark-clear').click();
  await expect(body.locator('tr.pc-row-off')).toHaveCount(0);
  await term.focus();
  await page.keyboard.press('F2');
  await expect(body).toHaveAttribute('data-material', 'L387');
});

test('экспорт ящика: неверный пароль — «Неверный пароль.»; «тоффи» — почта с письмами, замок снят', async ({
  page,
}) => {
  await grant(page, BUREAU);
  await pcUp(page);
  await icon(page, 'mailbox_export_e.pierce.uk.mbx').dblclick();
  const input = page.getByTestId('pc-password-input');
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill('Bobby');
  await page.getByTestId('pc-password-ok').click();
  await expect(page.getByTestId('pc-password-msg')).toHaveText('Неверный пароль.');
  await input.fill('тоффи');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pc-mail')).toBeVisible();
  await expect(page.getByTestId('pc-letter-10')).toBeVisible();
  await page.getByTestId('pc-letter-2').click();
  await expect(page.getByTestId('pc-mail-read')).toContainText('j.mercer@sentinel-labs.net');
  await expect(icon(page, 'mailbox_export_e.pierce.uk.mbx').locator('.lap-ico-mail')).toHaveCount(
    1,
  );
  await expect(page.getByTestId('inbox-L453')).toHaveCount(0);
});

test('пароль ящика: пять неверных — поле ждёт (LK-A)', async ({ page }) => {
  await grant(page, BUREAU);
  await pcUp(page);
  await icon(page, 'mailbox_export_e.pierce.uk.mbx').dblclick();
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
  await icon(page, 'VL-31_project_archive.enc').dblclick();
  await page.getByTestId('pc-password-input').fill('0417');
  await page.getByTestId('pc-password-ok').click();
  await expect(page.getByTestId('pc-archive')).toBeVisible();
  await page.getByTestId('pc-archive-L737').dblclick();
  await expect(page.getByTestId('pc-doc').last()).toHaveAttribute('data-material', 'L737');
  await expect(page.getByTestId('inbox-L737')).toHaveCount(0);
});

test('окна меняют размер за угол; не меньше 460×300; текст терминала не налезает', async ({
  page,
}) => {
  await grant(page, BUREAU);
  await pcUp(page);
  await icon(page, 'Экспорт сервера VL-31').dblclick();
  const win = page.getByTestId('lap-win-Экспорт сервера VL-31');
  const before = await win.boundingBox();
  const g = await win.getByTestId('lap-resize-se').boundingBox();
  if (!before || !g) throw new Error('нет окна');
  await page.mouse.move(g.x + 5, g.y + 5);
  await page.mouse.down();
  await page.mouse.move(g.x - 2000, g.y - 2000, { steps: 6 });
  await page.mouse.up();
  const small = await win.boundingBox();
  if (!small) throw new Error('нет окна');
  expect(small.width).toBeLessThan(before.width);
  // Минимум: 460×300 логических px экрана (на экране — с масштабом монитора).
  const scale = before.width / 1060;
  expect(small.width).toBeGreaterThan(455 * scale);
  expect(small.height).toBeGreaterThan(295 * scale);
  for (const k of [0, 1, 2, 3]) {
    await page.getByTestId(`pc-part-${k}`).click();
    const over = await page
      .getByTestId('pc-term-body')
      .evaluate(
        (root) =>
          [...root.querySelectorAll('td')].filter((c) => c.scrollWidth > c.clientWidth + 1).length,
      );
    expect(over).toBe(0);
  }
});
