import type { Locator, Page } from '@playwright/test';
import { expect, leavePc, sheet, siteInPc as site, test, toWall } from './fixtures.ts';

/**
 * Сайты дела (A-272, AC-3; Q1, S5-A — автор 19.11; A-288 п. 9): адрес в материале — ссылка, сайт —
 * в окне браузера компьютера следователя или ноутбука Адама, не во вкладке; формы — движок игры от
 * имени игрока; на стол, стену и в поиск сайты не попадают.
 */

type Scope = Pick<Page | Locator, 'getByTestId'>;

const fill = async (tab: Scope, form: string, values: Record<string, string>) => {
  for (const [k, v] of Object.entries(values)) await tab.getByTestId(`site-${form}-${k}`).fill(v);
  await tab.getByTestId(`site-${form}-submit`).click();
};

test('адрес в материале — ссылка: щелчок открывает сайт в браузере компьютера, вкладки нет', async ({
  page,
}) => {
  await toWall(page);
  await sheet(page, '02').click();
  const link = page
    .getByTestId('viewer')
    .locator('a.site-link', { hasText: 'vaultline-program.com' });
  await expect(link).toBeVisible();
  const pages = page.context().pages().length;
  await link.click();
  const web = page.getByTestId('pc-web');
  await expect(web.getByTestId('site')).toHaveAttribute('data-domain', 'vaultline-program.com');
  await expect(page.getByTestId('pc-url')).toHaveValue('vaultline-program.com');
  await expect(web.locator('.site-nav')).toContainText('Вход для сотрудников');
  await expect(web.getByTestId('site-form-vl-login')).toBeVisible();
  // Новой вкладки нет; сайта на стене и во «Входящих» нет.
  expect(page.context().pages().length).toBe(pages);
  await leavePc(page);
  await expect(page.getByTestId('inbox-L101')).toHaveCount(0);
  await expect(sheet(page, 'L101')).toHaveCount(0);
});

test('неизвестный адрес — «Страница не найдена»; назад — прежняя страница', async ({ page }) => {
  await site(page, 'vaultline-program.com');
  await page.getByTestId('pc-url').fill('google.com');
  await page.getByTestId('pc-url').press('Enter');
  await expect(page.getByTestId('pc-web-text')).toContainText('404');
  await page.getByTestId('pc-back').click();
  await expect(page.getByTestId('pc-web').getByTestId('site')).toHaveAttribute(
    'data-domain',
    'vaultline-program.com',
  );
  await page.getByTestId('pc-forward').click();
  await expect(page.getByTestId('pc-web-text')).toContainText('404');
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
  await expect(page.getByTestId('pc-url')).toHaveValue('vaultline-program.com/cabinet');
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
  // Адрес в ответе — ссылка: хранилище в том же браузере.
  await msg.locator('a.site-link').first().click();
  const hx = page.getByTestId('pc-web');
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
  const body = (await r.json()) as { address?: string; reply?: string };
  expect(body.address).toBeUndefined();
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
  await expect(page.getByTestId('pc-url')).toHaveValue('mailbridge.net/mail');
  await expect(mb.getByTestId('site-mail')).toBeVisible();
  await mb.getByTestId('site-letter-6').click();
  await expect(mb.getByTestId('site-letter')).toContainText('j.mercer@octon-labs.net');
  await mb.getByTestId('site-mail-out').click();
  await expect(mb.getByTestId('site-letter-8')).toContainText('Re: B');
  // Вернулся на главную позже — «Вы вошли», без формы входа (F8).
  await site(page, 'mailbridge.net');
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
  await leavePc(page);
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
    // Отошёл от компьютера — коробка на столе (лоток пуст: всё в коробке).
    await leavePc(page);
    const box = page.getByTestId('container-bank');
    await expect(box).toBeVisible();
    await expect(page.getByTestId('inbox-L460')).toHaveCount(0);
    await box.click();
    await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /ячейка № 845/);
    await page.getByTestId('envelope-open').dispatchEvent('click');
    await expect(page.getByTestId('held')).toHaveAttribute('aria-label', /» · вскрыт/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('held')).toBeHidden();
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
    ['blackwood-bi.org', 'duty@blackwood-bi.org'],
  ];
  for (const [address, text] of pages) {
    const tab = await site(page, address);
    await expect(tab.getByTestId('site'), address).toContainText(text);
  }
  await leavePc(page);
  // На стол, стену и в поиск сайты не попадают (S5-A).
  await expect(sheet(page, 'L179')).toHaveCount(0);
});
