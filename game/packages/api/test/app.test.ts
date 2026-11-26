import { defaultState, type Material, type PlayerState } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import {
  connectDb,
  type Db,
  migrateDb,
  playerState,
  playerStateBackups,
} from '../src/db/client.ts';

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
  await db.delete(playerStateBackups);
});

const app = (production = false) => createApp({ db, materials, production });
/** Страница игры (писатель, волна 1): открыть дело — GET с номером страницы. */
const W = 'page-aaaa-1';
let n = 0;
const claim = (w = W) => app().request('/api/state', { headers: { 'x-state-writer': w } });
const send = (body: unknown, w = W, seq = ++n) =>
  app().request('/api/state', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-state-writer': w,
      'x-state-seq': String(seq),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const put = async (body: unknown) => {
  await claim();
  return send(body);
};
const read = async () => (await (await app().request('/api/state')).json()) as PlayerState;

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

  it('старое сохранение, пришедшее позже нового, не затирает его (счётчик страницы, не часы)', async () => {
    const newer = defaultState(materials);
    newer.view = 'wall';
    const older = defaultState(materials);
    older.view = 'desk';
    await claim();
    expect((await send(newer, W, 2)).status).toBe(204);
    expect((await send(older, W, 1)).status).toBe(204);
    expect((await read()).view).toBe('wall');
  });

  it('RV-48: номер — счётчик страницы; часы устройства не участвуют', async () => {
    const s = defaultState(materials);
    s.view = 'wall';
    await claim();
    // Страница с «убежавшими» часами прежней сборки слала бы огромный номер — здесь счётчик с 1.
    expect((await send(s, W, 1)).status).toBe(204);
    s.view = 'desk';
    expect((await send(s, W, 2)).status).toBe(204);
    expect((await read()).view).toBe('desk');
  });

  it('DEV-A: дело открыли на другом устройстве — прежнее получает 409, новое пишет', async () => {
    const s = defaultState(materials);
    await claim('page-old-1');
    expect((await send(s, 'page-old-1', 1)).status).toBe(204);
    await claim('page-new-1');
    s.view = 'wall';
    expect((await send(s, 'page-new-1', 1)).status).toBe(204);
    s.view = 'desk';
    expect((await send(s, 'page-old-1', 99)).status).toBe(409);
    expect((await read()).view).toBe('wall');
  });

  it('сборка без номера страницы не пишет (409)', async () => {
    await claim();
    const res = await app().request('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-state-seq': '5' },
      body: JSON.stringify(defaultState(materials)),
    });
    expect(res.status).toBe(409);
  });

  it('RV-51: после «Нового дела» запоздавшее сохранение старого дела — 409', async () => {
    const s = defaultState(materials);
    s.view = 'wall';
    await claim();
    expect((await app().request('/api/new-case', { method: 'POST' })).status).toBe(204);
    expect((await send(s)).status).toBe(409);
    expect((await read()).view).toBe('desk');
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

  it('RV-50: масштаб вне 0.2…3 — камера по умолчанию, остальное сохранено (не тупик 400)', async () => {
    const s = defaultState(materials);
    s.view = 'wall';
    s.wall.camera.zoom = 10;
    expect((await put(s)).status).toBe(204);
    const got = await read();
    expect(got.view).toBe('wall');
    expect(got.wall.camera.zoom).toBeLessThanOrEqual(3);
  });

  it('P-10: неоткрытый материал на стене не сохраняется, остальное — да', async () => {
    const s = defaultState(materials);
    s.view = 'wall';
    s.wall.items.push({ id: 'L214', x: 0, y: 0, z: 1, rot: 0 });
    expect((await put(s)).status).toBe(204);
    const got = await read();
    expect(got.wall.items.some((i) => i.id === 'L214')).toBe(false);
    expect(got.view).toBe('wall');
  });

  it('RV-16, RV-55: нить на неизвестное и записка без текста выпадают, сохранение проходит', async () => {
    const a = defaultState(materials);
    a.wall.threads.push({ id: 't', from: '01', to: 'x:gone', label: '' });
    a.wall.items.push({ id: 'n:x', x: 0, y: 0, z: 1, rot: 0 });
    a.joined = ['L990'];
    expect((await put(a)).status).toBe(204);
    const got = await read();
    expect(got.wall.threads).toEqual([]);
    expect(got.wall.items.some((i) => i.id === 'n:x')).toBe(false);
    expect(got.joined ?? []).toEqual([]);
  });

  it('PUT не сохранения (не объект) → 400', async () => {
    await claim();
    expect((await send('"строка"')).status).toBe(400);
  });

  it('RV-53: полный блокнот (300 страниц кириллицей) принимается', async () => {
    const s = defaultState(materials);
    s.notebookPages = Array.from({ length: 300 }, () => 'ж'.repeat(4000));
    expect((await put(s)).status).toBe(204);
    expect((await read()).notebookPages).toHaveLength(300);
  });

  it('RV-49: сохранение с одним неверным значением — дело остаётся, копия прежнего — в запасе', async () => {
    const s = defaultState(materials);
    s.view = 'wall';
    const broken = { ...s, opened: ['scene', 'нет-такого'], notebookPages: ['моя запись', 5] };
    await db
      .insert(playerState)
      .values({ playerId: 'local', state: broken as unknown as PlayerState });
    const got = await read();
    expect(got.view).toBe('wall');
    expect(got.notebookPages).toEqual(['моя запись']);
    const backups = await db.select().from(playerStateBackups);
    expect(backups).toHaveLength(1);
    // Прочитанное записано сразу — второй раз копия не делается.
    await read();
    expect(await db.select().from(playerStateBackups)).toHaveLength(1);
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
    // Нечитаемое прежнее — в запасе (RV-49).
    expect(await db.select().from(playerStateBackups)).toHaveLength(1);
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
