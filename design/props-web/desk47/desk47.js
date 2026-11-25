// desk47.js — проба «стол следователя»: стол, зелёная лампа, ноутбук № 47.
// Свет мировой: лампа стоит на столе, вещь в руках поворачивается под той же лампой.
// Кадр рисуется только по требованию (ввод, анимация, догрузка) — как решение D3-12 в игре.
//
// Адрес: #view=desk|inspect|inspect_bottom|inspect_side|lampoff|close   служебные ракурсы (без анимации)
//        #bake=0   всё вживую, ни одной запечённой текстуры света
//        (нет)     гибрид (рекомендация): свет вживую + запечённые пятна касания под вещами
//        #bake=1   свет стола запечён в текстуру (с подменой при подъёме вещи) + пятна касания
//        #stats=1  цифры на экране; #low=1|0 — режим телефона принудительно; #bench=N — замер N кадров
//        #act=pick,put,lamp,lid,flip,home — действия по очереди; #ry=…&rx=… — довернуть вещь в руках (градусы)
//        #lx=…&lz=… — поставить лампу; #exp=… — экспозиция

import * as THREE from 'three';
import { buildLaptop47 } from './laptop47.js';

// ---------- размеры (метры; верх столешницы y = 0; x — вправо, z — от стены к игроку) ----------
// Стол и камера — как в игре (room/camera.ts): стол 2,2 × 0,9 м, глаз в 0,5 м над столом
// и в 0,45 м позади ближнего края; вещи стола уменьшены в 0,89 (ITEM_SCALE).
const DESK = { x0: -1.15, x1: 1.05, z0: 0, z1: 0.9, t: 0.04, floor: -0.75 };
const ITEM_SCALE = 0.89;
const EYE = { y: 0.5, z: DESK.z1 + 0.45 };
const BOARD = { w: 1.1, h: 0.69, y0: 0.12 };            // доска на стене: низ на 12 см выше стола
const LAPTOP_REST = { x: 0.04, z: 0.47, yaw: 0.07, y: 0.002 };
// Лампа — слева от вещи и на одной глубине с ней: свет идёт сбоку-спереди. У стены (как LAMP_AT в игре) она светит
// в спину поднятой вещи — см. NOTES.
const LAMP_REST = { x: -0.41, z: 0.46, yaw: 0.95 };
const HOLD = new THREE.Vector3(0.0, 0.205, 0.41);     // где вещь «в руках»
const LID_OPEN = 1.92;
const TRANSITION_MS = 600;                              // как TRANSITION_MS в игре
const CLICK_PX = 5;
const ROT_PER_PX = 0.007;

const rngFactory = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const ease = (t) => (1 - Math.cos(Math.PI * clamp(t, 0, 1))) / 2;     // easeCamera из игры
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const qOf = (x, y, z, order = 'YXZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));

// высота -> карта нормалей
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h), octx = out.getContext('2d'), img = octx.createImageData(w, h), d = img.data, k = strength / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x + w - 1) % w, xr = (x + 1) % w, yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    const dx = (src[(y * w + xr) * 4] - src[(y * w + xl) * 4]) * k, dy = (src[(yd * w + x) * 4] - src[(yu * w + x) * 4]) * k;
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * w + x) * 4;
    d[i] = (-dx * inv * 0.5 + 0.5) * 255; d[i + 1] = (dy * inv * 0.5 + 0.5) * 255; d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// ---------- дерево столешницы: три доски, волокна вдоль длины, лак с потёртостью у ближнего края ----------
function makeWood(w, h) {
  const rng = rngFactory(2009), rr = (a, b) => a + (b - a) * rng();
  const cc = mkCanvas(w, h), hc = mkCanvas(w, h), rc = mkCanvas(w / 2, h / 2);
  const c = cc.getContext('2d'), g = hc.getContext('2d', { willReadFrequently: true }), r = rc.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  r.fillStyle = 'rgb(0,104,0)'; r.fillRect(0, 0, w / 2, h / 2);        // шероховатость ≈ 0,41 (лак)
  r.scale(0.5, 0.5);
  const boards = [0, 0.31, 0.66, 1];
  const tones = ['#3b2415', '#42291a', '#372113'];
  for (let b = 0; b < 3; b++) {
    const y0 = boards[b] * h, y1 = boards[b + 1] * h;
    c.save(); c.beginPath(); c.rect(0, y0, w, y1 - y0); c.clip();
    c.fillStyle = tones[b]; c.fillRect(0, y0, w, y1 - y0);
    for (let i = 0; i < 26; i++) {                                      // широкие полосы тона
      const y = rr(y0, y1), hh = rr(0.01, 0.05) * h;
      const gr = c.createLinearGradient(0, y - hh, 0, y + hh);
      const col = rng() < 0.5 ? '18,9,4' : '110,66,34', a = rr(0.06, 0.2);
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.5, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = gr; c.fillRect(0, y - hh, w, hh * 2);
    }
    const n = Math.round(2600 * (y1 - y0) / h * (w / 2048));
    for (let i = 0; i < n * 3; i++) {                                   // волокна
      const y = rr(y0, y1), x = rr(-0.2, 1) * w, len = rr(0.05, 0.6) * w, dy = rr(-1, 1) * h * 0.006;
      const dark = rng() < 0.62, a = dark ? rr(0.04, 0.2) : rr(0.02, 0.09), lw = rr(0.5, 1.8) * (w / 2048);
      for (const [ctx, style] of [[c, dark ? `rgba(14,7,3,${a})` : `rgba(150,98,54,${a})`], [g, dark ? `rgba(96,96,96,${a * 2.2})` : `rgba(160,160,160,${a * 2})`]]) {
        ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + len * 0.33, y + dy, x + len * 0.66, y - dy, x + len, y + dy * 0.5); ctx.stroke();
      }
    }
    for (let i = 0; i < 300 * (w / 2048); i++) {                        // короткие тёмные поры
      const y = rr(y0, y1), x = rr(0, w), len = rr(4, 22) * (w / 2048);
      c.strokeStyle = `rgba(10,5,2,${rr(0.15, 0.4)})`; c.lineWidth = rr(0.6, 1.2); c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + rr(-0.6, 0.6)); c.stroke();
    }
    c.restore();
  }
  for (let b = 1; b < 3; b++) {                                         // стыки досок
    const y = boards[b] * h;
    c.fillStyle = 'rgba(8,4,2,0.75)'; c.fillRect(0, y - 0.8, w, 1.6);
    g.fillStyle = 'rgb(108,108,108)'; g.fillRect(0, y - 1, w, 2);
    r.fillStyle = 'rgb(0,190,0)'; r.fillRect(0, y - 1.5, w, 3);
  }
  // лак: где лежат руки и вещи — затёрт до матового, местами наоборот заполирован
  for (let i = 0; i < 70; i++) {
    const x = rr(0, w), y = rr(0.45, 1) * h, rx = rr(0.03, 0.12) * w, ry = rr(0.03, 0.1) * h, glossy = rng() < 0.4;
    const gr = r.createRadialGradient(x, y, 0, x, y, 1);
    r.save(); r.translate(x, y); r.scale(rx, ry);
    const g2 = r.createRadialGradient(0, 0, 0, 0, 0, 1), col = glossy ? '0,78,0' : '0,150,0', a = rr(0.1, 0.3);
    g2.addColorStop(0, `rgba(${col},${a})`); g2.addColorStop(1, `rgba(${col},0)`);
    r.fillStyle = g2; r.fillRect(-1, -1, 2, 2); r.restore(); void gr;
  }
  for (let i = 0; i < 500; i++) {                                       // тонкие риски от вещей
    const x = rr(0, w), y = rr(0, h), len = rr(0.004, 0.03) * w, a = rr(-0.5, 0.5);
    r.strokeStyle = `rgba(0,170,0,${rr(0.15, 0.4)})`; r.lineWidth = 1.5; r.beginPath(); r.moveTo(x, y); r.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); r.stroke();
  }
  return { color: cc, normal: normalFromHeight(hc, 1.1), rough: rc };
}

// ---------- бумага: без текста дела — серые строки, сгибы и тень от давнего сгиба ----------
function makePaper(seed, lines, folds) {
  const w = 512, h = 724, rng = rngFactory(seed), rr = (a, b) => a + (b - a) * rng();
  const cc = mkCanvas(w, h), hc = mkCanvas(w, h), c = cc.getContext('2d'), g = hc.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#e4dccb'; c.fillRect(0, 0, w, h);
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {                                         // неровный тон бумаги
    const x = rr(0, w), y = rr(0, h), rad = rr(40, 160), gr = c.createRadialGradient(x, y, 0, x, y, rad);
    const col = rng() < 0.5 ? '120,100,70' : '255,250,235', a = rr(0.02, 0.06);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  if (lines) {
    c.fillStyle = 'rgba(52,48,44,0.62)';
    c.fillRect(64, 62, 150, 7); c.fillRect(64, 76, 96, 5);
    let y = 128;
    for (let p = 0; p < 5; p++) {
      const n = 3 + Math.floor(rr(0, 4));
      for (let i = 0; i < n; i++, y += 15) {
        let x = 64 + (i === 0 ? 22 : 0);
        const end = i === n - 1 ? rr(180, 380) : 448;
        while (x < end) { const ww = Math.min(rr(10, 46), end - x); c.fillRect(x, y, ww, 4); x += ww + 5; }
      }
      y += 12; if (y > 600) break;
    }
  }
  for (const f of folds) {                                               // сгиб: излом рельефа и чуть затёртая линия
    const [vertical, pos, sign] = f, p = pos * (vertical ? w : h), ext = 40;
    for (let i = -ext; i <= ext; i++) {
      const v = Math.round(128 + sign * (1 - Math.abs(i) / ext) * 60);
      g.fillStyle = `rgb(${v},${v},${v})`;
      if (vertical) g.fillRect(p + i, 0, 1, h); else g.fillRect(0, p + i, w, 1);
    }
    c.fillStyle = 'rgba(90,80,64,0.16)';
    if (vertical) c.fillRect(p - 1, 0, 2, h); else c.fillRect(0, p - 1, w, 2);
  }
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rng() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
  return { color: cc, normal: normalFromHeight(hc, 0.9) };
}

// ---------- пятно касания (запечённое затенение под вещью): чёрный холст с мягкой прозрачностью ----------
function makeContact(wPx, hPx, marginPx, radiusPx, oval) {
  const c = mkCanvas(wPx, hPx), ctx = c.getContext('2d'), steps = 28;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1), ins = marginPx * t * 1.25;
    ctx.fillStyle = `rgba(0,0,0,${0.035 + 0.05 * t})`;
    ctx.beginPath();
    if (oval) ctx.ellipse(wPx / 2, hPx / 2, Math.max(1, wPx / 2 - ins), Math.max(1, hPx / 2 - ins), 0, 0, 7);
    else { const r = Math.max(2, radiusPx + marginPx - ins); ctx.roundRect ? ctx.roundRect(ins, ins, wPx - 2 * ins, hPx - 2 * ins, r) : ctx.rect(ins, ins, wPx - 2 * ins, hPx - 2 * ins); }
    ctx.fill();
  }
  return c;
}

// ---------- лампа-«банкир»: латунное основание, стойка, дуга, абажур зелёного стекла ----------
function buildLamp(disposables) {
  const lamp = new THREE.Group(); lamp.name = 'lamp';
  const brass = new THREE.MeshStandardMaterial({ color: '#b08d57', metalness: 1, roughness: 0.3 });
  const brassDark = new THREE.MeshStandardMaterial({ color: '#8a6c3e', metalness: 1, roughness: 0.42 });
  const add = (geo, mat, parent = lamp, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); disposables.push(geo); return m; };
  const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  // основание — овальная ступенчатая плита
  const base = lathe([[0, 0.0005], [0.097, 0.0005], [0.1, 0.003], [0.1, 0.011], [0.097, 0.014], [0.09, 0.0155], [0.086, 0.019], [0.07, 0.0215], [0.04, 0.025], [0.022, 0.027], [0.014, 0.031]], 56);
  { const p = base.attributes.position, n = base.attributes.normal, s = 0.64;
    for (let i = 0; i < p.count; i++) { p.setZ(i, p.getZ(i) * s); const v = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i) / s).normalize(); n.setXYZ(i, v.x, v.y, v.z); } }
  add(base, brass);
  add(lathe([[0.012, 0.03], [0.012, 0.042], [0.017, 0.046], [0.017, 0.051], [0.0095, 0.058], [0.0082, 0.15], [0.012, 0.156], [0.0145, 0.164], [0.011, 0.171], [0.011, 0.19]], 24), brass, lamp, false);   // стойка под самой колбой: её тень — только зубцы на основании
  // дуга-вилка, держит абажур за торцы
  const AX = 0.142, AY = 0.335;
  const curve = new THREE.CatmullRomCurve3([[-AX, AY, 0], [-AX, 0.275, 0], [-0.118, 0.218, 0], [-0.06, 0.19, 0], [0, 0.184, 0], [0.06, 0.19, 0], [0.118, 0.218, 0], [AX, 0.275, 0], [AX, AY, 0]].map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  add(new THREE.TubeGeometry(curve, 64, 0.0055, 10), brass, lamp, false);   // дуга у самой колбы: от длинного источника её тень размыта до нуля
  for (const s of [-1, 1]) {
    const knob = add(new THREE.SphereGeometry(0.0095, 16, 12), brass); knob.position.set(s * (AX + 0.004), AY, 0);
    const pin = add(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 12), brassDark); pin.rotation.z = Math.PI / 2; pin.position.set(s * (AX - 0.008), AY, 0);
  }
  // абажур: вытянутый полуцилиндр со скруглёнными торцами, наклонён к сидящему
  const shade = new THREE.Group(); shade.name = 'lamp_shade'; shade.position.set(0, AY, 0); shade.rotation.x = -0.34; lamp.add(shade);
  const R = 0.066, L = 0.262, YS = 0.84, REND = 0.05, TH0 = -0.16, TH1 = Math.PI + 0.16, NT = 28, NX = 56;
  const shadePoint = (i, j, k) => {
    const x = -L / 2 * Math.cos(Math.PI * i / NX), dEnd = L / 2 - Math.abs(x);
    let s = 1; if (dEnd < REND) { const q = 1 - dEnd / REND; s = Math.sqrt(Math.max(0, 1 - q * q)); }
    const th = TH0 + (TH1 - TH0) * j / NT;
    return [x * (1 - (1 - k) * 0.25 * (1 - s)), Math.sin(th) * R * s * YS * k, Math.cos(th) * R * s * k];
  };
  const shellGeo = (k) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NT; j++) { pos.push(...shadePoint(i, j, k)); uv.push(i / NX, j / NT); }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  // свечение стекла: ярче у середины (над колбой), к торцам и к верху слабее
  const glowC = mkCanvas(64, 32), gx = glowC.getContext('2d');
  { const gr = gx.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#3a3a3a'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#3a3a3a'); gx.fillStyle = gr; gx.fillRect(0, 0, 64, 32);
    const gv = gx.createLinearGradient(0, 0, 0, 32); gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(0.5, 'rgba(0,0,0,0.38)'); gv.addColorStop(1, 'rgba(0,0,0,0)'); gx.fillStyle = gv; gx.fillRect(0, 0, 64, 32); }
  const glowTex = new THREE.CanvasTexture(glowC); glowTex.colorSpace = THREE.SRGBColorSpace;
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0b3d25', roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, emissive: new THREE.Color('#17a05a'), emissiveMap: glowTex, emissiveIntensity: 0 });
  const opal = new THREE.MeshStandardMaterial({ color: '#cfc9b8', roughness: 0.55, side: THREE.BackSide, emissive: new THREE.Color('#ffdba4'), emissiveIntensity: 0 });
  const outer = add(shellGeo(1), glass, shade, false); outer.name = 'lamp_glass';
  add(shellGeo(0.955), opal, shade, false);
  { // латунный кант по нижней кромке стекла
    const pos = [], idx = [];
    for (const j of [0, NT]) { const o = pos.length / 3; for (let i = 0; i <= NX; i++) { pos.push(...shadePoint(i, j, 1.012), ...shadePoint(i, j, 0.94)); } for (let i = 0; i < NX; i++) { const a = o + i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const rimMat = new THREE.MeshStandardMaterial({ color: '#b08d57', metalness: 1, roughness: 0.35, side: THREE.DoubleSide }); disposables.push(rimMat);
    add(g, rimMat, shade, false);
  }
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#e6e0d2', roughness: 0.3, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 });
  const bulb = add(new THREE.CapsuleGeometry(0.013, 0.07, 6, 16), bulbMat, shade, false); bulb.rotation.z = Math.PI / 2; bulb.position.set(0, 0.006, 0);
  const socket = add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 16), brassDark, shade, false); socket.rotation.z = Math.PI / 2; socket.position.set(-0.072, 0.006, 0);
  // цепочка выключателя с бусиной
  const chain = add(new THREE.CylinderGeometry(0.0007, 0.0007, 0.07, 6), brass, lamp, false); chain.position.set(-0.07, AY - 0.045, 0.012);
  const bead = add(new THREE.SphereGeometry(0.0036, 12, 10), brass, lamp, false); bead.position.set(-0.07, AY - 0.082, 0.012);
  disposables.push(brass, brassDark, glass, opal, bulbMat, glowTex);
  return { lamp, shade, glass, opal, bulbMat, boxes: [new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.065), new THREE.Vector3(0.1, 0.2, 0.065)), new THREE.Box3(new THREE.Vector3(-0.155, 0.18, -0.085), new THREE.Vector3(0.155, 0.41, 0.085))] };
}

// =====================================================================================
export function startDesk47(ui) {
  const { canvas } = ui;
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const viewName = params.get('view');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const LOW = params.get('low') ? params.get('low') === '1' : (coarse || small);
  const BAKE = params.get('bake') === '0' ? 0 : params.get('bake') === '1' ? 1 : 0.5;   // 0 — вживую, 0.5 — гибрид, 1 — запечённый стол
  const CONTACT = BAKE > 0, PRELIT = BAKE === 1;
  const showStats = params.get('stats') === '1';
  const disposables = [];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  const EXPOSURE = parseFloat(params.get('exp') || '1.0');
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;                  // счётчики сбрасываем сами: иначе проход тени в них не попадает
  renderer.shadowMap.autoUpdate = false;            // тень пересчитывается, только когда что-то сдвинулось
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const BG = new THREE.Color('#0b0907');
  scene.background = BG;
  const camera = new THREE.PerspectiveCamera(64, 1, 0.08, 12);

  // ---------- по требованию ----------
  let rafId = 0, dirty = true, shadowDirty = true;
  const invalidate = (shadow) => { dirty = true; if (shadow) shadowDirty = true; if (!rafId) rafId = requestAnimationFrame(frame); };

  // ---------- комната ----------
  const texOf = (cv, srgb, aniso) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso || 1; disposables.push(t); return t; };
  const WOOD_W = LOW ? 1024 : 2048;
  const wood = makeWood(WOOD_W, Math.round(WOOD_W * (DESK.z1 - DESK.z0) / (DESK.x1 - DESK.x0)));
  const deskAniso = Math.min(LOW ? 4 : 16, maxAniso);
  const woodMap = texOf(wood.color, true, deskAniso), woodN = texOf(wood.normal, false, deskAniso), woodR = texOf(wood.rough, false, deskAniso);
  const deskW = DESK.x1 - DESK.x0, deskD = DESK.z1 - DESK.z0, deskCx = (DESK.x0 + DESK.x1) / 2, deskCz = (DESK.z0 + DESK.z1) / 2;
  const mDeskLive = new THREE.MeshStandardMaterial({ map: woodMap, normalMap: woodN, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: woodR, roughness: 1, metalness: 0, envMapIntensity: 0.55 });
  const deskTop = new THREE.Mesh(new THREE.PlaneGeometry(deskW, deskD).rotateX(-Math.PI / 2), mDeskLive);
  deskTop.name = 'desk_top'; deskTop.position.set(deskCx, 0, deskCz); deskTop.receiveShadow = true; scene.add(deskTop);
  const mEdge = new THREE.MeshStandardMaterial({ color: '#2c1a0f', roughness: 0.5, map: woodMap });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(deskW, DESK.t, deskD), mEdge);
  slab.position.set(deskCx, -DESK.t / 2 - 0.0008, deskCz); slab.castShadow = true; slab.receiveShadow = true; scene.add(slab);
  const mDark = new THREE.MeshLambertMaterial({ color: '#1c110a' });
  for (const [x, w] of [[DESK.x0 + 0.27, 0.5], [DESK.x1 - 0.27, 0.5]]) {            // тумбы стола
    const ped = new THREE.Mesh(new THREE.BoxGeometry(w, -DESK.floor - DESK.t - 0.03, deskD - 0.08), mDark);
    ped.position.set(x, (DESK.floor - DESK.t) / 2, deskCz - 0.01); scene.add(ped);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#050403' }));      // пол в темноте: без света и теней — самый дешёвый материал
  floor.position.set(0, DESK.floor, 1.6); scene.add(floor);
  // стена позади в полутени и пустая пробковая доска на ней
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshLambertMaterial({ color: '#5a5045' }));    // стена и доска: простой рассеянный свет, теней не принимают
  wall.position.set(0, 1.2, -0.06); scene.add(wall);
  { const cork = mkCanvas(256, 160), cx = cork.getContext('2d'), rng = rngFactory(7);
    cx.fillStyle = '#6b4f33'; cx.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 5000; i++) { cx.fillStyle = rng() < 0.5 ? `rgba(40,26,14,${rng() * 0.35})` : `rgba(150,118,80,${rng() * 0.25})`; cx.fillRect(rng() * 256, rng() * 160, 1 + rng() * 2, 1 + rng() * 2); }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshLambertMaterial({ map: texOf(cork, true, 4), color: new THREE.Color(1.7, 1.7, 1.7) }));
    board.position.set(0, BOARD.y0 + BOARD.h / 2, -0.045); scene.add(board);
    const frameMat = new THREE.MeshLambertMaterial({ color: '#4a3020' });
    for (const [w, h, x, y] of [[BOARD.w + 0.05, 0.025, 0, BOARD.h / 2 + 0.0125], [BOARD.w + 0.05, 0.025, 0, -BOARD.h / 2 - 0.0125], [0.025, BOARD.h, -BOARD.w / 2 - 0.0125, 0], [0.025, BOARD.h, BOARD.w / 2 + 0.0125, 0]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), frameMat); f.position.set(x, BOARD.y0 + BOARD.h / 2 + y, -0.04); scene.add(f);
    } }

  // бумаги в круге лампы (выше плоскости стола на доли миллиметра — без мерцания глубины)
  const papers = [];
  const SHEET = [0.21 * ITEM_SCALE, 0.297 * ITEM_SCALE];
  for (const [i, p] of [{ x: -0.50, z: 0.705, yaw: 0.2, lines: true, folds: [[false, 0.5, 1]] }, { x: -0.3, z: 0.745, yaw: -0.1, lines: false, folds: [[false, 0.335, 1], [false, 0.665, -1]] }].entries()) {
    const t = makePaper(31 + i, p.lines, p.folds);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SHEET[0], SHEET[1]).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texOf(t.color, true, Math.min(8, maxAniso)), normalMap: texOf(t.normal, false, 4), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92, envMapIntensity: 0.3 }));
    m.position.set(p.x, 0.0006 + i * 0.0003, p.z); m.rotation.y = p.yaw; m.receiveShadow = true; m.name = 'paper_' + i; scene.add(m); papers.push(m);
  }

  // ---------- лампа и свет ----------
  const L = buildLamp(disposables);
  const lamp = L.lamp;
  lamp.scale.setScalar(1.12);
  const lampPos = new THREE.Vector3(parseFloat(params.get('lx') || LAMP_REST.x), 0, parseFloat(params.get('lz') || LAMP_REST.z));
  lamp.position.copy(lampPos); lamp.rotation.y = LAMP_REST.yaw; scene.add(lamp);
  const LAMP_COLOR = new THREE.Color('#ffdcae');     // свет ламп по арт-библии #f0d9a8, чуть теплее у самой колбы
  const KEY_I = parseFloat(params.get('li') || '2.0');
  const key = new THREE.SpotLight(LAMP_COLOR, KEY_I, 3.2, 1.36, 0.45, 2);
  key.position.set(0, -0.008, 0); L.shade.add(key);
  key.target.position.set(0, -1, 0); L.shade.add(key.target);
  key.castShadow = true;
  const SM = LOW ? 1024 : 2048;
  key.shadow.mapSize.set(SM, SM);
  key.shadow.camera.near = 0.05; key.shadow.camera.far = 2.6;
  key.shadow.bias = -0.0009; key.shadow.normalBias = 0.0022; key.shadow.radius = LOW ? 1.6 : 2.6;
  // зелёное свечение стекла вверх и в стороны (стена, доска, верх поднятой вещи)
  const glow = new THREE.SpotLight(new THREE.Color('#46c986'), 0.09, 2.5, 1.5, 1, 2);
  glow.position.set(0, 0.03, 0); L.shade.add(glow); glow.target.position.set(0, 1, 0.1); L.shade.add(glow.target);
  // отсвет тёплого круга на столе вверх — это и есть «заполняющий» под лампой: без затухания в пределах 0,9 м
  const bounce = new THREE.SpotLight(new THREE.Color('#d39a5c'), 0.42, 0.95, 1.4, 1, 0);
  bounce.position.set(0.04, -0.02, 0.13); lamp.add(bounce); bounce.target.position.set(0.04, 1, 0.13); lamp.add(bounce.target);
  // слабый холодный свет ночного окна справа и полутьма кабинета
  const fill = new THREE.DirectionalLight(0x7f9bc8, 0.22); fill.position.set(1.4, 0.9, 0.9); scene.add(fill);
  const hemi = new THREE.HemisphereLight(0x2b3140, 0x120c08, 0.42); scene.add(hemi);

  // запечённые пятна касания (и в гибриде, и в режиме запекания)
  let contactLaptop = null, contactLamp = null;
  const contactMat = (cv) => { const m = new THREE.MeshBasicMaterial({ map: texOf(cv, true), color: 0x000000, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 }); disposables.push(m); return m; };
  if (CONTACT) {
    const mg = 0.045, lw = 0.335 * ITEM_SCALE, ld = 0.238 * ITEM_SCALE, px = 512 / (lw + 2 * mg);
    contactLaptop = new THREE.Mesh(new THREE.PlaneGeometry(lw + 2 * mg, ld + 2 * mg).rotateX(-Math.PI / 2), contactMat(makeContact(512, (ld + 2 * mg) * px, mg * px, 0.01 * px, false)));
    contactLaptop.position.set(LAPTOP_REST.x, 0.00025, LAPTOP_REST.z); contactLaptop.rotation.y = LAPTOP_REST.yaw; contactLaptop.renderOrder = 2; scene.add(contactLaptop);
    contactLamp = new THREE.Mesh(new THREE.PlaneGeometry(0.2 + 0.08, 0.128 + 0.08).rotateX(-Math.PI / 2), contactMat(makeContact(256, 192, 52, 0, true)));
    contactLamp.position.set(0, 0.0002, 0); contactLamp.renderOrder = 2; lamp.add(contactLamp);
  }

  // ---------- ноутбук ----------
  const laptop = buildLaptop47(THREE, { lidAngle: LID_OPEN, textureSize: LOW ? 1536 : 2048, anisotropy: Math.min(8, maxAniso), onChange: () => invalidate(true), lowPower: LOW });
  const holder = new THREE.Group(), inner = new THREE.Group();
  holder.scale.setScalar(ITEM_SCALE);
  inner.add(laptop); holder.add(inner); scene.add(holder);
  const dims = laptop.userData.dims;
  const lidNode = laptop.getObjectByName('lid_hinge');
  const boxBase = new THREE.Box3(new THREE.Vector3(-dims.W / 2, -0.002, -dims.D / 2), new THREE.Vector3(dims.W / 2, dims.HB + 0.004, dims.D / 2));
  const boxLid = new THREE.Box3(new THREE.Vector3(-dims.W / 2, -dims.LT / 2, 0), new THREE.Vector3(dims.W / 2, dims.LT / 2, dims.lidDepth + 0.004));

  // ---------- карта окружения: тёмный кабинет с точки «в руках» (с лампой и без) ----------
  let envOn = null, envOff = null;
  function makeEnv(on) {
    const env = new THREE.Scene();
    const basic = (rgb, side = THREE.DoubleSide) => new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0], rgb[1], rgb[2]), side });
    const add = (m) => { env.add(m); return m; };
    add(new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), basic([0.010, 0.011, 0.014], THREE.BackSide)));
    const win = add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), basic([0.16, 0.22, 0.36]))); win.position.set(3.2, 0.9, 0.6); win.lookAt(0, 0, 0);
    const deskP = add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9).rotateX(-Math.PI / 2), basic(on ? [0.03, 0.019, 0.011] : [0.004, 0.004, 0.005])));
    deskP.position.set(deskCx - HOLD.x, -HOLD.y, deskCz - HOLD.z);
    if (on) {
      const rel = lampPos.clone().sub(HOLD);
      const shadeP = add(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.07), basic([15, 11.4, 7.4]))); shadeP.position.set(rel.x, 0.345 - HOLD.y, rel.z); shadeP.lookAt(0, -0.25, 0);
      const green = add(new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.07), basic([0.12, 0.85, 0.42]))); green.position.set(rel.x, 0.42 - HOLD.y, rel.z); green.lookAt(0, 0.2, 0);
      const pool = add(new THREE.Mesh(new THREE.CircleGeometry(0.34, 24).rotateX(-Math.PI / 2), basic([0.5, 0.31, 0.16]))); pool.position.set(rel.x + 0.1, -HOLD.y + 0.002, rel.z + 0.12);
      const wallGlow = add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), basic([0.02, 0.045, 0.03]))); wallGlow.position.set(rel.x, 0.5, -HOLD.z - 0.05);
    }
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(env, 0.03, 0.05, 20);
    pm.dispose();
    env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    return rt;
  }
  function refreshEnv(onlyOn) {
    if (envOn) envOn.dispose(); envOn = makeEnv(true);
    if (!onlyOn || !envOff) { if (envOff) envOff.dispose(); envOff = makeEnv(false); }
  }
  refreshEnv(false);
  scene.environmentIntensity = 0.42;

  // ---------- запекание света стола (#bake=1): вид строго сверху, только плоскость столешницы ----------
  // Три текстуры: A — лампа горит, ноутбук на месте; B — лампа горит, ноутбука нет (подмена при подъёме);
  // C — лампа погашена. Свет копится из нескольких положений источника вдоль колбы — мягкая «настоящая» полутень.
  const bake = { rt: null, mat: null, uni: null, ms: 0, count: 0 };
  if (PRELIT) {
    const bw = LOW ? 1024 : 2048, bh = Math.round(bw * deskD / deskW);
    const mk = () => { const rt = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }); rt.texture.anisotropy = deskAniso; return rt; };
    bake.rt = { A: mk(), B: mk(), C: mk() };
    bake.cam = new THREE.OrthographicCamera(-deskW / 2, deskW / 2, deskD / 2, -deskD / 2, 0.9996, 1.0005);
    bake.cam.position.set(deskCx, 1, deskCz); bake.cam.up.set(0, 0, -1); bake.cam.lookAt(deskCx, 0, deskCz);
    bake.src = new THREE.MeshPhysicalMaterial({ map: woodMap, normalMap: woodN, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 1, metalness: 0, specularIntensity: 0, envMapIntensity: 0.55, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    bake.uni = { tB: { value: bake.rt.B.texture }, tC: { value: bake.rt.C.texture }, uLift: { value: 0 }, uLamp: { value: 1 } };
    bake.mat = new THREE.MeshBasicMaterial({ map: bake.rt.A.texture });
    bake.mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, bake.uni);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tB; uniform sampler2D tC; uniform float uLift; uniform float uLamp;')
        .replace('#include <map_fragment>', 'diffuseColor.rgb *= mix( texture2D( tC, vMapUv ).rgb, mix( texture2D( map, vMapUv ).rgb, texture2D( tB, vMapUv ).rgb, uLift ), uLamp );');
    };
    disposables.push(bake.src, bake.mat, bake.rt.A, bake.rt.B, bake.rt.C);
  }
  const keyHome = key.position.clone();
  function bakeDesk(samples, which = 'ABC') {
    if (!PRELIT) return;
    const t0 = performance.now();
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevBg = scene.background, prevVis = holder.visible;
    const saved = { key: key.intensity, glow: glow.intensity, bounce: bounce.intensity, env: scene.environment };
    const hidden = [contactLaptop, contactLamp].filter(Boolean).map((o) => [o, o.visible]);
    hidden.forEach(([o]) => { o.visible = false; });
    deskTop.material = bake.src; scene.background = null; renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    const pass = (rt, n, lampOn, withLaptop) => {
      holder.visible = withLaptop && prevVis;
      key.intensity = lampOn ? KEY_I : 0; glow.intensity = lampOn ? GLOW_I : 0; bounce.intensity = lampOn ? BOUNCE_I : 0;
      scene.environment = (lampOn ? envOn : envOff).texture;
      bake.src.color.setScalar(1 / n);
      renderer.setRenderTarget(rt); renderer.clear();
      for (let i = 0; i < n; i++) {
        // источник — колба длиной ≈ 9 см: точки вдоль неё и чуть поперёк
        const u = n > 1 ? (i + 0.5) / n - 0.5 : 0, v = n > 1 ? ((i * 0.618034) % 1) - 0.5 : 0;
        key.position.set(keyHome.x + u * 0.09, keyHome.y, keyHome.z + v * 0.026);
        renderer.shadowMap.needsUpdate = lampOn;
        renderer.render(scene, bake.cam);
      }
    };
    if (which.includes('A')) pass(bake.rt.A, samples, true, true);
    if (which.includes('B')) pass(bake.rt.B, samples, true, false);
    if (which.includes('C')) pass(bake.rt.C, 1, false, false);
    key.position.copy(keyHome);
    key.intensity = saved.key; glow.intensity = saved.glow; bounce.intensity = saved.bounce; scene.environment = saved.env;
    holder.visible = prevVis; hidden.forEach(([o, v]) => { o.visible = v; });
    deskTop.material = bake.mat; scene.background = prevBg; renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevTarget);
    shadowDirty = true;
    bake.ms = performance.now() - t0; bake.count++;
  }
  const BAKE_SAMPLES = LOW ? 6 : 16;
  const GLOW_I = glow.intensity, BOUNCE_I = bounce.intensity;

  // ---------- состояние ----------
  const HOME_Q = qOf(0.2, -0.5, 0);
  const VIEWS = {
    home:   { q: HOME_Q, zoom: 1, lid: LID_OPEN },
    bottom: { q: qOf(0, -0.58, 0).multiply(qOf(1.0, 0.3, 0)).multiply(qOf(0, 0, Math.PI)), zoom: 0.92, lid: 0 },   // дно — вполоборота к лампе: рельеф читается по теням
    side:   { q: qOf(0.12, 1.15, 0), zoom: 0.8, lid: 0 },
  };
  const restQ = qOf(0, LAPTOP_REST.yaw, 0);
  const restPos = new THREE.Vector3(LAPTOP_REST.x, LAPTOP_REST.y, LAPTOP_REST.z);
  const st = { k: 0, q: HOME_Q.clone(), zoom: 1, lid: LID_OPEN, panX: 0, panY: 0, hover: 0, lampK: 1 };
  const tg = { k: 0, q: HOME_Q.clone(), zoom: 1, lid: LID_OPEN, panX: 0, panY: 0, hover: 0, lampK: 1 };
  let mode = 'desk', flipped = false, lidOpen = true, lampOn = true;
  if (params.get('lamp') === '0' || viewName === 'lampoff') { lampOn = false; st.lampK = tg.lampK = 0; }

  // ---------- камера ----------
  const poseDesk = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 64 };
  const poseHold = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 30, dir: new THREE.Vector3(), dist: 1, right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) };
  let vw = 1, vh = 1;
  function computePoses() {
    const aspect = vw / vh;
    // вид «Стол» из игры: перспектива — половина большей стороны экрана; взгляд вниз так, чтобы верх доски был у верхнего края
    const p = 0.5 * Math.max(vw, vh);
    poseDesk.fov = THREE.MathUtils.radToDeg(2 * Math.atan(vh / 2 / p));
    const eyeX = lerp(-0.1, -0.16, smooth(1.3, 0.8, aspect));
    poseDesk.pos.set(eyeX, EYE.y, EYE.z);
    const toTop = THREE.MathUtils.radToDeg(Math.atan((BOARD.y0 + BOARD.h - EYE.y) / EYE.z));
    const rx = Math.max(0, poseDesk.fov / 2 - toTop - 2.5);
    poseDesk.quat.copy(qOf(-THREE.MathUtils.degToRad(rx), 0, 0));
    // узкий экран (телефон стоя): у игры здесь угол 90° и полкадра пола — для пробы кадр собран по лампе и вещи
    const tall = smooth(1.2, 0.8, aspect);
    if (tall > 0) {
      const pp = new THREE.Vector3(-0.2, 0.8, 1.42);
      const mq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pp, new THREE.Vector3(-0.2, 0.0, 0.6), new THREE.Vector3(0, 1, 0)));
      poseDesk.pos.lerp(pp, tall); poseDesk.quat.slerp(mq, tall); poseDesk.fov = lerp(poseDesk.fov, 82, tall);
    }
    if (viewName === 'close') {                       // служебный крупный план стола
      poseDesk.fov = 30; poseDesk.pos.set(-0.2, 0.42, 1.25);
      const m = new THREE.Matrix4().lookAt(poseDesk.pos, new THREE.Vector3(-0.16, 0.1, 0.45), new THREE.Vector3(0, 1, 0)); poseDesk.quat.setFromRotationMatrix(m);
    }
    // «в руках»: камера подлетает к вещи вдоль того же взгляда, угол зрения сужается
    poseHold.fov = aspect < 1 ? 38 : 30;
    poseHold.dir.set(-0.1, EYE.y - HOLD.y + 0.02, EYE.z - HOLD.z).normalize();
    const R = 0.2;                                    // радиус вещи с открытой крышкой, м
    const th = Math.tan(THREE.MathUtils.degToRad(poseHold.fov / 2));
    poseHold.dist = R / (th * Math.min(1, aspect)) * (aspect < 1 ? 1.02 : 1.12);
    const m = new THREE.Matrix4().lookAt(poseHold.dir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    poseHold.quat.setFromRotationMatrix(m);
    poseHold.right.set(1, 0, 0).applyQuaternion(poseHold.quat); poseHold.up.set(0, 1, 0).applyQuaternion(poseHold.quat);
  }
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    vw = w; vh = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    computePoses();
    invalidate(false);
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

  // ---------- выбор лучом по простым коробкам (не по сотне тысяч треугольников) ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), inv = new THREE.Matrix4(), lray = new THREE.Ray(), hitP = new THREE.Vector3();
  function hitBoxes(obj, boxes) {
    obj.updateWorldMatrix(true, false);
    inv.copy(obj.matrixWorld).invert(); lray.copy(ray.ray).applyMatrix4(inv);
    let best = Infinity;
    for (const b of boxes) if (lray.intersectBox(b, hitP)) { const d = hitP.applyMatrix4(obj.matrixWorld).distanceTo(ray.ray.origin); if (d < best) best = d; }
    return best;
  }
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const dl = laptop.visible ? Math.min(hitBoxes(laptop, [boxBase]), hitBoxes(lidNode, [boxLid])) : Infinity;
    const dm = hitBoxes(lamp, L.boxes);
    if (dl === Infinity && dm === Infinity) return null;
    return dl <= dm ? 'laptop' : 'lamp';
  }
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), planeHit = new THREE.Vector3();
  function deskPointAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(deskPlane, planeHit) ? planeHit : null;
  }

  // ---------- действия ----------
  const setMode = (m) => {
    if (mode === m) return;
    mode = m; tg.k = m === 'inspect' ? 1 : 0;
    if (m === 'inspect') { flipped = false; lidOpen = true; tg.q.copy(HOME_Q); st.q.copy(HOME_Q); tg.zoom = st.zoom = 1; tg.panX = tg.panY = st.panX = st.panY = 0; tg.lid = LID_OPEN; tg.hover = 0; }
    else { tg.lid = LID_OPEN; tg.zoom = 1; tg.panX = tg.panY = 0; flipped = false; lidOpen = true; }
    if (reduceMotion.matches) snapAll();
    ui.onMode && ui.onMode(mode, { flipped, lidOpen, lampOn });
    invalidate(true);
  };
  const snapAll = () => { st.k = tg.k; st.q.copy(tg.q); for (const key2 of ['zoom', 'lid', 'panX', 'panY', 'hover', 'lampK']) st[key2] = tg[key2]; };
  const api = {
    pick: () => setMode('inspect'),
    put: () => setMode('desk'),
    home() { if (mode !== 'inspect') return; flipped = false; lidOpen = true; tg.q.copy(HOME_Q); tg.zoom = 1; tg.panX = tg.panY = 0; tg.lid = LID_OPEN; if (reduceMotion.matches) snapAll(); sync(); invalidate(true); },
    flip() { if (mode !== 'inspect') return; flipped = !flipped; const v = flipped ? VIEWS.bottom : VIEWS.home; tg.q.copy(v.q); tg.zoom = v.zoom; tg.panX = tg.panY = 0; tg.lid = flipped ? 0 : (lidOpen ? LID_OPEN : 0); if (reduceMotion.matches) snapAll(); sync(); invalidate(true); },
    lid() { if (mode !== 'inspect') return; if (flipped) { flipped = false; lidOpen = true; tg.q.copy(HOME_Q); tg.zoom = 1; } else lidOpen = !lidOpen; tg.lid = lidOpen ? LID_OPEN : 0; if (reduceMotion.matches) snapAll(); sync(); invalidate(true); },
    lamp() { lampOn = !lampOn; tg.lampK = lampOn ? 1 : 0; if (reduceMotion.matches) snapAll(); sync(); invalidate(false); },
    get mode() { return mode; },
  };
  const sync = () => ui.onMode && ui.onMode(mode, { flipped, lidOpen, lampOn });

  // ---------- указатель ----------
  const pointers = new Map();
  let gesture = null;      // { type: 'rotate' | 'lamp' | 'pan' | 'tap', id, x0, y0, moved, target, off }
  let pinch0 = 0, zoom0 = 1;
  const qd = new THREE.Quaternion();
  function rotateBy(dx, dy) {
    qd.setFromAxisAngle(poseHold.up, dx * ROT_PER_PX); tg.q.premultiply(qd);
    qd.setFromAxisAngle(poseHold.right, dy * ROT_PER_PX); tg.q.premultiply(qd);
    tg.q.normalize(); invalidate(true);
  }
  function moveLamp(x, z) {
    x = clamp(x, DESK.x0 + 0.13, DESK.x1 - 0.13); z = clamp(z, DESK.z0 + 0.1, DESK.z1 - 0.1);
    // не въезжать в ноутбук: ни в лежащий, ни в поднятый
    for (const [cx, cz, rad] of [[LAPTOP_REST.x, LAPTOP_REST.z, 0.29], [HOLD.x, HOLD.z, mode === 'inspect' ? 0.4 : 0]]) {
      if (!rad) continue;
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d < rad) { const k = rad / (d || 1e-3); x = cx + (d ? dx : -1) * k; z = cz + dz * k; }
    }
    for (const p of papers) void p;
    lampPos.set(x, 0, z); lamp.position.copy(lampPos);
    if (PRELIT) bakeDesk(1, 'AB');
    invalidate(true);
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    if (e.button === 2) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = tg.zoom; if (gesture) gesture.moved = true; return; }
    if (pointers.size > 2) return;
    const target = pick(e.clientX, e.clientY);
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, target, type: 'tap' };
    if (e.button === 1) { e.preventDefault(); gesture.type = mode === 'inspect' ? 'pan' : 'none'; return; }
    if (target === 'lamp') { const p = deskPointAt(e.clientX, e.clientY); gesture.type = 'lamp'; gesture.off = p ? [lampPos.x - p.x, lampPos.z - p.z] : [0, 0]; }
    else if (mode === 'inspect') gesture.type = 'rotate';
    canvas.classList.toggle('drag', mode === 'inspect' || target === 'lamp');
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) { if (!coarse && e.pointerType !== 'touch') hover(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0 && mode === 'inspect') { tg.zoom = clamp(zoom0 * pinch0 / d, 0.4, 1.3); invalidate(false); }
      return;
    }
    if (!gesture || gesture.id !== e.pointerId) return;
    if (!gesture.moved && Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > CLICK_PX) { gesture.moved = true; ui.onFirstMove && ui.onFirstMove(); }
    if (!gesture.moved) return;
    if (gesture.type === 'rotate' && mode === 'inspect') rotateBy(dx, dy);
    else if (gesture.type === 'pan' && mode === 'inspect') {
      const per = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * poseHold.dist * st.zoom / vh;
      tg.panX = clamp(tg.panX + dx * per, -0.12, 0.12); tg.panY = clamp(tg.panY - dy * per, -0.08, 0.08); invalidate(true);
    } else if (gesture.type === 'lamp') { const q = deskPointAt(e.clientX, e.clientY); if (q) moveLamp(q.x + gesture.off[0], q.z + gesture.off[1]); }
  });
  const endPointer = (e) => {
    const had = pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (!had || !gesture || gesture.id !== e.pointerId) { if (!pointers.size) canvas.classList.remove('drag'); return; }
    const g = gesture; gesture = null; canvas.classList.remove('drag');
    if (e.type === 'pointercancel') return;
    if (g.type === 'lamp' && g.moved) { refreshEnv(true); if (lampOn) scene.environment = envOn.texture; if (PRELIT) bakeDesk(BAKE_SAMPLES, 'AB'); invalidate(true); return; }
    if (g.moved || e.button !== 0) return;
    if (g.target === 'lamp') api.lamp();
    else if (mode === 'desk' && g.target === 'laptop') api.pick();
    else if (mode === 'inspect' && g.target !== 'laptop') api.put();     // щелчок мимо вещи — положить
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { if (tg.hover) { tg.hover = 0; invalidate(true); } canvas.classList.remove('can'); });
  function hover(cx, cy) {
    const t = pick(cx, cy);
    canvas.classList.toggle('can', (mode === 'desk' && t === 'laptop') || t === 'lamp');
    canvas.classList.toggle('grab', mode === 'inspect' && t !== 'lamp');
    const h = mode === 'desk' && t === 'laptop' && st.k < 0.02 ? 1 : 0;
    if (h !== tg.hover) { tg.hover = h; if (reduceMotion.matches) st.hover = h; invalidate(true); }
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (mode !== 'inspect') return;
    tg.zoom = clamp(tg.zoom * Math.exp(e.deltaY * 0.0012), 0.4, 1.3); invalidate(false);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); api.home(); });      // правая кнопка — «как было»
  canvas.addEventListener('auxclick', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (mode === 'inspect') { api.put(); e.preventDefault(); } return; }
    if (document.activeElement !== canvas) return;
    const s = 24;
    if (mode === 'inspect') {
      if (e.key === 'ArrowLeft') rotateBy(-s, 0); else if (e.key === 'ArrowRight') rotateBy(s, 0);
      else if (e.key === 'ArrowUp') rotateBy(0, -s); else if (e.key === 'ArrowDown') rotateBy(0, s); else return;
    } else if (e.key === 'Enter' || e.key === ' ') api.pick(); else return;
    e.preventDefault();
  });
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { refreshEnv(false); if (PRELIT) bakeDesk(BAKE_SAMPLES); invalidate(true); });

  // ---------- кадр ----------
  const stats = { frames: 0, shadowUpdates: 0, lastMs: 0, calls: 0, tris: 0, shadowCalls: 0, fps: 0, texMB: 0, textures: 0, geometries: 0 };
  const autoFocus = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function computeAutoFocus(a) {
    const tipY = dims.hingeY + dims.lidDepth * Math.sin(a), tipZ = dims.hingeZ + dims.lidDepth * Math.cos(a);
    const top = Math.max(dims.HB + dims.LT, tipY), zMin = Math.min(-dims.D / 2, tipZ), zMax = Math.max(dims.D / 2, tipZ);
    autoFocus.set(0, top / 2, (zMin + zMax) / 2);
  }
  let last = 0, lastEnvOn = null, fpsT = 0, fpsN = 0;
  function step(dt) {
    const snap = reduceMotion.matches;
    let moving = false, moved = false;
    // переход стол ⇄ руки: линейно по времени, плавность — на выходе (как камера в игре)
    if (st.k !== tg.k) {
      const d = snap ? 1 : dt * 1000 / TRANSITION_MS;
      st.k = tg.k > st.k ? Math.min(tg.k, st.k + d) : Math.max(tg.k, st.k - d);
      moving = st.k !== tg.k; moved = true;
    }
    const kq = snap ? 1 : 1 - Math.exp(-dt * 16), ks = snap ? 1 : 1 - Math.exp(-dt * 8);
    if (st.q.angleTo(tg.q) > 2e-4) { st.q.slerp(tg.q, kq); moving = true; moved = true; } else st.q.copy(tg.q);
    for (const k2 of ['lid', 'panX', 'panY', 'hover']) {
      if (Math.abs(st[k2] - tg[k2]) > 1e-4) { st[k2] += (tg[k2] - st[k2]) * (k2 === 'hover' ? kq : ks); moving = true; moved = true; } else st[k2] = tg[k2];
    }
    if (Math.abs(st.zoom - tg.zoom) > 1e-4) { st.zoom += (tg.zoom - st.zoom) * ks; moving = true; } else st.zoom = tg.zoom;
    if (Math.abs(st.lampK - tg.lampK) > 1e-3) { st.lampK += (tg.lampK - st.lampK) * (snap ? 1 : 1 - Math.exp(-dt * 22)); moving = true; } else st.lampK = tg.lampK;
    if (moved) shadowDirty = true;
    return moving;
  }
  function applyState() {
    const e = ease(st.k), eRot = ease(smooth(0.18, 1, st.k)), eCam = e;
    // вещь: сперва поднимается, потом доворачивается — углы не цепляют стол
    laptop.userData.setLidAngle(st.lid);
    computeAutoFocus(st.lid);
    inner.position.copy(autoFocus).multiplyScalar(-eRot);
    tmpV.copy(HOLD).addScaledVector(poseHold.right, st.panX).addScaledVector(poseHold.up, st.panY);
    holder.position.lerpVectors(restPos, tmpV, e);
    holder.position.y += Math.sin(Math.PI * e) * 0.035 + st.hover * 0.004 * (1 - e);
    holder.quaternion.slerpQuaternions(restQ, st.q, eRot);
    // камера
    tmpV.copy(HOLD).addScaledVector(poseHold.dir, poseHold.dist * st.zoom);
    camera.position.lerpVectors(poseDesk.pos, tmpV, eCam);
    camera.quaternion.slerpQuaternions(poseDesk.quat, poseHold.quat, eCam);
    camera.fov = lerp(poseDesk.fov, poseHold.fov, eCam);
    camera.updateProjectionMatrix();
    // лампа
    const on = st.lampK;
    key.intensity = KEY_I * on; glow.intensity = GLOW_I * on; bounce.intensity = BOUNCE_I * on;
    L.glass.emissiveIntensity = 1.5 * on; L.opal.emissiveIntensity = 3.2 * on; L.bulbMat.emissiveIntensity = 14 * on;
    renderer.toneMappingExposure = EXPOSURE * lerp(3.4, 1, on);     // лампа погашена — глаз привыкает к полутьме
    const wantOn = on > 0.5;
    if (wantOn !== lastEnvOn) { scene.environment = (wantOn ? envOn : envOff).texture; lastEnvOn = wantOn; }
    if (contactLaptop) contactLaptop.material.opacity = 0.8 * (1 - smooth(0, 0.45, e)) * (1 - st.hover * 0.15);
    if (PRELIT) { bake.uni.uLift.value = smooth(0.02, 0.5, e); bake.uni.uLamp.value = on; }
  }
  function draw() {
    applyState();
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; stats.shadowUpdates++; }
    const t0 = performance.now();
    renderer.info.reset();
    renderer.render(scene, camera);
    stats.lastMs = performance.now() - t0;
    stats.frames++;
    stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles;
    stats.textures = renderer.info.memory.textures; stats.geometries = renderer.info.memory.geometries;
  }
  function frame(t) {
    rafId = 0;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016; last = t;
    const moving = step(dt);
    if (moving || dirty) {
      dirty = false; draw();
      fpsN++; if (t - fpsT > 500) { stats.fps = Math.round(fpsN * 1000 / (t - fpsT)); fpsT = t; fpsN = 0; }
      if (showStats) paintStats();
    }
    if (moving) rafId = requestAnimationFrame(frame); else last = 0;
  }

  // ---------- цифры ----------
  function textureBytes() {
    const seen = new Set(); let bytes = 0;
    const addT = (t) => { if (!t || !t.isTexture || seen.has(t)) return; seen.add(t); const im = t.image; if (im && im.width) bytes += im.width * im.height * 4 * (t.generateMipmaps === false ? 1 : 1.333); };
    scene.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) { for (const k of Object.keys(m)) addT(m[k]); if (m.userData && m.userData.p47) for (const u of Object.values(m.userData.p47)) addT(u.value); }
    });
    const maps = bytes;
    const shadow = SM * SM * 8;                                   // цвет (упакованная глубина) + буфер глубины
    const envB = [envOn, envOff].reduce((s, r) => s + (r ? r.width * r.height * 8 : 0), 0);
    const bakeB = PRELIT ? Object.values(bake.rt).reduce((s, r) => s + r.width * r.height * 8 * 1.333, 0) : 0;
    return { maps, shadow, env: envB, bake: bakeB, total: maps + shadow + envB + bakeB };
  }
  function bench(n = 40, withShadow = false) {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    applyState(); renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { if (withShadow) renderer.shadowMap.needsUpdate = true; renderer.info.reset(); renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    const ms = (performance.now() - t0) / n;
    return { ms: +ms.toFixed(2), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }
  function report() {
    const tb = textureBytes(), mb = (b) => +(b / 1048576).toFixed(1);
    let gpu = '?'; try { const gl = renderer.getContext(), ex = gl.getExtension('WEBGL_debug_renderer_info'); if (ex) gpu = gl.getParameter(ex.UNMASKED_RENDERER_WEBGL); } catch (e) { /* нет расширения */ }
    return { gpu, mode, bake: BAKE, low: LOW, size: [vw, vh], pixelRatio: renderer.getPixelRatio(), shadowMap: SM, frames: stats.frames, shadowUpdates: stats.shadowUpdates,
      lastFrameCpuMs: +stats.lastMs.toFixed(2), calls: stats.calls, triangles: stats.tris, fps: stats.fps, textures: stats.textures, geometries: stats.geometries,
      texMB: { maps: mb(tb.maps), shadow: mb(tb.shadow), env: mb(tb.env), bake: mb(tb.bake), total: mb(tb.total) }, bakeMs: +bake.ms.toFixed(1), bakeCount: bake.count, laptop: laptop.userData.stats };
  }
  function paintStats() {
    if (!ui.stats) return;
    const r = report();
    ui.stats.textContent = `режим: ${r.bake === 0 ? 'вживую' : r.bake === 1 ? 'запечённый стол' : 'гибрид'}${r.low ? ' · телефон' : ''} · ${r.size[0]}×${r.size[1]} @${r.pixelRatio}\n`
      + `кадров нарисовано: ${r.frames} · пересчётов тени: ${r.shadowUpdates}\n`
      + `кадр (процессор): ${r.lastFrameCpuMs} мс · при движении ${r.fps || '—'} к/с\n`
      + `вызовов отрисовки: ${r.calls} · треугольников: ${r.triangles.toLocaleString('ru')}\n`
      + `текстур: ${r.textures} · память ≈ ${r.texMB.total} МБ (карты ${r.texMB.maps}, тень ${r.texMB.shadow}, окружение ${r.texMB.env}${PRELIT ? ', запекание ' + r.texMB.bake : ''})`
      + (PRELIT ? `\nзапекание стола: ${r.bakeMs} мс (всего ${r.bakeCount})` : '');
  }
  // служебное: где на экране вещь (для проверок без рук)
  const where = (what) => {
    const v = what === 'lamp' ? lampPos.clone().setY(0.03) : what === 'laptop' ? holder.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, mode === 'inspect' ? 0 : 0.01, mode === 'inspect' ? 0 : 0.03)) : new THREE.Vector3(0.75, 0, 0.6);
    v.project(camera); const r = canvas.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  };
  window.__desk47 = { where, report, bench, api, invalidate, renderer, scene, camera, st, tg, bakeDesk: (n, w) => { bakeDesk(n, w); invalidate(true); return bake.ms; } };

  // ---------- запуск ----------
  resize();
  if (viewName === 'inspect' || viewName === 'inspect_bottom' || viewName === 'inspect_side') {
    mode = 'inspect'; tg.k = 1;
    const v = viewName === 'inspect_bottom' ? VIEWS.bottom : viewName === 'inspect_side' ? VIEWS.side : VIEWS.home;
    flipped = viewName === 'inspect_bottom'; lidOpen = v.lid > 0;
    tg.q.copy(v.q); tg.zoom = v.zoom; tg.lid = v.lid;
  }
  if (params.get('ry') || params.get('rx')) {
    tg.q.premultiply(qOf(0, THREE.MathUtils.degToRad(parseFloat(params.get('ry') || '0')), 0)).premultiply(qOf(THREE.MathUtils.degToRad(parseFloat(params.get('rx') || '0')), 0, 0));
  }
  if (params.get('zoom')) tg.zoom = parseFloat(params.get('zoom'));
  if (params.get('lid')) tg.lid = parseFloat(params.get('lid'));
  snapAll(); sync();
  applyState();
  laptop.userData.ready.then((s) => {
    if (PRELIT) bakeDesk(BAKE_SAMPLES);
    invalidate(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = report();
      document.documentElement.dataset.desk47 = JSON.stringify(r);
      console.info('[desk47]', JSON.stringify(r));
      const nb = parseInt(params.get('bench') || '0', 10);
      if (nb) console.info('[desk47 bench]', JSON.stringify({ still: bench(nb, false), withShadow: bench(nb, true) }));
      if (showStats) paintStats();
    }));
    void s;
  });
  invalidate(true);
  // служебное: #act=pick,put,lamp,lid,flip,home — по очереди, с шагом (#step=мс)
  const stepMs = parseInt(params.get('step') || '1200', 10);
  for (const [i, a] of (params.get('act') || '').split(',').filter(Boolean).entries()) setTimeout(() => { if (api[a]) api[a](); }, 500 + i * stepMs);
  return api;
}
