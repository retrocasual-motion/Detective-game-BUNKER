// Большая проверка RV-BC (26.11): «руки» проверяющего. Один процесс держит браузер открытым,
// команды приходят по HTTP с localhost — агент смотрит кадр, решает, действует.
//
//   node review/drive.mjs serve --port 9401 --name nb --viewport 1920x1080 [--motion] [--video]
//   node review/drive.mjs 9401 <команда> [аргументы…]
//
// Команды: reset <new|menu|mid|late|form> · shot [метка] · crop x y w h [метка] · click x y [right|dbl]
// · move x y · down [right] · up [right] · drag x1 y1 x2 y2 [шаги] [пауза_мс] · wheel dy [x y]
// · key K · keydown K · keyup K · type текст · wait мс · ui · text · eval js · console · stats
// · tabs · tab n · url · close

import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAW = 'E:/Projects/BUNKER-review-raw/2026-11-26';
const BASE = 'http://localhost:5184';
const argv = process.argv.slice(2);

if (argv[0] !== 'serve') {
  const [port, cmd, ...args] = argv;
  const r = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    body: JSON.stringify({ cmd, args }),
  }).catch((e) => ({ ok: false, text: async () => `нет связи с драйвером: ${e.message}` }));
  console.log(await r.text());
  process.exit(0);
}

const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i < 0 ? d : (argv[i + 1] ?? true);
};
const flag = (k) => argv.includes(`--${k}`);
const port = Number(opt('port', 9401));
const name = String(opt('name', `s${port}`));
const [vw, vh] = String(opt('viewport', '1920x1080')).split('x').map(Number);
const email = String(opt('email', `${name}@review.test`));
const dir = join(RAW, 'runs', name);
mkdirSync(join(dir, 'shots'), { recursive: true });

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({
  headless: !flag('headed'),
  args: [
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--use-angle=d3d11',
    '--enable-unsafe-swiftshader',
  ],
});
const context = await browser.newContext({
  baseURL: BASE,
  viewport: { width: vw, height: vh },
  reducedMotion: flag('motion') ? 'no-preference' : 'reduce',
  ...(flag('video')
    ? { recordVideo: { dir: join(dir, 'video'), size: { width: vw, height: vh } } }
    : {}),
});
await context.addInitScript(
  ([input, reduce]) => {
    localStorage.setItem('bunker.input', input);
    if (reduce) localStorage.setItem('bunker.reduceMotion', '1');
    else localStorage.removeItem('bunker.reduceMotion');
  },
  [String(opt('input', 'mouse')), !flag('motion')],
);
let page = await context.newPage();
const consoleLog = [];
const watch = (p) => {
  p.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()))
      consoleLog.push(`[${m.type()}] ${m.text()}`.slice(0, 500));
  });
  p.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`.slice(0, 500)));
  p.on('requestfailed', (r) =>
    consoleLog.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`),
  );
};
watch(page);
context.on('page', (p) => {
  watch(p);
});

// Счётчики: действия, путь мыши (px), время.
const stats = {
  clicks: 0,
  drags: 0,
  wheels: 0,
  keys: 0,
  moves: 0,
  path: 0,
  shots: 0,
  t0: Date.now(),
};
let pos = { x: vw / 2, y: vh / 2 };
const go = (x, y) => {
  stats.path += Math.hypot(x - pos.x, y - pos.y);
  pos = { x, y };
};
let n = 0;
const log = (o) =>
  appendFileSync(join(dir, 'actions.jsonl'), `${JSON.stringify({ t: Date.now(), ...o })}\n`);

async function clone(slice) {
  const req = createRequire(join(process.cwd(), '../api/package.json'));
  const pgMod = await import(pathToFileURL(req.resolve('postgres')).href);
  const sql = (pgMod.default ?? pgMod)('postgres://postgres:postgres@localhost:5444/bunker', {
    max: 1,
  });
  try {
    const [from] = await sql`select id from players where email = ${`seed-${slice}@review.test`}`;
    const [to] = await sql`select id from players where email = ${email}`;
    if (!from) throw new Error(`среза ${slice} нет (seed-${slice}@review.test)`);
    for (const t of ['player_state', 'player_progress', 'player_verdicts'])
      await sql.unsafe(`delete from ${t} where player_id = $1`, [to.id]);
    await sql`delete from pending_excerpts where player_id = ${to.id}`;
    await sql`insert into player_state (player_id, state, seq) select ${to.id}, state, seq from player_state where player_id = ${from.id}`;
    await sql`insert into player_progress (player_id, progress) select ${to.id}, progress from player_progress where player_id = ${from.id}`;
    await sql`insert into player_verdicts (player_id, result) select ${to.id}, result from player_verdicts where player_id = ${from.id}`;
  } finally {
    await sql.end();
  }
}

const C = {
  async reset(slice = 'new') {
    await page.request.post('/api/dev/login', { data: { email } });
    await page.request.delete('/api/state');
    if (!['new', 'menu'].includes(slice)) await clone(slice);
    await page.goto(slice === 'menu' ? '/' : '/?play');
    await page.waitForTimeout(2500);
    return `срез ${slice}, игрок ${email}`;
  },
  async shot(label = '') {
    n += 1;
    stats.shots += 1;
    const f = join(dir, 'shots', `${String(n).padStart(3, '0')}${label ? `-${label}` : ''}.png`);
    await page.screenshot({ path: f });
    return f;
  },
  async crop(x, y, w, h, label = 'crop') {
    n += 1;
    const f = join(dir, 'shots', `${String(n).padStart(3, '0')}-${label}.png`);
    await page.screenshot({ path: f, clip: { x: +x, y: +y, width: +w, height: +h } });
    return f;
  },
  async click(x, y, how) {
    go(+x, +y);
    stats.clicks += how === 'dbl' ? 2 : 1;
    if (how === 'dbl') await page.mouse.dblclick(+x, +y);
    else await page.mouse.click(+x, +y, { button: how === 'right' ? 'right' : 'left' });
    await page.waitForTimeout(400);
    return 'ok';
  },
  async move(x, y) {
    go(+x, +y);
    stats.moves += 1;
    await page.mouse.move(+x, +y, { steps: 8 });
    return 'ok';
  },
  async down(b) {
    await page.mouse.down({ button: b === 'right' ? 'right' : 'left' });
    return 'ok';
  },
  async up(b) {
    await page.mouse.up({ button: b === 'right' ? 'right' : 'left' });
    return 'ok';
  },
  async drag(x1, y1, x2, y2, steps = 15, hold = 0) {
    go(+x1, +y1);
    await page.mouse.move(+x1, +y1, { steps: 5 });
    await page.mouse.down();
    if (+hold) await page.waitForTimeout(+hold);
    go(+x2, +y2);
    await page.mouse.move(+x2, +y2, { steps: +steps });
    await page.mouse.up();
    stats.drags += 1;
    await page.waitForTimeout(400);
    return 'ok';
  },
  async wheel(dy, x, y) {
    if (x !== undefined) {
      go(+x, +y);
      await page.mouse.move(+x, +y);
    }
    await page.mouse.wheel(0, +dy);
    stats.wheels += 1;
    await page.waitForTimeout(250);
    return 'ok';
  },
  async key(k) {
    stats.keys += 1;
    await page.keyboard.press(k);
    await page.waitForTimeout(300);
    return 'ok';
  },
  async keydown(k) {
    await page.keyboard.down(k);
    return 'ok';
  },
  async keyup(k) {
    await page.keyboard.up(k);
    return 'ok';
  },
  async type(...t) {
    stats.keys += t.join(' ').length;
    await page.keyboard.type(t.join(' '), { delay: 30 });
    return 'ok';
  },
  async wait(ms = 500) {
    await page.waitForTimeout(+ms);
    return 'ok';
  },
  async ui() {
    return page.evaluate(() => {
      const out = [];
      const sel = 'button,a[href],input,textarea,select,[role],[data-testid],[tabindex]';
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        const name = (
          el.getAttribute('aria-label') ||
          el.textContent ||
          el.getAttribute('title') ||
          ''
        )
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 60);
        out.push(
          `${el.tagName.toLowerCase()}${el.dataset.testid ? `#${el.dataset.testid}` : ''}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} «${name}» @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}${el.disabled ? ' disabled' : ''}`,
        );
      }
      return out.slice(0, 250).join('\n');
    });
  },
  async text() {
    return (await page.evaluate(() => document.body.innerText)).slice(0, 6000);
  },
  async eval(...js) {
    const r = await page.evaluate(js.join(' '));
    return typeof r === 'string' ? r : JSON.stringify(r);
  },
  async console() {
    const out = consoleLog.splice(0).join('\n');
    return out || '(пусто)';
  },
  async stats() {
    return JSON.stringify({
      ...stats,
      path: Math.round(stats.path),
      seconds: Math.round((Date.now() - stats.t0) / 1000),
    });
  },
  async statsreset() {
    Object.assign(stats, {
      clicks: 0,
      drags: 0,
      wheels: 0,
      keys: 0,
      moves: 0,
      path: 0,
      shots: 0,
      t0: Date.now(),
    });
    return 'ok';
  },
  async tabs() {
    return context
      .pages()
      .map((p, i) => `${i}${p === page ? '*' : ''} ${p.url()}`)
      .join('\n');
  },
  async tab(i) {
    page = context.pages()[+i] ?? page;
    await page.bringToFront();
    return page.url();
  },
  async url() {
    return page.url();
  },
  async close() {
    await context.close();
    await browser.close();
    setTimeout(() => process.exit(0), 200);
    return 'закрыто';
  },
};

let busy = Promise.resolve();
createServer((req, res) => {
  let body = '';
  req.on('data', (d) => {
    body += d;
  });
  req.on('end', () => {
    busy = busy.then(async () => {
      let out;
      try {
        const { cmd, args = [] } = JSON.parse(body || '{}');
        if (!C[cmd]) throw new Error(`нет команды ${cmd}`);
        log({ cmd, args });
        out = await C[cmd](...args);
      } catch (e) {
        out = `ОШИБКА: ${e.message}`.slice(0, 1500);
      }
      res.end(String(out));
    });
  });
}).listen(port, '127.0.0.1', () => console.log(`drive ${name} :${port} ${vw}x${vh} ${email}`));
