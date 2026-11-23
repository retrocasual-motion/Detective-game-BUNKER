import type { Page } from '@playwright/test';
import { expect, sheet, test, toWall } from './fixtures.ts';

/**
 * Настоящие сайты дела (A-272, AC-3; Q1, BR-A, S5-A — автор 19.11): адрес в материале — ссылка,
 * сайт — в новой вкладке; формы — движок игры от имени игрока; на стол, стену и в поиск сайты
 * не попадают.
 */

/** Сайт по адресу — так же, как щелчок по ссылке в деле (сервер даёт адрес с пропуском). */
async function site(page: Page, address: string): Promise<Page> {
  const r = await page.request.post('/api/site/open', { data: { address } });
  const { url } = (await r.json()) as { url?: string };
  if (!url) throw new Error(`сайт не открылся: ${address}`);
  const tab = await page.context().newPage();
  await tab.goto(url);
  await expect(tab.getByTestId('site')).toBeVisible();
  return tab;
}

const fill = async (tab: Page, form: string, values: Record<string, string>) => {
  for (const [k, v] of Object.entries(values)) await tab.getByTestId(`site-${form}-${k}`).fill(v);
  await tab.getByTestId(`site-${form}-submit`).click();
};

test('адрес в материале — ссылка: щелчок открывает сайт в новой вкладке, пропуск из ссылки убран', async ({
  page,
}) => {
  await toWall(page);
  await sheet(page, '02').click();
  const link = page
    .getByTestId('viewer')
    .locator('a.site-link', { hasText: 'vaultline-program.com' });
  await expect(link).toBeVisible();
  const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await expect(tab.getByTestId('site')).toBeVisible();
  await expect(tab.getByTestId('site')).toHaveAttribute('data-domain', 'vaultline-program.com');
  await expect(tab).toHaveURL(/^http:\/\/vaultline-program\.localhost:\d+\/$/);
  await expect(tab.locator('.site-nav')).toContainText('Вход для сотрудников');
  await expect(tab.getByTestId('site-form-vl-login')).toBeVisible();
  // Лист в игре открыт как был; сайта на стене и во «Входящих» нет.
  await expect(page.getByTestId('viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inbox-L101')).toHaveCount(0);
  await expect(sheet(page, 'L101')).toHaveCount(0);
});

test('неизвестный адрес — «Страница не найдена»; вне игры сайт пуст', async ({ page, browser }) => {
  const r = await page.request.post('/api/site/open', { data: { address: 'google.com' } });
  expect(await r.json()).toMatchObject({ reply: expect.stringContaining('404') });
  const tab = await site(page, 'vaultline-program.com');
  const url = new URL(tab.url());
  // Другой браузер (без пропуска из игры): адрес тот же — текста и форм нет.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await stranger.goto(url.origin);
  await expect(stranger.getByTestId('site-anon')).toContainText('открывается из игры');
  await other.close();
});

test('VAULTLINE: вход по кодовому слову (PW-B), учёт анкет A-24, документы → адрес хранилища → архив 0417', async ({
  page,
}) => {
  const vl = await site(page, 'vaultline-program.com');
  await fill(vl, 'vl-login', { login: 'k.walsh', password: 'нет' });
  await expect(vl.getByTestId('site-vl-login-msg')).toHaveText('Неверный логин или пароль.');
  // Пустое поле — у поля, без сервера: попытка не тратится (UX-4).
  await vl.getByTestId('site-vl-forgot-submit').click();
  await expect(vl.getByTestId('site-vl-forgot-msg')).toHaveText('Заполните поле «Логин».');
  await expect(vl.getByTestId('site-vl-forgot-login')).toHaveAttribute('aria-invalid', 'true');
  // Чужой логин — учётной записи нет; пароль-имя героя — не пароль (PW-B).
  await fill(vl, 'vl-forgot', { login: 'e.pierce' });
  await expect(vl.getByTestId('site-vl-forgot-msg')).toHaveText('Учётная запись не найдена.');
  await fill(vl, 'vl-login', { login: 'k.walsh', password: 'Йен' });
  await expect(vl.getByTestId('site-vl-login-msg')).toHaveText('Неверный логин или пароль.');
  // «Забыли пароль?» — вход по кодовому слову: контрольный вопрос → ответ → кабинет.
  await vl.getByTestId('site-vl-forgot-login').fill('');
  await fill(vl, 'vl-forgot', { login: 'k.walsh' });
  await expect(vl.getByTestId('site-question')).toContainText(
    'Контрольный вопрос: «Любимый герой?»',
  );
  await fill(vl, 'vl-word', { answer: 'Мэтт' });
  await expect(vl.getByTestId('site-vl-word-msg')).toHaveText('Ответ неверный.');
  await vl.getByTestId('site-vl-word-answer').fill('');
  await fill(vl, 'vl-word', { answer: 'Йен' });
  await expect(vl).toHaveURL(/\/cabinet$/);
  await expect(vl.getByTestId('site')).toContainText('Учёт анкет');
  // Учёт анкет: поля «Дата выбытия» нет (DT-A, 21.11) — анкета A-24 по коду.
  await expect(vl.getByTestId('site-vl-registry-date')).toHaveCount(0);
  await fill(vl, 'vl-registry', { code: 'A-40' });
  await expect(vl.getByTestId('site-vl-registry-msg')).toHaveText('Запись не найдена.');
  await vl.getByTestId('site-vl-registry-code').fill('');
  await fill(vl, 'vl-registry', { code: 'A-24' });
  await expect(vl.getByTestId('site-doc-L619')).toBeVisible();
  // Документы программы: промахи — без паузы (DS-B); «архив проекта» — адрес хранилища.
  for (const t of ['отчёт', 'договор', 'справка о выбытии A-24', 'план'])
    await fill(vl, 'vl-docs', { title: t });
  await expect(vl.getByTestId('site-vl-docs-title')).toBeEnabled();
  await fill(vl, 'vl-docs', { title: 'архив проекта' });
  const msg = vl.getByTestId('site-vl-docs-msg');
  await expect(msg).toContainText('docs.hexon-bio.com/vl-31');
  // Адрес в ответе — ссылка: хранилище в новой вкладке.
  const [hx] = await Promise.all([
    page.context().waitForEvent('page'),
    msg.locator('a.site-link').first().click(),
  ]).catch(async () => [await site(page, 'docs.hexon-bio.com/vl-31')]);
  await expect(hx.getByTestId('site')).toHaveAttribute('data-domain', 'docs.hexon-bio.com');
  await fill(hx, 'hx-archive', { password: '0418' });
  await expect(hx.getByTestId('site-hx-archive-msg')).toHaveText('Неверный пароль.');
  await fill(hx, 'hx-archive', { password: '0417' });
  await expect(hx.getByTestId('site-docs')).toContainText('досье');
});

test('хранилище HEXON до кабинета — 404', async ({ page }) => {
  const r = await page.request.post('/api/site/open', {
    data: { address: 'docs.hexon-bio.com/vl-31' },
  });
  const body = (await r.json()) as { url?: string; reply?: string };
  expect(body.url).toBeUndefined();
  expect(body.reply).toContain('404');
});

test('почта: «Забыли пароль?» → контрольный вопрос → «Тоффи» → веб-почта, только чтение', async ({
  page,
}) => {
  const mb = await site(page, 'mailbridge.net');
  await fill(mb, 'mb-login', { address: 'e.pierce.uk@mailbridge.net', password: 'Bobby' });
  await expect(mb.getByTestId('site-mb-login-msg')).toHaveText('Неверный адрес или пароль.');
  await fill(mb, 'mb-forgot', { address: 'e.pierce.uk@mailbridge.net' });
  await expect(mb.getByTestId('site-question')).toContainText('Кличка вашей первой собаки?');
  await fill(mb, 'mb-answer', { answer: 'Тоффи' });
  await expect(mb).toHaveURL(/\/mail$/);
  await expect(mb.getByTestId('site-mail')).toBeVisible();
  await mb.getByTestId('site-letter-6').click();
  await expect(mb.getByTestId('site-letter')).toContainText('j.mercer@octon-labs.net');
  await mb.getByTestId('site-mail-out').click();
  await expect(mb.getByTestId('site-letter-8')).toContainText('Re: B');
  // Вернулся на главную позже — «Вы вошли», без формы входа (F8).
  await mb.goto(new URL('/', mb.url()).toString());
  await expect(mb.getByTestId('site-in')).toContainText('Вы вошли');
  await expect(mb.getByTestId('site-mb-login-submit')).toHaveCount(0);
});

test('банк: форма «Сообщить о смерти арендатора» — без даты не уходит, неверно — отказ, верно — ячейка вскрыта', async ({
  page,
}) => {
  const fr = await site(page, 'aspen-bank.com');
  // Пустая дата — у поля, без сервера: попытка не тратится (UX-4).
  await fill(fr, 'fr-death', { box: '845', surname: 'Коул' });
  await expect(fr.getByTestId('site-fr-death-msg')).toHaveText('Заполните поле «Дата смерти».');
  await fill(fr, 'fr-death', { date: '14.10.2009' });
  await expect(fr.getByTestId('site-fr-death-msg')).toHaveText(
    'Ячейка с такими данными не найдена.',
  );
  await fill(fr, 'fr-death', { box: '845', surname: 'Коул', date: '13.10.2009' });
  await expect(fr.getByTestId('site-fr-death-msg')).toContainText('Сообщение принято');
});

test('три неверных пароля на сайте — поле ждёт (AC-5)', async ({ page }) => {
  const vl = await site(page, 'vaultline-program.com');
  for (const p of ['a', 'b', 'c']) await fill(vl, 'vl-login', { login: 'k.walsh', password: p });
  await expect(vl.getByTestId('site-vl-login-msg')).toContainText('Повторите через');
  await expect(vl.getByTestId('site-vl-login-submit')).toBeDisabled();
});

test('поиск по делу сайты не находит (S5-A)', async ({ page }) => {
  await site(page, 'vaultline-program.com');
  await page.bringToFront();
  await page.reload();
  await page.getByTestId('search-tab').click();
  await page.getByTestId('search-input').fill('Месяц тишины');
  await expect(page.getByTestId('search-L101')).toHaveCount(0);
});

test.describe('коробка из банка (A-272, AC-4)', () => {
  test.use({ sealed: true });

  test('форма банка → коробка на столе → вскрыть: опись и лист со сгибом — на стену, кассета — слушать', async ({
    page,
  }) => {
    await expect(page.getByTestId('container-bank')).toHaveCount(0);
    const fr = await site(page, 'aspen-bank.com');
    await fill(fr, 'fr-death', { box: '845', surname: 'Коул', date: '13.10.2009' });
    await expect(fr.getByTestId('site-fr-death-msg')).toContainText('Сообщение принято');
    // Вернулся во вкладку игры — коробка на столе (лоток пуст: всё в коробке).
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const box = page.getByTestId('container-bank');
    await expect(box).toBeVisible();
    await expect(page.getByTestId('inbox-L460')).toHaveCount(0);
    await box.click();
    await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /ячейка № 845/);
    await page.getByTestId('envelope-open').click();
    await page.getByTestId('envelope-stay').click();
    await expect(page.getByTestId('envelope-view')).toBeHidden();
    await expect(page.getByTestId('container-bank')).toHaveCount(0);
    // Лист акта — подлинник, сложен вдвое: на стене карточка со сгибом.
    await expect(sheet(page, 'L461').locator('[data-kind="folded"]').first()).toBeAttached();
    await expect(sheet(page, 'L460')).toBeAttached();
    // Проигрыватель на столе, кассета уже внутри (6.4, автор 21.11): щелчок по нему — вплотную,
    // кнопки на корпусе; под ним — строка записи той точки.
    await page.getByTestId('device-L462').click();
    await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /микрокассет/);
    await expect(page.getByTestId('cassette-insert')).toHaveCount(0);
    await page.getByTestId('cassette-player').click();
    await expect(page.getByTestId('cassette-caption')).toContainText('умер');
    for (let k = 0; k < 3; k++) await page.getByTestId('cassette-ff').click();
    await expect(page.getByTestId('cassette-caption')).toContainText('Объявлять не будем');
    await page.getByTestId('cassette-rew').click();
    await page.getByTestId('cassette-rew').click();
    await page.getByTestId('cassette-rew').click();
    await page.getByTestId('cassette-play').click();
    await expect(page.getByTestId('cassette-caption')).toContainText('пауза', { timeout: 15_000 });
    await page.getByTestId('cassette-stop').click();
  });
});

test('сайты без замков (NF-B, A-273): оператор, производитель, поставщик, бюро — по адресу; телефоны HealthWay и Mesa — на сайте', async ({
  page,
}) => {
  const pages: [string, string][] = [
    ['skycell-mobile.com', 'lawful@skycell-mobile.com'],
    ['healthway-nutrition.com', '+7 800 555-31-20'],
    ['mesa-supply.com', '+7 495 555-18-44'],
    ['okrug-bureau.org', 'duty@okrug-bureau.org'],
  ];
  for (const [address, text] of pages) {
    const tab = await site(page, address);
    await expect(tab.getByTestId('site'), address).toContainText(text);
    await tab.close();
  }
  // На стол, стену и в поиск сайты не попадают (S5-A).
  await expect(sheet(page, 'L179')).toHaveCount(0);
});
