// Вёрстка → картинка (Playwright). Слои рендерятся отдельно, чтобы сборка накладывала их умножением.
// node render.js <doc.html> <out_prefix> [seed] [scale]
//   пишет <out_prefix>_print.png, _cole.png, _miller.png … (по классам .L-* в вёрстке),
//   <out_prefix>_all.png и <out_prefix>_boxes.json (рамки [data-keep] в пикселях картинки).
// Playwright: если нет в окружении — берётся из game/node_modules (pnpm).
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.resolve(__dirname, '../../../game/node_modules/.pnpm/playwright@1.65.0/node_modules/playwright'))); }
const fs = require('fs');
(async () => {
  const [html, prefix, seed = '1', scale = '2'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: +scale });
  const url = 'file:///' + path.resolve(html).replace(/\\/g, '/');
  await p.goto(url + `#layer=all&seed=${seed}`);
  await p.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
  const layers = await p.evaluate(() => [...new Set([...document.querySelectorAll('[class*="L-"]')]
    .flatMap(e => [...e.classList].filter(c => c.startsWith('L-')).map(c => c.slice(2))))]);
  const boxes = await p.evaluate(s => [...document.querySelectorAll('[data-keep]')].map(e => {
    const r = e.getBoundingClientRect();
    return { id: e.dataset.keep, x: r.x * s, y: r.y * s, w: r.width * s, h: r.height * s };
  }), +scale);
  for (const L of ['all', ...layers]) {
    await p.evaluate(L => { document.body.dataset.layer = L; }, L);
    await p.screenshot({ path: `${prefix}_${L}.png` });
  }
  fs.writeFileSync(`${prefix}_boxes.json`, JSON.stringify({ layers, boxes, scale: +scale }, null, 1));
  await b.close();
  console.log('layers:', layers.join(', '));
})();
