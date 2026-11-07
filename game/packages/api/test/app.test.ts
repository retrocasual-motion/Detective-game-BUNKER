import { defaultState, type Material, type PlayerState } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { connectDb, type Db, migrateDb, playerState } from '../src/db/client.ts';

const mat = (id: string, placement: Material['placement'] = 'desk'): Material => ({
  id,
  title: `Материал ${id}`,
  placement,
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
    newer.view = 'right';
    const older = defaultState(materials);
    older.view = 'left';
    const send = (s: PlayerState, seq: number) =>
      app().request('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-state-seq': String(seq) },
        body: JSON.stringify(s),
      });
    expect((await send(newer, 2000)).status).toBe(204);
    expect((await send(older, 1000)).status).toBe(204);
    expect(((await (await app().request('/api/state')).json()) as PlayerState).view).toBe('right');
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
    s.view = 'right';
    s.desk.items[0] = { materialId: '01', x: 777, y: -50, z: 100 };
    expect((await put(s)).status).toBe(204);
    expect(await (await app().request('/api/state')).json()).toEqual(s);
  });

  it('PUT с масштабом вне 0.25…3 → 400', async () => {
    const s = defaultState(materials);
    s.desk.camera.zoom = 10;
    expect((await put(s)).status).toBe(400);
  });

  it('PUT с неизвестным материалом → 400', async () => {
    const s = defaultState(materials);
    s.desk.items.push({ materialId: 'L214', x: 0, y: 0, z: 1 });
    expect((await put(s)).status).toBe(400);
  });

  it('PUT с устройством на столе → 400', async () => {
    const s = defaultState(materials);
    s.desk.items.push({ materialId: '47', x: 0, y: 0, z: 1 });
    expect((await put(s)).status).toBe(400);
  });

  it('GET выкидывает материал, которого больше нет в контенте', async () => {
    const s: PlayerState = defaultState(materials);
    s.desk.items.push({ materialId: '99', x: 9000, y: 9000, z: 999 });
    await db.insert(playerState).values({ playerId: 'local', state: s });
    const got = (await (await app().request('/api/state')).json()) as PlayerState;
    expect(got.desk.items.some((i) => i.materialId === '99')).toBe(false);
  });

  it('DELETE → следующий GET = defaultState', async () => {
    const s = defaultState(materials);
    s.view = 'left';
    await put(s);
    expect((await app().request('/api/state', { method: 'DELETE' })).status).toBe(204);
    expect(await (await app().request('/api/state')).json()).toEqual(defaultState(materials));
  });

  it('DELETE в production → 404', async () => {
    expect((await app(true).request('/api/state', { method: 'DELETE' })).status).toBe(404);
  });
});
