import type { AccessRules } from '@bunker/engine';
import { defaultState, type Material, type PlayerState } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import {
  connectDb,
  type Db,
  migrateDb,
  playerLetters,
  playerProgress,
  playerState,
} from '../src/db/client.ts';

const mat = (id: string, body = `# Материал ${id}\nадрес zapros@bureau.org\n`): Material => ({
  id,
  title: `Материал ${id}`,
  placement: 'desk',
  kind: 'sheet',
  body,
  sourceFile: `${id}__x.md`,
});
const materials = [mat('01'), mat('02', '# Материал 02\nкоды 05, 07\n')];
const locked = [mat('L101'), mat('L999')];
const rules: AccessRules = {
  version: 1,
  attempt_limit: { ХОДАТАЙСТВО: 3 },
  address_book: true,
  final_form: { release: 'L999' },
  rules: [
    {
      id: 'pet-vl-multi-codes',
      action: 'ХОДАТАЙСТВО',
      target: '^zapros@bureau\\.org$',
      cards: [[{ file: '^02$', quote: '05, 07' }]],
      release: [],
      ok: 'Бюро: укажите один код.',
      refusal: true,
      early: true,
    },
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

beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(playerState);
  await db.delete(playerProgress);
  await db.delete(playerLetters);
  clock = 1_000_000;
});

const app = (production = false) =>
  createApp({ db, materials, production, engine, now: () => clock, mailDelayMs: 60_000 });
const post = (path: string, body: unknown, a = app()) =>
  a.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const send = (askFile: string, a = app()) =>
  post(
    '/api/petition',
    {
      to: 'zapros@bureau.org',
      ask: { file: askFile, quote: `Материал ${askFile}` },
      basis: { file: '02', quote: 'Материал 02' },
    },
    a,
  );
const list = async (a = app()) => (await (await a.request('/api/materials')).json()) as Material[];

describe('ходатайство из папки (этап 3)', () => {
  it('ответ — письмом через задержку; до неё ни письма, ни вложений в браузере нет (P-10)', async () => {
    const res = await send('01');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 1, delayMs: 60_000 });
    expect((await list()).map((m) => m.id)).toEqual(['01', '02']);
    expect(await (await app().request('/api/mail/pending')).json()).toEqual({ inMs: [60_000] });

    clock += 60_000;
    const got = await list();
    expect(got.map((m) => m.id)).toEqual(['01', '02', 'L101', 'M001']);
    const letter = got.find((m) => m.id === 'M001');
    expect(letter?.kind).toBe('letter');
    expect(letter?.title).toBe('Ответ на ходатайство № 1');
    expect(letter?.body).toContain('Бюро: направляем приложение.');
    expect(letter?.body).toContain('**Вложения:** L101');
    expect(letter?.body).toContain('Прошу: 01 — «Материал 01»');
  });

  it('пришедшее ждёт во «Входящих» на столе: письмо впереди вложений', async () => {
    await send('01');
    clock += 60_000;
    const state = (await (await app().request('/api/state')).json()) as PlayerState;
    expect(state.wall.items.some((i) => i.id === 'M001' || i.id === 'L101')).toBe(false);
  });

  it('ошибка оформления (FORM-B) — сразу ответом 422, письма нет, попытка не тратится', async () => {
    const res = await post('/api/petition', {
      to: 'zapros@bureau.org',
      ask: { file: '02', quote: 'коды 05, 07' },
      basis: { file: '02', quote: 'Материал 02' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Бюро: укажите один код.' });
    expect(await db.select().from(playerLetters)).toEqual([]);
    const [row] = await db.select().from(playerProgress);
    expect(row).toBeUndefined();
  });

  it('карточка, которой нет в файле, и адрес не из книги — ошибка оформления', async () => {
    const a = await post('/api/petition', {
      to: 'zapros@bureau.org',
      ask: { file: '01', quote: 'такой строки нет совсем' },
      basis: { file: '02', quote: 'Материал 02' },
    });
    expect(a.status).toBe(422);
    const b = await post('/api/petition', {
      to: 'other@nowhere.org',
      ask: { file: '01', quote: 'Материал 01' },
      basis: { file: '02', quote: 'Материал 02' },
    });
    expect(b.status).toBe(422);
    expect(((await b.json()) as { error: string }).error).toMatch(/адресной книге/);
  });

  it('карточка из неоткрытого материала — 422 (P-10)', async () => {
    const res = await post('/api/petition', {
      to: 'zapros@bureau.org',
      ask: { file: 'L101', quote: 'Материал L101' },
      basis: { file: '02', quote: 'Материал 02' },
    });
    expect(res.status).toBe(422);
  });

  it('номера писем идут подряд; карточка из письма M… доходит до движка как «почта»', async () => {
    await send('01');
    clock += 60_000;
    const res = await post('/api/petition', {
      to: 'zapros@bureau.org',
      ask: { file: '01', quote: 'Материал 01' },
      basis: { file: 'M001', quote: 'Бюро: направляем приложение.' },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { n: number }).n).toBe(2);
  });

  it('в production ходатайство через /api/action не принимается — только папкой', async () => {
    const res = await post(
      '/api/action',
      {
        action: 'ХОДАТАЙСТВО',
        target: 'zapros@bureau.org',
        cards: [
          { file: '01', quote: 'Материал 01' },
          { file: '02', quote: 'Материал 02' },
        ],
      },
      app(true),
    );
    expect(res.status).toBe(400);
  });

  it('черновик с карточкой из неоткрытого материала не сохраняется (P-10)', async () => {
    const s = defaultState(materials);
    s.drafts = [{ id: 'd1', to: null, ask: { file: 'L101', quote: 'x' }, basis: null }];
    const res = await app().request('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/state убирает и письма', async () => {
    await send('01');
    await app().request('/api/state', { method: 'DELETE' });
    expect(await db.select().from(playerLetters)).toEqual([]);
  });
});
