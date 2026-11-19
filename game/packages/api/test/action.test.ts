import type { AccessRules } from '@bunker/engine';
import { defaultState, inboxIds, type Material, type PlayerState } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { connectDb, type Db, migrateDb, playerProgress, playerState } from '../src/db/client.ts';

const mat = (id: string): Material => ({
  id,
  title: `Материал ${id}`,
  placement: 'desk',
  kind: 'sheet',
  body: `# Материал ${id}\nадрес zapros@bureau.org\n`,
  sourceFile: `${id}__x.md`,
});
const materials = ['01', '02'].map(mat);
const locked = [mat('L101'), mat('L999')];
const rules: AccessRules = {
  version: 1,
  attempt_limit: { ПАРОЛЬ: 3 },
  final_form: { release: 'L999' },
  rules: [
    {
      id: 'pw-safe',
      action: 'ПАРОЛЬ',
      target: 'сейф',
      accept: ['^верно$'],
      release: ['L101'],
      ok: 'Открыто.',
      fail: 'Неверно.',
      again: 'Уже выдано.',
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
let clock = 0;

beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(playerState);
  await db.delete(playerProgress);
  clock = 0;
});

const app = (production = false) =>
  createApp({ db, materials, production, engine, now: () => (clock += 1000) });
const post = (path: string, body: unknown, a = app()) =>
  a.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const ids = async (a = app()) =>
  ((await (await a.request('/api/materials')).json()) as Material[]).map((m) => m.id);

describe('движок правил на сервере', () => {
  it('до открытия закрытых материалов в браузере нет (P-10)', async () => {
    expect(await ids()).toEqual(['01', '02']);
  });

  it('верный пароль открывает материал: ответ правила и сам материал', async () => {
    const res = await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: string; reply: string; released: Material[] };
    expect(body.result).toBe('успех');
    expect(body.reply).toBe('Открыто.');
    expect(body.released.map((m) => m.id)).toEqual(['L101']);
    expect(await ids()).toEqual(['01', '02', 'L101']);
  });

  it('открытый материал ждёт во «Входящих» на столе — на стену сам не вешается', async () => {
    await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' });
    const state = (await (await app().request('/api/state')).json()) as PlayerState;
    expect(state.wall.items.some((i) => i.id === 'L101')).toBe(false);
    expect(inboxIds(state, [...materials, mat('L101')])).toEqual(['L101']);
  });

  it('неверный ввод — ответ правила; три неверных — лимит пакета, пауза 2 минуты (AC-5), отсчёт в ответе', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'нет' });
      const body = (await r.json()) as { result: string; wait: number };
      expect(body.result).toBe('отказ');
      expect(body.wait).toBe(i < 2 ? 0 : 2 * 60 * 1000);
    }
    const r = await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' });
    const body = (await r.json()) as { result: string; wait: number };
    expect(body.result).toBe('лимит');
    expect(body.wait).toBeGreaterThan(0);
  });

  it('клиент не может повесить на стену неоткрытый материал (P-10)', async () => {
    const s = defaultState(materials);
    s.wall.items.push({ id: 'L101', x: 0, y: 0, z: 99, rot: 0 });
    const res = await app().request('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
    });
    expect(res.status).toBe(400);
  });

  it('ЗВОНОК и неверный формат — 400', async () => {
    expect((await post('/api/action', { action: 'ЗВОНОК', target: '1', value: '' })).status).toBe(
      400,
    );
    expect((await post('/api/action', { foo: 1 })).status).toBe(400);
  });

  it('служебная строка действий (разработка): тот же движок', async () => {
    const res = await post('/api/dev/action-line', { line: 'ПАРОЛЬ | сейф | верно' });
    expect(((await res.json()) as { result: string }).result).toBe('успех');
    const bad = await post('/api/dev/action-line', { line: 'что-то' });
    expect(bad.status).toBe(400);
  });

  it('в production служебной строки нет', async () => {
    const res = await post('/api/dev/action-line', { line: 'ПАРОЛЬ | сейф | верно' }, app(true));
    expect(res.status).toBe(404);
  });

  it('DELETE /api/state сбрасывает и прогресс', async () => {
    await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' });
    await app().request('/api/state', { method: 'DELETE' });
    expect(await ids()).toEqual(['01', '02']);
  });

  it('два действия подряд не теряют друг друга', async () => {
    const a = app();
    await Promise.all([
      post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'нет' }, a),
      post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'нет' }, a),
    ]);
    const [row] = await db.select().from(playerProgress);
    expect(Object.values(row?.progress.fails ?? {})[0]?.n).toBe(2);
  });
});

describe('доставка и гонки', () => {
  it('чтение материалов не меняет прогресс и не затирает открытое действием', async () => {
    const a = app();
    await Promise.all([
      a.request('/api/materials'),
      post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' }, a),
      a.request('/api/materials'),
    ]);
    expect(await ids()).toEqual(['01', '02', 'L101']);
  });

  it('в production: ФИНАЛ и СТОП не принимаются, вида итога в ответе нет', async () => {
    const prod = app(true);
    expect((await post('/api/action', { action: 'СТОП', target: 'дело' }, prod)).status).toBe(400);
    const r = await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'нет' }, prod);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.result).toBeUndefined();
    expect(body.reply).toBe('Неверно.');
  });
});
