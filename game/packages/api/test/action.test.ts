import type { AccessRules } from '@bunker/engine';
import { defaultState, type Material, type PlayerState } from '@bunker/shared';
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
  address_book: true,
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
    {
      id: 'pet',
      action: 'ХОДАТАЙСТВО',
      target: '^zapros@bureau\\.org$',
      cards: [[{ file: '^01$', quote: 'материал' }]],
      release: [],
      ok: 'Бюро ответило.',
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

  it('открытый материал ложится в лоток «Входящие» на столе', async () => {
    await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' });
    const state = (await (await app().request('/api/state')).json()) as PlayerState;
    expect(state.desk.items.find((i) => i.materialId === 'L101')?.tray).toBe(true);
  });

  it('неверный ввод — ответ правила; три неверных — лимит', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'нет' });
      expect(((await r.json()) as { result: string }).result).toBe('отказ');
    }
    const r = await post('/api/action', { action: 'ПАРОЛЬ', target: 'сейф', value: 'верно' });
    expect(((await r.json()) as { result: string }).result).toBe('лимит');
  });

  it('клиент не может положить на стол неоткрытый материал (P-10)', async () => {
    const s = defaultState(materials);
    s.desk.items.push({ materialId: 'L101', x: 0, y: 0, z: 99, rot: 0 });
    const res = await app().request('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
    });
    expect(res.status).toBe(400);
  });

  it('ходатайство карточками: ответ правила', async () => {
    const res = await post('/api/action', {
      action: 'ХОДАТАЙСТВО',
      target: 'zapros@bureau.org',
      cards: [
        { file: '01', quote: 'Материал 01' },
        { file: '02', quote: 'Материал 02' },
      ],
    });
    expect(((await res.json()) as { result: string; reply: string }).reply).toBe('Бюро ответило.');
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
