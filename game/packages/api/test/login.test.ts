import type { AccessRules } from '@bunker/engine';
import type { Material, PlayerState } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import {
  connectDb,
  type Db,
  loginTokens,
  migrateDb,
  playerProgress,
  playerState,
  players,
  sessions,
} from '../src/db/client.ts';
import { createMailer, type Mailer } from '../src/mail/mailer.ts';

const mat = (id: string, body: string): Material => ({
  id,
  title: `Материал ${id}`,
  placement: 'desk',
  kind: 'sheet',
  body,
  sourceFile: `${id}__x.md`,
});
const LETTER_01 = [
  '# Входящее письмо',
  '',
  '**От:** Бюро <zapros@bureau.org>',
  '**Тема:** Дело № 09-1128 — возобновление',
  '',
  'Здравствуйте. Дело возобновлено, материал для запроса.',
].join('\n');
const materials = [mat('01', LETTER_01), mat('02', '# 02\nкоды 05, 07\n')];
const locked = [mat('L101', '# L101\nприложение\n')];
const rules: AccessRules = { version: 1, rules: [] };
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
let mailer: Mailer;
const URL_ = 'http://game.test';

beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  for (const t of [playerState, playerProgress, players, sessions, loginTokens]) await db.delete(t);
  clock = 1_000_000;
  mailer = createMailer({
    transport: 'memory',
    mailpitUrl: '',
    from: { email: 'zapros@blackwood-bi.org', name: 'Бюро' },
  });
});

const app = () =>
  createApp({
    db,
    materials,
    production: false,
    engine,
    now: () => clock,
    auth: 'link',
    mailer,
    publicUrl: URL_,
  });

/** Нажать кнопку формы на странице из письма (POST, как браузер). */
const press = (a: ReturnType<typeof app>, path: string, field: string, value: string) =>
  a.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ [field]: value }).toString(),
  });

/** Войти по ссылке из письма — cookie сессии. */
async function login(a: ReturnType<typeof app>, email = 'det@example.com'): Promise<string> {
  const before = mailer.outbox.length;
  const res = await a.request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  expect(res.status).toBe(200);
  const letter = mailer.outbox[before];
  const link = /http:\/\/game\.test(\/api\/login\/verify\?token=\S+)/.exec(letter?.text ?? '')?.[1];
  if (!link) throw new Error('нет ссылки');
  // Ссылка — страница с кнопкой «Войти» (R1-01); сама ничего не тратит.
  const page = await a.request(link);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('Войти');
  const v = await press(
    a,
    '/api/login/verify',
    'token',
    new URL(link, 'http://x').searchParams.get('token') ?? '',
  );
  expect(v.status).toBe(303);
  const cookie = v.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('нет cookie');
  return cookie;
}

const get = (a: ReturnType<typeof app>, path: string, cookie: string) =>
  a.request(path, { headers: { cookie } });

describe('вход по ссылке (6a-1)', () => {
  it('без входа дело закрыто: 401', async () => {
    const a = app();
    expect((await a.request('/api/materials')).status).toBe(401);
    expect((await a.request('/api/me')).status).toBe(401);
    expect((await a.request('/api/health')).status).toBe(200);
  });

  it('почта → письмо со ссылкой → дело; при первом входе — письмо бюро (01)', async () => {
    const a = app();
    const cookie = await login(a);
    const me = await (await get(a, '/api/me', cookie)).json();
    expect(me).toEqual({ auth: 'link', email: 'det@example.com' });
    expect((await get(a, '/api/materials', cookie)).status).toBe(200);
    const subjects = mailer.outbox.map((l) => l.subject);
    expect(subjects).toEqual(['Вход в дело № 09-1128', 'Дело № 09-1128 — возобновление']);
    expect(mailer.outbox[1]?.text).toContain('Здравствуйте. Дело возобновлено');
    expect(mailer.outbox[1]?.text).not.toContain('**Тема:**');
    // Второй вход — письма бюро больше нет.
    clock += 120_000;
    await login(a);
    expect(mailer.outbox.filter((l) => l.subject.startsWith('Дело'))).toHaveLength(1);
  });

  it('ссылка одноразовая и живёт 30 минут', async () => {
    const a = app();
    await a.request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'det@example.com' }),
    });
    const link = /\/api\/login\/verify\?token=\S+/.exec(mailer.outbox[0]?.text ?? '')?.[0] ?? '';
    const token = new URL(link, 'http://x').searchParams.get('token') ?? '';
    // Открыть ссылку (сканер почты) — вход не потрачен.
    expect((await a.request(link)).status).toBe(200);
    expect((await a.request(link)).status).toBe(200);
    expect((await press(a, '/api/login/verify', 'token', token)).status).toBe(303);
    // Второй раз — нет.
    expect((await a.request(link)).status).toBe(400);
    expect((await press(a, '/api/login/verify', 'token', token)).status).toBe(400);
  });

  it('ссылка живёт 30 минут', async () => {
    const a = app();
    await a.request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'det@example.com' }),
    });
    const link = /\/api\/login\/verify\?token=\S+/.exec(mailer.outbox[0]?.text ?? '')?.[0] ?? '';
    clock += 31 * 60_000;
    expect((await a.request(link)).status).toBe(400);
  });

  it('письмо со ссылкой — не чаще раза в минуту', async () => {
    const a = app();
    const send = () =>
      a.request('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'Det@Example.com' }),
      });
    await send();
    expect(await (await send()).json()).toEqual({ sent: true, again: true });
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]?.to).toBe('det@example.com');
  });

  it('RV-57: играющему вход продлевается — через 89 дней ещё на 90, а не 401 на 91-й', async () => {
    const a = app();
    const start = clock;
    const one = await login(a);
    clock = start + 89 * 86_400_000;
    const mid = await get(a, '/api/materials', one);
    expect(mid.status).toBe(200);
    expect(mid.headers.get('set-cookie')).toContain('bunker_sid=');
    clock = start + 150 * 86_400_000;
    expect((await get(a, '/api/materials', one)).status).toBe(200);
    // Без игры 90 дней — вход истекает, как прежде.
    clock = start + 241 * 86_400_000;
    expect((await get(a, '/api/materials', one)).status).toBe(401);
    clock = start;
  });

  it('у каждого игрока своё дело', async () => {
    const a = app();
    const one = await login(a, 'one@example.com');
    const two = await login(a, 'two@example.com');
    const w = { 'x-state-writer': 'page-one-1' };
    const opened = await a.request('/api/state', { headers: { cookie: one, ...w } });
    const put = await a.request('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: one, ...w, 'x-state-seq': '1' },
      body: JSON.stringify(await opened.json()),
    });
    expect(put.status).toBe(204);
    expect(await db.select().from(playerState)).toHaveLength(1);
    expect((await get(a, '/api/state', two)).status).toBe(200);
    await a.request('/api/logout', { method: 'POST', headers: { cookie: one } });
    expect((await get(a, '/api/materials', one)).status).toBe(401);
  });
});

describe('письма входа и служебные маршруты (R1-02, R4-08)', () => {
  const ask = (a: ReturnType<typeof app>, email: string) =>
    a.request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });

  it('пять одновременных запросов на один адрес — одно письмо', async () => {
    const a = app();
    await Promise.all([1, 2, 3, 4, 5].map(() => ask(a, 'det@example.com')));
    expect(mailer.outbox).toHaveLength(1);
  });

  it('с одного подключения — не больше 10 писем за час, потом 429', async () => {
    const a = app();
    for (let i = 0; i < 10; i++) expect((await ask(a, `p${i}@example.com`)).status).toBe(200);
    expect((await ask(a, 'p10@example.com')).status).toBe(429);
    expect(mailer.outbox).toHaveLength(10);
    clock += 3_600_000;
    expect((await ask(a, 'p10@example.com')).status).toBe(200);
  });

  it('в production вход без письма и исходящая почта закрыты', async () => {
    const a = createApp({
      db,
      materials,
      production: true,
      engine,
      now: () => clock,
      auth: 'link',
      mailer,
      publicUrl: URL_,
    });
    const devLogin = await a.request('/api/dev/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'det@example.com' }),
    });
    expect(devLogin.status).toBe(404);
    expect((await a.request('/api/dev/outbox')).status).toBe(404);
  });
});

describe('безопасность входа и дела (RV-79)', () => {
  const W = { 'x-state-writer': 'page-sec-1' };
  const putState = (a: ReturnType<typeof app>, cookie: string, body: string, seq: number) =>
    a.request('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, ...W, 'x-state-seq': String(seq) },
      body,
    });

  it('дело одного игрока другому не видно и не меняется им', async () => {
    const a = app();
    const one = await login(a, 'one@example.com');
    const two = await login(a, 'two@example.com');
    const s1 = (await (
      await a.request('/api/state', { headers: { cookie: one, ...W } })
    ).json()) as PlayerState;
    const mine = {
      ...s1,
      wall: {
        ...s1.wall,
        notes: [{ id: 'n:s1', kind: 'note', text: 'только мой' }],
        items: [...s1.wall.items, { id: 'n:s1', x: 10, y: 10, z: 1, rot: 0 }],
      },
    };
    expect((await putState(a, one, JSON.stringify(mine), 1)).status).toBe(204);
    // Второй игрок видит своё дело, без чужой записки.
    const s2 = await (
      await a.request('/api/state', { headers: { cookie: two, 'x-state-writer': 'page-two-1' } })
    ).text();
    expect(s2).not.toContain('только мой');
    // Сохранение второго не трогает дело первого.
    await a.request('/api/state', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: two,
        'x-state-writer': 'page-two-1',
        'x-state-seq': '1',
      },
      body: s2,
    });
    expect(await (await get(a, '/api/state', one)).text()).toContain('только мой');
  });

  it('cookie сессии: HttpOnly, SameSite=Lax, весь сайт; на https — Secure', async () => {
    const a = app();
    const res = await a.request('/api/dev/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'c@example.com' }),
    });
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect(set).toMatch(/Path=\//i);
    expect(set).not.toMatch(/Secure/i);
    const https = createApp({
      db,
      materials,
      production: false,
      engine,
      now: () => clock,
      auth: 'link',
      mailer,
      publicUrl: 'https://game.test',
    });
    const r2 = await https.request('/api/dev/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'c2@example.com' }),
    });
    expect(r2.headers.get('set-cookie') ?? '').toMatch(/Secure/i);
  });

  it('сессия без игры истекает (90 дней) — 401', async () => {
    const a = app();
    const one = await login(a, 'old@example.com');
    expect((await get(a, '/api/materials', one)).status).toBe(200);
    clock += 91 * 86_400_000;
    expect((await get(a, '/api/materials', one)).status).toBe(401);
  });

  it('сохранение больше 4 МБ — 413, дело не тронуто', async () => {
    const a = app();
    const one = await login(a, 'big@example.com');
    await a.request('/api/state', { headers: { cookie: one, ...W } });
    const huge = JSON.stringify({ pad: 'x'.repeat(4 * 1024 * 1024 + 10) });
    expect((await putState(a, one, huge, 1)).status).toBe(413);
  });
});
