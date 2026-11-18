import type { AccessRules } from '@bunker/engine';
import type { Material } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import {
  connectDb,
  type Db,
  loginTokens,
  migrateDb,
  playerLetters,
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
const rules: AccessRules = {
  version: 1,
  attempt_limit: { ХОДАТАЙСТВО: 3 },
  address_book: true,
  rules: [
    {
      id: 'pet',
      action: 'ХОДАТАЙСТВО',
      target: '^zapros@bureau\\.org$',
      cards: [[{ file: '^01$', quote: 'материал' }]],
      release: ['L101'],
      ok: 'Бюро: направляем приложение.',
      again: 'Уже направлено.',
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
let mailer: Mailer;
const URL_ = 'http://game.test';

beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  for (const t of [playerState, playerProgress, playerLetters, players, sessions, loginTokens])
    await db.delete(t);
  clock = 1_000_000;
  mailer = createMailer({
    transport: 'memory',
    mailpitUrl: '',
    from: { email: 'zapros@okrug-bureau.org', name: 'Бюро' },
  });
});

const app = () =>
  createApp({
    db,
    materials,
    production: false,
    engine,
    now: () => clock,
    mailDelayMs: 60_000,
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
    expect(me).toEqual({ auth: 'link', email: 'det@example.com', channel: 'real' });
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

  it('у каждого игрока своё дело', async () => {
    const a = app();
    const one = await login(a, 'one@example.com');
    const two = await login(a, 'two@example.com');
    const put = await a.request('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: one },
      body: JSON.stringify(await (await get(a, '/api/state', one)).json()),
    });
    expect(put.status).toBe(204);
    expect(await db.select().from(playerState)).toHaveLength(1);
    expect((await get(a, '/api/state', two)).status).toBe(200);
    await a.request('/api/logout', { method: 'POST', headers: { cookie: one } });
    expect((await get(a, '/api/materials', one)).status).toBe(401);
  });
});

describe('ответ на запрос — на почту (ML-A, M-C)', () => {
  const petition = (a: ReturnType<typeof app>, cookie: string) =>
    a.request('/api/petition', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        to: 'zapros@bureau.org',
        ask: { file: '01', quote: 'материал' },
        basis: { file: '01', quote: 'материал' },
      }),
    });
  const ids = async (a: ReturnType<typeof app>, cookie: string) =>
    ((await (await get(a, '/api/materials', cookie)).json()) as Material[]).map((m) => m.id);

  it('письмо уходит в срок; в дело — только по «Добавить в дело»', async () => {
    const a = app();
    const cookie = await login(a);
    const sent = mailer.outbox.length;
    expect(await (await petition(a, cookie)).json()).toEqual({
      n: 1,
      delayMs: 60_000,
      toMail: true,
    });
    expect(await a.sweepMail()).toBe(0);

    clock += 60_000;
    expect(await a.sweepMail()).toBe(1);
    expect(await a.sweepMail()).toBe(0);
    const reply = mailer.outbox[sent];
    expect(reply?.subject).toBe('Ответ на запрос № 1 — zapros@bureau.org');
    expect(reply?.text).toContain('Бюро: направляем приложение.');
    // На почте — да, в деле — ещё нет; клиент заглядывает, пока ждёт.
    expect(await ids(a, cookie)).toEqual(['01', '02']);
    expect(await (await get(a, '/api/mail/pending', cookie)).json()).toEqual({
      inMs: [],
      waiting: 1,
    });

    const add = /http:\/\/game\.test(\/api\/case\/add\?l=\S+)/.exec(reply?.text ?? '')?.[1] ?? '';
    // Ссылку открывают и с телефона — без входа; открыть — ещё не добавить (сканеры почты, R1-01).
    const page = await a.request(add);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Добавить в дело?');
    expect(await ids(a, cookie)).toEqual(['01', '02']);
    const l = new URL(add, 'http://x').searchParams.get('l') ?? '';
    const done = await press(a, '/api/case/add', 'l', l);
    expect(done.status).toBe(200);
    expect(await done.text()).toContain('Добавлено в дело');
    expect(await ids(a, cookie)).toEqual(['01', '02', 'L101', 'M001']);
    expect(await (await a.request(add)).text()).toContain('Добавлено в дело');
    expect((await a.request('/api/case/add?l=nope-nope-nope-nope-nope')).status).toBe(404);
  });

  it('«письмо не пришло»: канал «во Входящие» — ответы сразу в деле', async () => {
    const a = app();
    const cookie = await login(a);
    await petition(a, cookie);
    clock += 60_000;
    const ch = await a.request('/api/me/channel', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ channel: 'internal' }),
    });
    expect(ch.status).toBe(204);
    expect(await ids(a, cookie)).toEqual(['01', '02', 'L101', 'M001']);
    expect(await a.sweepMail()).toBe(0);
    // Обратно на почту — уже доставленное остаётся в деле.
    await a.request('/api/me/channel', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ channel: 'real' }),
    });
    expect(await ids(a, cookie)).toEqual(['01', '02', 'L101', 'M001']);
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
      mailDelayMs: 60_000,
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
