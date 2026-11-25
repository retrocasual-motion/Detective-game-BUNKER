import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MEDIA } from '@bunker/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Db } from '../src/db/client.ts';

const dir = mkdtempSync(join(tmpdir(), 'bunker-media-'));
const sticker = MEDIA['sticker-47']?.path ?? '';
mkdirSync(join(dir, dirname(sticker)), { recursive: true });
writeFileSync(join(dir, sticker), 'PNG');
// Черновик рядом — его в списке нет, отдавать нельзя (A-226).
writeFileSync(join(dir, dirname(sticker), 'P-A_Z2_sticker_v1.png'), 'утечка');

// Без входа (AUTH=off): маршрут медиа базу не трогает.
const app = createApp({ db: {} as Db, materials: [], production: true, mediaDir: dir });
const none = createApp({
  db: {} as Db,
  materials: [],
  production: true,
  mediaDir: join(dir, 'нет'),
});

describe('медиа из bunker-media (T-…)', () => {
  it('файл из списка — с типом', async () => {
    const res = await app.request('/api/media/sticker-47');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await res.text()).toBe('PNG');
  });

  it('чего нет в списке — 404: ни черновик по имени, ни путь, ни свойство объекта', async () => {
    for (const p of [
      '/api/media/P-A_Z2_sticker_v1.png',
      '/api/media/..%2F..%2Fpackage.json',
      '/api/media/constructor',
      '/api/media/toString',
    ])
      expect((await app.request(p)).status).toBe(404);
  });

  it('нет папки медиа (CI) — 404, игра рисует заглушку', async () => {
    expect((await none.request('/api/media/sticker-47')).status).toBe(404);
  });
});
