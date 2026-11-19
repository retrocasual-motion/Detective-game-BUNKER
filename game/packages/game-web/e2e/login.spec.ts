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
    // Ссылка — страница с кнопкой «Войти» (R1-01: сканеры почты открывают ссылки сами).
    await page.goto(link);
    await page.getByRole('button', { name: 'Войти' }).click();
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
