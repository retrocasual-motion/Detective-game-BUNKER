import type { Page } from '@playwright/test';
import { expect, sheet, test } from './fixtures.ts';

/**
 * Компьютер следователя (этап 4c-3; решения автора 11.11 — CO-A, DI-A; полицейский вид) и диск
 * сервера (A-272, AC-2; автор 19.11): конверт 52 на столе → «Вскрыть конверт» → диск в руках →
 * диск отложили — он на столе → зажать и дотащить до дисковода под монитором (DD-A) → лоток,
 * раскрутка на столе → «Сервер объекта VL-31» на рабочем столе.
 * Браузер — архив номеров газеты. Файлы остаются на компьютере.
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

/** Диск вставлен (A-272): журналы, терминал технической. */
const DISC = ['ОСМОТР | 52__конверт_прил_7_сервер.md | вставить диск в дисковод'];
const SERVER = 'Сервер объекта VL-31';

async function pcUp(page: Page) {
  await page.getByTestId('computer-monitor').click();
  await expect(page.getByTestId('pc-desktop')).toBeVisible();
}

const icon = (page: Page, name: string) => page.getByTestId(`lap-icon-${name}`);

test('рабочее место бюро: служебная полоса, часы; без диска — только браузер; экран — без дисковода', async ({
  page,
}) => {
  await pcUp(page);
  await expect(page.getByTestId('computer')).toContainText('ОКРУЖНОЕ БЮРО РАССЛЕДОВАНИЙ');
  await expect(page.getByTestId('pc-clock')).toContainText(':');
  await expect(icon(page, 'Браузер')).toBeVisible();
  await expect(icon(page, SERVER)).toHaveCount(0);
  // Стрелки при открытом компьютере не переключают вид; Esc и щелчок мимо — отойти.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-view', 'desk');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('computer')).toHaveCount(0);
  await pcUp(page);
  await page.getByTestId('computer-close').click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('computer')).toHaveCount(0);
});

test('диск сервера: конверт → вскрыть → диск на столе → дотащить до дисковода → компьютер с программой (DD-A)', async ({
  page,
}) => {
  const envelope = page.getByTestId('server-disc');
  await expect(envelope).toBeVisible();
  await expect(sheet(page, '52')).toHaveCount(0);
  await envelope.click();
  await expect(page.getByTestId('held')).toBeVisible();
  await page.getByTestId('disc-envelope-open').click();
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Диск/);
  // Кнопки «Вставить» нет: диск отложили — он на столе.
  await expect(page.getByTestId('disc-insert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('held')).toHaveCount(0);
  const disc = page.getByTestId('server-disc-out');
  await expect(disc).toBeVisible();
  // Щелчок без сдвига — снова в руки.
  await disc.click();
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Диск/);
  await page.keyboard.press('Escape');
  // Отпустили мимо дисковода — ничего.
  const d = await disc.boundingBox();
  const drive = await page.getByTestId('disc-drive').boundingBox();
  if (!d || !drive) throw new Error('нет диска или дисковода');
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(700, 300, { steps: 8 });
  await page.mouse.up();
  await expect(disc).toBeVisible();
  // Дотащили до дисковода — вставка на столе, потом компьютер с новым значком.
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(drive.x + drive.width / 2, drive.y + drive.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(disc).toHaveCount(0);
  await expect(page.getByTestId('computer')).toBeVisible({ timeout: 6000 });
  await expect(icon(page, SERVER)).toBeVisible();
  // Журналы — в программе, не на столе и не на стене.
  await expect(page.getByTestId('inbox-L214')).toHaveCount(0);
  await expect(sheet(page, 'L214')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // После перезагрузки — так же: диск в компьютере.
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
  await expect(page.getByTestId('server-disc')).toHaveCount(0);
  await expect(page.getByTestId('server-disc-out')).toHaveCount(0);
  await pcUp(page);
  await expect(icon(page, SERVER)).toBeVisible();
});

test('диск в руках — щелчок по дисководу за ним вставляет диск (UX-3: путь без удержания)', async ({
  page,
}) => {
  await page.getByTestId('server-disc').click();
  await page.getByTestId('disc-envelope-open').click();
  await page.keyboard.press('Escape');
  const disc = page.getByTestId('server-disc-out');
  // Вынутый диск не мигает «новым» (UX-8).
  await expect(disc).not.toHaveClass(/desk-spot-fresh/);
  await disc.click();
  await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /Диск/);
  await page.getByTestId('held-drive').click();
  await expect(page.getByTestId('held')).toHaveCount(0);
  await expect(disc).toHaveCount(0);
  await pcUp(page);
  await expect(icon(page, SERVER)).toBeVisible();
});

test('клавиатура у монитора — тоже компьютер (UX-10)', async ({ page }) => {
  await page.getByTestId('computer-keyboard').click();
  await expect(page.getByTestId('computer')).toBeVisible();
});

test('вынутый диск после перезагрузки — на столе, не в конверте', async ({ page }) => {
  await page.getByTestId('server-disc').click();
  await page.getByTestId('disc-envelope-open').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('server-disc-out')).toBeVisible();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId('server-disc-out')).toBeVisible();
  await expect(page.getByTestId('server-disc')).toHaveCount(0);
});

test('программа сервера: журнал с фильтрами, узел связи, терминал технической', async ({
  page,
}) => {
  await grant(page, DISC);
  await pcUp(page);
  await icon(page, SERVER).dblclick();
  const srv = page.getByTestId('srv');
  await expect(srv).toContainText('Время — часы сервера объекта. Только чтение.');
  const log = page.getByTestId('srv-log');
  await expect(log).toContainText('08:43:10');
  const all = await log.locator('tbody tr').count();
  await page.getByTestId('srv-filter-account').selectOption('05');
  const fives = await log.locator('tbody tr').count();
  expect(fives).toBeGreaterThan(0);
  expect(fives).toBeLessThan(all);
  for (const cell of await log.locator('tbody tr td:nth-child(3)').allTextContents())
    expect(cell).toContain('05');
  await page.getByTestId('srv-filter-clear').click();
  // Щелчок по терминалу в строке — фильтр по нему.
  await log
    .locator('td', { hasText: /^узел связи$/ })
    .first()
    .locator('.srv-pick')
    .click();
  await expect(page.getByTestId('srv-filter-terminal')).toHaveValue('узел связи');
  await page.getByTestId('srv-menu-node').click();
  await expect(page.getByTestId('srv-page')).toContainText('Внешние отправки');
  await page.getByTestId('srv-menu-tech').click();
  await expect(page.getByTestId('srv-page')).toContainText('панель насосной');
});

test('сеансы пользователей: код 07 — нет; 02 — без файлов; 05 — сеанс и папка «Экспорты»', async ({
  page,
}) => {
  await grant(page, DISC);
  await pcUp(page);
  await icon(page, SERVER).dblclick();
  await page.getByTestId('srv-menu-sessions').click();
  const code = page.getByTestId('srv-code');
  const msg = page.getByTestId('srv-msg');
  await code.fill('07');
  await page.getByTestId('srv-code-open').click();
  await expect(msg).toHaveText('Такого кода нет.');
  await code.fill('02');
  await page.getByTestId('srv-code-open').click();
  await expect(msg).toContainText('Сохранённых файлов');
  await code.fill('05');
  await page.getByTestId('srv-code-open').click();
  await expect(page.getByTestId('srv-session')).toContainText('координатор программы');
  await page.getByTestId('srv-file-L389').click();
  await expect(page.getByTestId('srv-export')).toHaveAttribute('data-material', 'L389');
  await expect(sheet(page, 'L387')).toHaveCount(0);
});

test('код сеанса: три неверных подряд — поле ждёт (AC-5)', async ({ page }) => {
  await grant(page, DISC);
  await pcUp(page);
  await icon(page, SERVER).dblclick();
  await page.getByTestId('srv-menu-sessions').click();
  for (const c of ['11', '12', '13']) {
    await page.getByTestId('srv-code').fill(c);
    await page.getByTestId('srv-code-open').click();
    await expect(page.getByTestId('srv-msg')).not.toHaveText('');
  }
  await expect(page.getByTestId('srv-msg')).toContainText('Повторите через');
  await expect(page.getByTestId('srv-code')).toBeDisabled();
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

test('из поиска — программа сервера открыта на нужном разделе', async ({ page }) => {
  await grant(page, [...DISC, 'ПАРОЛЬ | сервер объекта: сеансы пользователей | 05']);
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('сеансов пользователя 05');
  await page.getByTestId('search-L387').locator('.search-hit').first().click();
  await expect(page.getByTestId('srv-session')).toBeVisible();
});

test('окна меняют размер за угол; не меньше 460×300', async ({ page }) => {
  await grant(page, DISC);
  await pcUp(page);
  await icon(page, SERVER).dblclick();
  const win = page.getByTestId(`lap-win-${SERVER}`);
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
});
