import type { Page } from '@playwright/test';
import { expect, sheet, test } from './fixtures.ts';

/**
 * Компьютер следователя (этап 4c-3; решения автора 11.11 — CO-A, DI-A, TM-A; полицейский вид):
 * рабочее место бюро, «Экспорт сервера VL-31» — терминал с вкладками по мере открытого, браузер
 * с архивом номеров газеты. Файлы остаются на компьютере. Запросов нет (A-272).
 */

/** Открыть материалы служебной строкой движка (как в сквозном проходе пакета), затем перезагрузка. */
async function grant(page: Page, lines: string[]) {
  for (const line of lines) {
    const r = await page.request.post('/api/dev/action-line', { data: { line } });
    expect(r.ok(), line).toBe(true);
  }
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
}

/** Диск сервера (A-272): журналы, терминал технической, сеансы пользователя 05. */
const BUREAU = [
  'ОСМОТР | 52__конверт_прил_7_сервер.md | вставить диск в дисковод',
  'ПАРОЛЬ | сервер объекта: сеансы пользователей | 05',
];

async function pcUp(page: Page) {
  await page.getByTestId('computer-monitor').click();
  await expect(page.getByTestId('pc-desktop')).toBeVisible();
}

const icon = (page: Page, name: string) => page.getByTestId(`lap-icon-${name}`);

test('рабочее место бюро: значки, служебная полоса, часы; пусто, пока диска нет', async ({
  page,
}) => {
  await pcUp(page);
  await expect(page.getByTestId('computer')).toContainText('ОКРУЖНОЕ БЮРО РАССЛЕДОВАНИЙ');
  await expect(page.getByTestId('pc-clock')).toContainText(':');
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

test('диск сервера: журналы — в терминале, не на столе; терминал — документы, выделение щелчком', async ({
  page,
}) => {
  await grant(page, BUREAU);
  await expect(page.getByTestId('inbox-L214')).toHaveCount(0);
  await expect(sheet(page, 'L214')).toHaveCount(0);
  await pcUp(page);
  // Терминал: четыре документа (журнал, техническая, пользователь 05, копии), журнал — на ленте событий.
  await icon(page, 'Экспорт сервера VL-31').dblclick();
  const term = page.getByTestId('pc-terminal');
  await expect(term).toBeVisible();
  await expect(page.getByTestId('pc-term-F1')).toContainText('Журнал сервера 13.10');
  await expect(page.getByTestId('pc-term-F2')).toContainText('Отметки технической');
  await expect(page.getByTestId('pc-term-F3')).toContainText('Пользователь 05');
  await expect(page.getByTestId('pc-term-F4')).toContainText('Копии экспортов');
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
  await page.keyboard.press('F3');
  await expect(body).toHaveAttribute('data-material', 'L387');
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
