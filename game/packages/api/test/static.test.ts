import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import type { Db } from '../src/db/client.ts';

const dist = mkdtempSync(join(tmpdir(), 'bunker-web-'));
writeFileSync(join(dist, 'index.html'), '<div id="root"></div>');
writeFileSync(join(dist, 'sites.html'), '<div id="site"></div>');
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

  it('хост сайта дела (A-272): «/» и путь страницы → sites.html, файлы сборки — те же', async () => {
    const host = { host: 'vaultline-program.localhost:5173' };
    expect(await (await app.request('/', { headers: host })).text()).toContain('<div id="site">');
    expect(await (await app.request('/cabinet', { headers: host })).text()).toContain(
      '<div id="site">',
    );
    const js = await app.request('/assets/app.js', { headers: host });
    expect(js.headers.get('content-type')).toMatch(/javascript/);
  });

  it('неизвестный /api/… → 404, а не страница', async () => {
    expect((await app.request('/api/nope')).status).toBe(404);
  });

  it('выход за папку клиента не отдаёт чужие файлы', async () => {
    const res = await app.request('/../package.json');
    expect(await res.text()).not.toContain('"name"');
  });
});
