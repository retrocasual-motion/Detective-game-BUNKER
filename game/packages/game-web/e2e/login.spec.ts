import { test as base } from '@playwright/test';
import { E2E_EMAIL, expect, test, toWall } from './fixtures.ts';

/** Исходящая почта сервера (только в разработке): письма автотестам вместо Mailpit. */
interface Out {
  to: string;
  subject: string;
  text: string;
}

base(
  'вход по ссылке: почта → письмо → ссылка → дело; письмо бюро при первом входе',
  async ({ browser }) => {
    const email = `new-${Date.now()}@bunker.test`;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByTestId('login')).toBeVisible();
    await expect(page.getByTestId('room')).toHaveCount(0);
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-send').click();
    await expect(page.getByTestId('login-sent')).toContainText(email);

    const outbox = async () => (await (await page.request.get('/api/dev/outbox')).json()) as Out[];
    const letter = (await outbox()).findLast((l) => l.to === email);
    expect(letter?.subject).toBe('Вход в дело № 09-1128');
    const link = /http:\/\/\S+\/api\/login\/verify\?token=\S+/.exec(letter?.text ?? '')?.[0];
    if (!link) throw new Error('нет ссылки');
    await page.goto(link);
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await page.getByTestId('menu-continue').click();
    await expect(page.getByTestId('room')).toBeVisible();

    // Первый вход — письмо бюро о возобновлении дела (01).
    const bureau = (await outbox()).filter(
      (l) => l.to === email && l.subject.includes('возобновление'),
    );
    expect(bureau).toHaveLength(1);
    expect(bureau[0]?.text).toContain('Вы назначены специалистом');

    // Ссылка одноразовая.
    await page.goto(link);
    await expect(page.locator('body')).toContainText('Ссылка не работает');

    // «Выйти» — снова экран входа.
    await page.goto('/');
    await page.getByTestId('menu-logout').click();
    await expect(page.getByTestId('login')).toBeVisible();
    await ctx.close();
  },
);

test('настоящая почта: ответ — письмом; «Добавить в дело» кладёт его во «Входящие» (M-C)', async ({
  page,
}) => {
  // Фикстура ставит канал «во Входящие» — переключаем на почту в настройках меню.
  await page.getByTestId('menu-tab').click();
  await page.getByTestId('menu-settings').click();
  await Promise.all([
    page.waitForResponse('**/api/me/channel'),
    page.getByTestId('menu-mail-real').check(),
  ]);
  await expect(page.getByTestId('menu-mail-real')).toBeChecked();
  await page.getByTestId('menu-back').click();

  // Запрос — прямо серверу (папку проверяет petition.spec); перезагрузка: игра узнаёт, что
  // ответ ждёт на почте, и сама заглядывает, пока его не добавят в дело.
  const r = await page.request.post('/api/petition', {
    data: {
      to: 'zapros@okrug-bureau.org',
      ask: { file: '25', quote: 'ключ плоский металлический, штамп DO NOT DUPLICATE, номер 845' },
      basis: { file: '45', quote: 'Бумажник' },
    },
  });
  expect(await r.json()).toMatchObject({ n: 1, toMail: true });
  await page.reload();
  await expect(page.getByTestId('room')).toBeVisible();
  await expect(page.getByTestId('main-menu')).toHaveCount(0);
  // Записка «Поступило во «Входящие»» видна у стены.
  await toWall(page);

  // Сервер рассылает раз в несколько секунд после срока доставки (1,5 с).
  let reply: Out | undefined;
  await expect
    .poll(
      async () => {
        const all = (await (await page.request.get('/api/dev/outbox')).json()) as Out[];
        reply = all.findLast(
          (l) => l.to === E2E_EMAIL && l.subject.startsWith('Ответ на запрос № 1'),
        );
        return reply !== undefined;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  // На почте — да, в деле — нет.
  await expect(page.getByTestId('arrival-note')).toHaveCount(0);

  const add = /http:\/\/\S+\/api\/case\/add\?l=\S+/.exec(reply?.text ?? '')?.[0];
  if (!add) throw new Error('нет ссылки «Добавить в дело»');
  const phone = await page.context().newPage();
  await phone.goto(add);
  await expect(phone.locator('body')).toContainText('Добавлено в дело');
  await phone.close();

  await page.bringToFront();
  await expect(page.getByTestId('arrival-note')).toContainText('M001', { timeout: 15_000 });
});
