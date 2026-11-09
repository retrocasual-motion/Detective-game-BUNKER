import { defaultState, type Material, type PlayerState } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { connectDb, type Db, migrateDb, playerState } from '../src/db/client.ts';

const mat = (id: string, placement: Material['placement'] = 'desk'): Material => ({
  id,
  title: `Материал ${id}`,
  placement,
  kind: 'sheet',
  body: `# Материал ${id}\n`,
  sourceFile: `${id}__x.md`,
});
const materials = Array.from({ length: 51 }, (_, i) => String(i + 1).padStart(2, '0')).map((id) =>
  mat(id, ['24', '47', '48', '49', '50'].includes(id) ? 'evidence' : 'desk'),
);

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(playerState);
});

const app = (production = false) => createApp({ db, materials, production });
const put = (body: unknown) =>
  app().request('/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('API', () => {
  it('GET /api/health → ok', async () => {
    const res = await app().request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET /api/health → 503, пока база не готова', async () => {
    const res = await createApp({ db, materials, production: false, isReady: () => false }).request(
      '/api/health',
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('пока база не готова, /api/state и /api/materials → 503', async () => {
    const notReady = createApp({ db, materials, production: false, isReady: () => false });
    expect((await notReady.request('/api/state')).status).toBe(503);
    expect((await notReady.request('/api/materials')).status).toBe(503);
  });

  it('старое сохранение, пришедшее позже нового, не затирает его', async () => {
    const newer = defaultState(materials);
    newer.view = 'wall';
    const older = defaultState(materials);
    older.view = 'desk';
    const send = (s: PlayerState, seq: number) =>
      app().request('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-state-seq': String(seq) },
        body: JSON.stringify(s),
      });
    expect((await send(newer, 2000)).status).toBe(204);
    expect((await send(older, 1000)).status).toBe(204);
    expect(((await (await app().request('/api/state')).json()) as PlayerState).view).toBe('wall');
  });

  it('GET /api/materials → 51 материал', async () => {
    const res = await app().request('/api/materials');
    expect(((await res.json()) as Material[]).length).toBe(51);
  });

  it('GET /api/state без сохранения → defaultState', async () => {
    const res = await app().request('/api/state');
    expect(await res.json()).toEqual(defaultState(materials));
  });

  it('PUT → GET возвращает сохранённое', async () => {
    const s = defaultState(materials);
    s.view = 'wall';
    s.wall.items = s.wall.items.map((i) => (i.id === '01' ? { ...i, x: 777, y: -50 } : i));
    s.wall.items.push({ id: 'n:q', x: 10, y: 10, z: 101, rot: 0 });
    s.wall.notes.push({ id: 'n:q', kind: 'note', text: 'кто звонил?' });
    s.wall.threads.push({ id: 't', from: 'n:q', to: 'p:cole', label: 'ключ?' });
    expect((await put(s)).status).toBe(204);
    expect(await (await app().request('/api/state')).json()).toEqual(s);
  });

  it('PUT с масштабом вне 0.25…3 → 400', async () => {
    const s = defaultState(materials);
    s.wall.camera.zoom = 10;
    expect((await put(s)).status).toBe(400);
  });

  it('PUT с неизвестным материалом → 400', async () => {
    const s = defaultState(materials);
    s.wall.items.push({ id: 'L214', x: 0, y: 0, z: 1, rot: 0 });
    expect((await put(s)).status).toBe(400);
  });

  it('PUT с письмом в корзине, которого у игрока нет → 400 (TR-A)', async () => {
    const s = defaultState(materials);
    s.trash = ['M001'];
    expect((await put(s)).status).toBe(400);
  });

  it('PUT с нитью на неизвестное или записка без текста в notes → 400', async () => {
    const a = defaultState(materials);
    a.wall.threads.push({ id: 't', from: '01', to: 'L214', label: '' });
    expect((await put(a)).status).toBe(400);
    const b = defaultState(materials);
    b.wall.items.push({ id: 'n:x', x: 0, y: 0, z: 1, rot: 0 });
    expect((await put(b)).status).toBe(400);
  });

  it('GET выкидывает материал, которого больше нет в контенте', async () => {
    const s: PlayerState = defaultState(materials);
    s.wall.items.push({ id: '99', x: 9000, y: 9000, z: 999, rot: 0 });
    await db.insert(playerState).values({ playerId: 'local', state: s });
    const got = (await (await app().request('/api/state')).json()) as PlayerState;
    expect(got.wall.items.some((i) => i.id === '99')).toBe(false);
  });

  it('GET: сохранение стола сверху и доски с копиями (версия 3) — раскладка заново', async () => {
    const v3 = { version: 3, view: 'right', desk: { items: [] }, board: { items: [] } };
    // Колонка типизирована текущей версией; старую кладём как есть.
    await db.insert(playerState).values({ playerId: 'local', state: v3 as unknown as PlayerState });
    const got = (await (await app().request('/api/state')).json()) as PlayerState;
    expect(got).toEqual(defaultState(materials));
  });

  it('DELETE → следующий GET = defaultState', async () => {
    const s = defaultState(materials);
    s.view = 'wall';
    await put(s);
    expect((await app().request('/api/state', { method: 'DELETE' })).status).toBe(204);
    expect(await (await app().request('/api/state')).json()).toEqual(defaultState(materials));
  });

  it('DELETE в production → 404', async () => {
    expect((await app(true).request('/api/state', { method: 'DELETE' })).status).toBe(404);
  });
});
