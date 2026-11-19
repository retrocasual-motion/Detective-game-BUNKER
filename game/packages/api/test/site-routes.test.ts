import type { AccessRules } from '@bunker/engine';
import type { Material, SitePage } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import {
  connectDb,
  type Db,
  migrateDb,
  playerProgress,
  playerState,
  players,
  sessions,
} from '../src/db/client.ts';

/**
 * Сайты дела на сервере (A-272, AC-3): переход по адресу → ссылка с пропуском; пропуск → cookie
 * сайта; страница — только открытое игроком; форма — движок. Правила — маленький пакет-образец.
 */

const mat = (id: string, body: string): Material => ({
  id,
  title: /^# (.+)$/m.exec(body)?.[1] ?? id,
  placement: 'desk',
  kind: 'sheet',
  body,
  sourceFile: `${id}__x.md`,
});
const materials = [mat('01', '# 01\nСайт: vaultline-program.com\n')];
const locked = [
  mat(
    'L101',
    '# Сайт vaultline-program.com\n\nШапка: знак.\nРазделы: Главная · Вход для сотрудников\n\n## Вход для сотрудников\n\nФорма: логин · пароль · [Войти] · ссылка «Забыли пароль?».\n',
  ),
  mat('L620', '# Кабинет\n\n## Учёт анкет\n\nПоля: «Программа» · [Найти].\n'),
  mat('L618', '# Учёт анкет VL-31\n\nтаблица\n'),
];
const rules: AccessRules = {
  version: 1,
  attempt_limit: { ПАРОЛЬ: 3 },
  rules: [
    {
      id: 'url-vl',
      action: 'АДРЕС',
      target: '.*',
      accept: ['^(https?://)?(www\\.)?vaultline-program\\.com(/.*)?$'],
      release: ['L101'],
      ok: 'Открыт сайт.',
    },
    {
      id: 'login',
      action: 'ПАРОЛЬ',
      target: 'вход для сотрудник',
      accept: ['k\\.walsh / йен'],
      release: ['L620'],
      requires: ['L101'],
      ok: 'Вход выполнен.',
      fail: 'Неверный логин или пароль.',
    },
    {
      id: 'reg',
      action: 'ПАРОЛЬ',
      target: 'уч[её]т',
      accept: ['^vl-31$'],
      release: ['L618'],
      requires: ['L620'],
      ok: 'Учёт анкет.',
      fail: 'Запись не найдена.',
    },
  ],
};
const engine = {
  locked,
  content: {
    rules,
    starting: new Map(materials.map((m) => [m.id, m.body])),
    locked: new Map(locked.map((m) => [m.id, m.body])),
  },
};

let db: Db;
let close: () => Promise<void>;
let clock = 1_000_000;

beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  for (const t of [playerState, playerProgress, players, sessions]) await db.delete(t);
  clock = 1_000_000;
});

const SITE = 'vaultline-program.localhost:5173';
const app = (auth: 'off' | 'link' = 'off') =>
  createApp({
    db,
    materials,
    production: false,
    engine,
    now: () => clock,
    auth,
    publicUrl: 'http://localhost:5173',
  });
type App = ReturnType<typeof app>;
const json = (a: App, path: string, body: unknown, headers: Record<string, string> = {}) =>
  a.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const page = async (a: App, path = '/', headers: Record<string, string> = {}) =>
  (await (
    await a.request(`/api/site/page?path=${encodeURIComponent(path)}`, {
      headers: { host: SITE, ...headers },
    })
  ).json()) as SitePage & { anon?: boolean; notFound?: string };

describe('сайты дела на сервере (A-272)', () => {
  it('переход по адресу: сайт — ссылка на свой хост с пропуском; чужой адрес — ответ 404', async () => {
    const a = app();
    const ok = (await (
      await json(a, '/api/site/open', { address: 'vaultline-program.com' })
    ).json()) as {
      url?: string;
    };
    expect(ok.url).toMatch(/^http:\/\/vaultline-program\.localhost:5173\/\?enter=/);
    const no = (await (await json(a, '/api/site/open', { address: 'google.com' })).json()) as {
      reply?: string;
      url?: string;
    };
    expect(no.url).toBeUndefined();
    expect(no.reply).toBeTruthy();
  });

  it('страница: шапка, разделы, форма меткой; хост игры — не сайт', async () => {
    const a = app();
    const p = await page(a);
    expect(p.domain).toBe('vaultline-program.com');
    expect(p.nav).toContain('Вход для сотрудников');
    expect(p.body).toContain('::form:vl-login::');
    expect(p.cabinet).toBe(false);
    const game = await a.request('/api/site/page?path=/', { headers: { host: 'localhost:5173' } });
    expect(game.status).toBe(404);
  });

  it('вход → кабинет; учёт анкет открывает документ только после верного ввода', async () => {
    const a = app();
    await page(a);
    const bad = await (
      await json(
        a,
        '/api/site/form',
        { form: 'vl-login', values: { login: 'k.walsh', password: 'нет' } },
        { host: SITE },
      )
    ).json();
    expect(bad).toMatchObject({ quiet: true, opened: [] });
    const ok = await (
      await json(
        a,
        '/api/site/form',
        { form: 'vl-login', values: { login: 'k.walsh', password: 'Йен' } },
        { host: SITE },
      )
    ).json();
    expect(ok).toMatchObject({ opened: ['L620'] });
    const cab = await page(a, '/cabinet');
    expect(cab.material).toBe('L620');
    expect(cab.docs).toEqual([]);
    await json(
      a,
      '/api/site/form',
      { form: 'vl-registry', values: { program: 'VL-31' } },
      { host: SITE },
    );
    expect((await page(a, '/cabinet')).docs.map((d) => d.id)).toEqual(['L618']);
  });

  it('форма чужого сайта и неизвестная форма — 400', async () => {
    const a = app();
    const r = await json(a, '/api/site/form', { form: 'fr-death', values: {} }, { host: SITE });
    expect(r.status).toBe(400);
  });

  it('с входом: без пропуска сайт пуст; пропуск из игры → cookie сайта → страница и формы', async () => {
    const a = app('link');
    expect((await page(a)).anon).toBe(true);
    const anonForm = await json(
      a,
      '/api/site/form',
      { form: 'vl-login', values: {} },
      { host: SITE },
    );
    expect(anonForm.status).toBe(401);
    // Вход в игру (служебный, как в автотестах) → переход по адресу из игры.
    const login = await json(a, '/api/dev/login', { email: 'det@example.com' });
    const sid = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    const open = (await (
      await json(a, '/api/site/open', { address: 'vaultline-program.com' }, { cookie: sid })
    ).json()) as { url: string };
    const pass = new URL(open.url).searchParams.get('enter') ?? '';
    expect(pass).not.toBe('');
    // Пропуск — только на хосте сайта.
    expect((await json(a, '/api/site/enter', { pass })).status).toBe(404);
    const enter = await json(a, '/api/site/enter', { pass }, { host: SITE });
    expect(enter.status).toBe(204);
    const site = enter.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(site).toMatch(/^bunker_site=/);
    expect((await page(a, '/', { cookie: site })).body).toContain('::form:vl-login::');
    // Подделанный пропуск — нет.
    expect((await json(a, '/api/site/enter', { pass: `${pass}x` }, { host: SITE })).status).toBe(
      403,
    );
    // Пропуск живёт 10 минут.
    clock += 11 * 60_000;
    expect((await json(a, '/api/site/enter', { pass }, { host: SITE })).status).toBe(403);
  });
});
