import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type Material, MEDIA } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { connectDb, type Db, migrateDb, playerProgress, playerState } from '../src/db/client.ts';

const dir = mkdtempSync(join(tmpdir(), 'bunker-media-'));
const sticker = MEDIA['sticker-47']?.path ?? '';
mkdirSync(join(dir, dirname(sticker)), { recursive: true });
writeFileSync(join(dir, sticker), 'PNG-0123456789');
// Черновик рядом — его в списке нет, отдавать нельзя (A-226).
writeFileSync(join(dir, dirname(sticker), 'P-A_Z2_sticker_v1.png'), 'утечка');

const mat = (id: string): Material => ({
  id,
  title: id,
  placement: id === '47' ? 'evidence' : 'desk',
  kind: 'sheet',
  body: `# ${id}\n`,
  sourceFile: `${id}__x.md`,
});
const materials = [mat('01'), mat('47')];

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(playerProgress);
  await db.delete(playerState);
});

const app = (mediaDir = dir) => createApp({ db, materials, production: false, mediaDir });
/** Ноутбук (47) пришёл из камеры хранения (SD5-A). */
const withLaptop = async (a: ReturnType<typeof app>) => {
  await a.request('/api/dev/delivery', { method: 'POST' });
  return a;
};

describe('медиа из bunker-media (T-…; RV-67)', () => {
  it('файл из списка — с типом, когда его вещь у игрока', async () => {
    const a = await withLaptop(app());
    const res = await a.request('/api/media/sticker-47');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe('PNG-0123456789');
  });

  it('вещи у игрока ещё нет — 404 (P-10)', async () => {
    expect((await app().request('/api/media/sticker-47')).status).toBe(404);
  });

  it('Range: кусок файла — 206 с Content-Range; за концом — 416', async () => {
    const a = await withLaptop(app());
    const part = await a.request('/api/media/sticker-47', { headers: { range: 'bytes=4-7' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 4-7/14');
    expect(await part.text()).toBe('0123');
    const tail = await a.request('/api/media/sticker-47', { headers: { range: 'bytes=-4' } });
    expect(await tail.text()).toBe('6789');
    const out = await a.request('/api/media/sticker-47', { headers: { range: 'bytes=99-' } });
    expect(out.status).toBe(416);
  });

  it('чего нет в списке — 404: ни черновик по имени, ни путь, ни свойство объекта', async () => {
    const a = await withLaptop(app());
    for (const p of [
      '/api/media/P-A_Z2_sticker_v1.png',
      '/api/media/..%2F..%2Fpackage.json',
      '/api/media/constructor',
      '/api/media/toString',
    ])
      expect((await a.request(p)).status).toBe(404);
  });

  it('нет папки медиа (CI) — 404, игра рисует заглушку', async () => {
    const a = await withLaptop(app(join(dir, 'нет')));
    expect((await a.request('/api/media/sticker-47')).status).toBe(404);
  });
});
