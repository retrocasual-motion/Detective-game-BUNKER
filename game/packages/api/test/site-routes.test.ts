import type { AccessRules } from '@bunker/engine';
import { defaultState, type Material, type SitePage } from '@bunker/shared';
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
 * Сайты дела на сервере (A-272, AC-3; A-288 п. 9): сайт открывается в браузере устройства внутри
 * игры — игрок из сессии игры. Переход по адресу — движок (АДРЕС); страница — только открытое
 * игроком, чтение без действий (RV-65); форма — движок. Правила — маленький пакет-образец.
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
  final_form: { release: 'L999', return_allowed: false, after_reply: 'Форма заключения открыта.' },
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

const VL = 'vaultline-program.com';
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
const page = async (a: App, path = '', headers: Record<string, string> = {}) =>
  (await (
    await a.request(`/api/site/page?address=${encodeURIComponent(VL + path)}`, { headers })
  ).json()) as SitePage & { notFound?: string };
/** Перейти на сайт (как адресная строка браузера в игре). */
const open = async (a: App, address = VL, headers: Record<string, string> = {}) =>
  (await (await json(a, '/api/site/open', { address }, headers)).json()) as {
    address?: string;
    reply?: string;
  };
const form = (a: App, f: string, values: Record<string, string>, address = VL) =>
  json(a, '/api/site/form', { address, form: f, values });

describe('сайты дела на сервере (A-272, A-288)', () => {
  it('переход по адресу: сайт — его адрес; чужой адрес — ответ 404', async () => {
    const a = app();
    expect(await open(a, 'https://www.vaultline-program.com/')).toEqual({ address: VL });
    const no = await open(a, 'google.com');
    expect(no.address).toBeUndefined();
    expect(no.reply).toBeTruthy();
  });

  it('чтение без действий (RV-65): сайт, на который не переходили, — «не найдена», движок не тронут', async () => {
    const a = app();
    expect((await page(a)).notFound).toBeTruthy();
    const rows = await db.select().from(playerProgress);
    expect(rows.every((r) => !r.progress.released.includes('L101'))).toBe(true);
    await open(a);
    expect((await page(a)).notFound).toBeUndefined();
  });

  it('открытый сайт читается и после «Решить дело»: форма открыта — новые действия закрыты, перечитать можно (F2)', async () => {
    const a = app();
    await open(a);
    const [row] = await db.select().from(playerProgress);
    if (!row) throw new Error('нет прогресса игрока');
    await db
      .update(playerProgress)
      .set({ progress: { ...row.progress, released: [...row.progress.released, 'L999'] } });
    const p = await page(a);
    expect(p.notFound).toBeUndefined();
    expect(p.body).toContain('Вход для сотрудников');
    expect((await open(a)).address).toBe(VL);
  });

  it('страница: шапка, разделы, форма меткой; адрес не сайта — «не найдена»', async () => {
    const a = app();
    await open(a);
    const p = await page(a);
    expect(p.domain).toBe(VL);
    expect(p.nav).toContain('Вход для сотрудников');
    expect(p.body).toContain('::form:vl-login::');
    expect(p.cabinet).toBeNull();
    const other = (await (await a.request('/api/site/page?address=localhost')).json()) as {
      notFound?: string;
    };
    expect(other.notFound).toBeTruthy();
  });

  it('вход → кабинет; учёт анкет открывает документ только после верного ввода', async () => {
    const a = app();
    await open(a);
    const bad = await (await form(a, 'vl-login', { login: 'k.walsh', password: 'нет' })).json();
    expect(bad).toMatchObject({ quiet: true, opened: [] });
    const ok = await (await form(a, 'vl-login', { login: 'k.walsh', password: 'Йен' })).json();
    expect(ok).toMatchObject({ opened: ['L620'] });
    const cab = await page(a, '/cabinet');
    expect(cab.material).toBe('L620');
    expect(cab.docs).toEqual([]);
    await form(a, 'vl-registry', { program: 'VL-31' });
    expect((await page(a, '/cabinet')).docs.map((d) => d.id)).toEqual(['L618']);
  });

  it('форма неоткрытого сайта, чужого сайта и неизвестная форма — 400', async () => {
    const a = app();
    expect((await form(a, 'vl-login', {})).status).toBe(400);
    await open(a);
    expect((await form(a, 'fr-death', {})).status).toBe(400);
    expect((await form(a, 'fr-death', {}, 'aspen-bank.com')).status).toBe(400);
  });

  it('с входом: без сессии — 401; с сессией игры — страница и формы', async () => {
    const a = app('link');
    expect((await json(a, '/api/site/open', { address: VL })).status).toBe(401);
    expect((await a.request(`/api/site/page?address=${VL}`)).status).toBe(401);
    const login = await json(a, '/api/dev/login', { email: 'det@example.com' });
    const sid = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect((await open(a, VL, { cookie: sid })).address).toBe(VL);
    expect((await page(a, '', { cookie: sid })).body).toContain('::form:vl-login::');
  });

  it('выписка из неоткрытого материала не сохраняется; из открытого — да (P-10)', async () => {
    const a = app();
    await open(a);
    const s = defaultState([...materials, locked[0] as Material]);
    const ex = {
      id: 'x:b',
      text: 'текст',
      material: 'L620',
      source: 'кабинет',
      place: { kind: 'site' as const, address: 'vaultline-program.com/cabinet' },
    };
    const w = { 'x-state-writer': 'page-site-1' };
    await a.request('/api/state', { headers: w });
    let seq = 0;
    const put = (st: unknown) =>
      a.request('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...w, 'x-state-seq': String(++seq) },
        body: JSON.stringify(st),
      });
    const excerptsNow = async () =>
      ((await (await a.request('/api/state')).json()) as { excerpts?: { id: string }[] })
        .excerpts ?? [];
    expect(
      (
        await put({
          ...s,
          excerpts: [ex],
          wall: { ...s.wall, items: [...s.wall.items, { id: 'x:b', x: 0, y: 0, z: 1, rot: 0 }] },
        })
      ).status,
    ).toBe(204);
    expect(await excerptsNow()).toEqual([]);
    const ok = { ...ex, material: 'L101' };
    expect(
      (
        await put({
          ...s,
          excerpts: [ok],
          wall: { ...s.wall, items: [...s.wall.items, { id: 'x:b', x: 0, y: 0, z: 1, rot: 0 }] },
        })
      ).status,
    ).toBe(204);
    expect((await excerptsNow()).map((x) => x.id)).toEqual(['x:b']);
  });
});
