import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Db } from '../src/db/client.ts';

const dist = mkdtempSync(join(tmpdir(), 'bunker-web-'));
writeFileSync(join(dist, 'index.html'), '<div id="root"></div>');
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');

// Маршруты статики базу не трогают.
const app = createApp({ db: {} as Db, materials: [], production: true, webDist: dist });

describe('отдача собранного клиента (production)', () => {
  it('/ → index.html', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });

  it('файл из assets отдаётся с типом JavaScript', async () => {
    const res = await app.request('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/javascript/);
  });

  it('неизвестный путь страницы → index.html', async () => {
    expect(await (await app.request('/desk')).text()).toContain('<div id="root">');
  });

  it('сайты дела — в игре (A-288 п. 9): хост вида сайта отдаёт ту же игру', async () => {
    const host = { host: 'vaultline-program.localhost:5173' };
    expect(await (await app.request('/', { headers: host })).text()).toContain('<div id="root">');
  });

  it('неизвестный /api/… → 404, а не страница', async () => {
    expect((await app.request('/api/nope')).status).toBe(404);
  });

  it('выход за папку клиента не отдаёт чужие файлы', async () => {
    const res = await app.request('/../package.json');
    expect(await res.text()).not.toContain('"name"');
  });
});
