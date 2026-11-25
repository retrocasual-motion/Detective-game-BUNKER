// laptop47.js — ноутбук Адама (материал дела № 47), построенный кодом three.js.
// Без файлов-моделей: форма — геометрией, пластик/износ/пыль/рельеф — текстурами canvas.
// Модуль не зависит от страницы: buildLaptop47(THREE, opts) -> THREE.Group.
//
// Узлы по именам:  lid_hinge (крышка, вращение вокруг своей оси X), screen (меш экрана),
//                  sticker_hexon_47 (наклейка на дне).
// Единицы — метры. Ось X — вправо, Y — вверх, Z — к пользователю. y = 0 — плоскость дна.
//
// opts:
//   lidAngle      — угол открытия крышки в радианах (0 — закрыта, по умолчанию 1.92 ≈ 110°)
//   textureSize   — ширина больших canvas-текстур (по умолчанию 2048; для телефона 1024–1536)
//   pbr           — true (по умолчанию): грани одеты в фото-карты GEN18 (цвет, нормали, шероховатость, AO),
//                   мелкий рельеф плиткой, пыль в щелях, смещение сетки на боках и решётках дна;
//                   false — прежний процедурный режим (всё рисуется кодом, файлы карт не нужны)
//   pbrBase       — папка карт (по умолчанию ./textures/pbr/ рядом с модулем; файлы берутся из её подпапки pack/)
//   lowPower      — телефон: сетки под смещение вдвое реже, карты вдвое меньше (по умолчанию — само:
//                   грубый указатель или сторона окна меньше 700)
//   stickerUrl    — путь к PNG наклейки (по умолчанию ./sticker_47_v4_rgba.png рядом с модулем)
//   stickerRoughUrl — карта шероховатости наклейки (по умолчанию ./sticker_47_v4_rough.png)
//   photoTextures — { lid, deck, bottom, left, right, bezel } : THREE.Texture — только при pbr: false
//   anisotropy    — анизотропная фильтрация (по умолчанию 8)
//   onChange      — вызывается, когда что-то догрузилось (наклейка) и нужен новый кадр
//
// group.userData: setLidAngle(a), lidAngle, ready (Promise: карты догружены), applyPhotoTexture(slot, texture),
//                 stats, dims, dispose()

// ---------- размеры (по классу 14" бизнес-ноутбука 2009 г., обобщённо) ----------
const W = 0.335, D = 0.238;          // ширина, глубина
const HB = 0.0215, HF = 0.0185;      // высота базы сзади и спереди (клин)
const R = 0.009;                     // радиус углов в плане
const LT = 0.0085;                   // толщина крышки
const SLOPE = Math.atan((HB - HF) / D);
const HZ = -D / 2 + 0.010;           // ось петель по Z
const hTop = (z) => HF + (HB - HF) * (D / 2 - z) / D;
const HY = hTop(HZ) + 0.005;         // ось петель по Y
const LZ0 = 0.002, LZ1 = D / 2 - HZ; // крышка в своих координатах: от оси до свободного края
const LD = LZ1 - LZ0;
const DECK_Y = (HB + HF) / 2;

// раскладка верхней панели (координаты x, z)
// Ниша клавиатуры и тачпад поставлены по фото GEN18 (26.11): ниша до z = 25,5 мм (ряды 19,3 мм вместо 18,5),
// тачпад сдвинут к переднему краю на ≈ 5 мм — так рамка ниши и кромки тачпада на фото совпадают с геометрией.
const TRAY = { x0: -0.1425, x1: 0.1425, z0: -0.086, z1: 0.0255, depth: 0.0036 };
const PADHOLE = { x0: -0.0489, x1: 0.0250, z0: 0.0398, z1: 0.1005, depth: 0.0012 };
const PAD_SPLIT = 0.0852;            // граница площадки тачпада и кнопок по Z
const U = 0.01887, ROW = 0.0193, FROW = 0.0125, KGAP = 0.0010;
const SCREEN = { w: 0.306, h: 0.192, zc: LZ0 + 0.021 + 0.096 };
const STICKER = { w: 0.0664, h: 0.0524, x: 0.092, z: 0.030 };
const GRAIN_TILE = 0.016;            // метров на один повтор плитки фактуры

// ---------- маленькие помощники ----------
function rngFactory(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  return c;
}
// цвет для карты шероховатость(G)/металл(B)
const rm = (rough, metal = 0, a = 1) =>
  `rgba(0,${Math.round(rough * 255)},${Math.round(metal * 255)},${a})`;
const gray = (v, a = 1) => `rgba(${v},${v},${v},${a})`;

function blob(ctx, x, y, rx, ry, rgb, alpha) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.45})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}
function rrect(ctx, x0, y0, x1, y1, r) {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.arcTo(x1, y0, x1, y0 + r, r);
  ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x1 - r, y1, r);
  ctx.lineTo(x0 + r, y1); ctx.arcTo(x0, y1, x0, y1 - r, r);
  ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r);
  ctx.closePath();
}

// ---------- «поверхность»: три холста — цвет, высота, шероховатость/металл ----------
function makeSurf(w, h, baseColor, baseRough, baseMetal = 0, rScale = 0.5) {
  const cc = mkCanvas(w, h), hc = mkCanvas(w, h), rc = mkCanvas(w * rScale, h * rScale);
  const c = cc.getContext('2d', { willReadFrequently: true });
  const g = hc.getContext('2d', { willReadFrequently: true });
  const r = rc.getContext('2d', { willReadFrequently: true });
  if (baseColor) { c.fillStyle = baseColor; c.fillRect(0, 0, cc.width, cc.height); }
  g.fillStyle = gray(128); g.fillRect(0, 0, hc.width, hc.height);
  r.fillStyle = rm(baseRough, baseMetal); r.fillRect(0, 0, rc.width, rc.height);
  r.scale(rc.width / cc.width, rc.height / cc.height);
  return { w: cc.width, h: cc.height, c, g, r, cc, hc, rc };
}

// высота -> карта нормалей (+ мелкое зерно пластика)
function heightToNormalCanvas(hc, strength, grain, rng) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const k = strength / 255;
  for (let y = 0; y < h; y++) {
    const yu = y > 0 ? y - 1 : y, yd = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x;
      let dx = (src[(y * w + xr) * 4] - src[(y * w + xl) * 4]) * k;
      let dy = (src[(yd * w + x) * 4] - src[(yu * w + x) * 4]) * k;
      if (grain) { dx += (rng() - 0.5) * grain; dy += (rng() - 0.5) * grain; }
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}
function addNoise(ctx, w, h, amp, rng, channels = 7, keepAlpha = true) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (keepAlpha && d[i + 3] === 0) continue;
    const n = (rng() - 0.5) * amp;
    if (channels & 1) d[i] += n;
    if (channels & 2) d[i + 1] += n;
    if (channels & 4) d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------- геометрия ----------
function mergeGeos(THREE, list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const hasCol = list.some((g) => g.attributes.color);
  const col = hasCol ? new Float32Array(nv * 3).fill(1) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (col && g.attributes.color) col.set(g.attributes.color.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// контур скруглённого прямоугольника в плоскости XZ
function outline(hw, hd, r, seg, cx, cz) {
  const pts = [];
  const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const ox = cx + cs[k][0] * (hw - r), oz = cz + cs[k][1] * (hd - r);
    for (let s = 0; s <= seg; s++) {
      const a = (k + s / seg) * Math.PI / 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      const cw = 1 - Math.abs(s / seg - 0.5) * 2; // 1 в середине угла
      pts.push({ x: ox + nx * r, z: oz + nz * r, nx, nz, cw });
    }
  }
  pts.push(Object.assign({}, pts[0]));
  return pts;
}

// боковая «лента» плиты: профиль [[inset, y, wear], ...] снизу вверх вдоль контура.
// Нормали — аналитические; длинные плоские участки подпираются добавочными кольцами.
function sideGeo(THREE, p) {
  const { hw, hd, r, cx = 0, cz = 0, seg = 8, inward = false, uvScale = 1 / GRAIN_TILE, wearAmp = 1, skip = null } = p;
  // подпорные кольца
  const prof = [];
  for (let i = 0; i < p.profile.length; i++) {
    const a = p.profile[i];
    prof.push([a[0], a[1], a[2] || 0]);
    const b = p.profile[i + 1];
    if (b) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 0.003) {
        const t = 0.00015 / len;
        prof.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]);
        prof.push([b[0] - (b[0] - a[0]) * t, b[1] - (b[1] - a[1]) * t, 0]);
      }
    }
  }
  const nr = prof.length;
  // нормали профиля (радиальная, вертикальная)
  const pn = [];
  for (let i = 0; i < nr; i++) {
    let rx = 0, ry = 0;
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= nr - 1) continue;
      const di = prof[j + 1][0] - prof[j][0], dy = prof[j + 1][1] - prof[j][1];
      const l = Math.hypot(di, dy) || 1;
      rx += dy / l; ry += di / l;
    }
    const l = Math.hypot(rx, ry) || 1;
    pn.push([rx / l, ry / l]);
  }
  const base = outline(hw, hd, Math.max(r, 1e-4), seg, cx, cz);
  const nc = base.length;
  const ulen = [0];
  for (let j = 1; j < nc; j++) ulen.push(ulen[j - 1] + Math.hypot(base[j].x - base[j - 1].x, base[j].z - base[j - 1].z));
  const pos = [], nor = [], uv = [], col = [], idx = [];
  let v = 0;
  for (let i = 0; i < nr; i++) {
    const ins = inward ? -prof[i][0] : prof[i][0];
    if (i > 0) v += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
    const ring = outline(hw - ins, hd - ins, Math.max(r - ins, 1e-4), seg, cx, cz);
    for (let j = 0; j < nc; j++) {
      const q = ring[j];
      pos.push(q.x, prof[i][1], q.z);
      const s = inward ? -1 : 1;
      nor.push(q.nx * pn[i][0] * s, pn[i][1], q.nz * pn[i][0] * s);
      uv.push(ulen[j] * uvScale, v * uvScale);
      const c = 1 + prof[i][2] * wearAmp * (0.16 + 0.34 * q.cw);
      col.push(c, c, c);
    }
  }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    if (skip && skip(prof[i], prof[i + 1], j)) continue; // «окно» в ленте — туда встанет своя плотная сетка
    const a = i * nc + j, b = (i + 1) * nc + j, c = i * nc + j + 1, d = (i + 1) * nc + j + 1;
    if (inward) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function rrPath(path, x0, z0, x1, z1, r) {
  const P = Math.PI;
  if (r <= 0) { path.moveTo(x0, z0); path.lineTo(x1, z0); path.lineTo(x1, z1); path.lineTo(x0, z1); path.closePath(); return path; }
  path.moveTo(x0 + r, z0); path.lineTo(x1 - r, z0); path.absarc(x1 - r, z0 + r, r, -P / 2, 0, false);
  path.lineTo(x1, z1 - r); path.absarc(x1 - r, z1 - r, r, 0, P / 2, false);
  path.lineTo(x0 + r, z1); path.absarc(x0 + r, z1 - r, r, P / 2, P, false);
  path.lineTo(x0, z0 + r); path.absarc(x0 + r, z0 + r, r, P, P * 1.5, false);
  return path;
}
// плоская крышка плиты (с отверстиями), нормаль вверх или вниз
function capGeo(THREE, p) {
  const { hw, hd, r, cx = 0, cz = 0, y, up = true, holes = [], seg = 8 } = p;
  const uvf = p.uv || ((x, z) => [x / GRAIN_TILE, z / GRAIN_TILE]);
  const shape = rrPath(new THREE.Shape(), cx - hw, cz - hd, cx + hw, cz + hd, r);
  for (const h of holes) shape.holes.push(rrPath(new THREE.Path(), h.x0, h.z0, h.x1, h.z1, h.r || 0));
  const g = new THREE.ShapeGeometry(shape, seg);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i);
    pos.setXYZ(i, x, y, z); nor.setXYZ(i, 0, up ? 1 : -1, 0);
    const t = uvf(x, z); uv.setXY(i, t[0], t[1]);
  }
  if (up) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  return g;
}
// небольшая скруглённая «плитка» (кнопка, ножка): бок + верх одной геометрией
function chipParts(THREE, hw, hd, r, h, bevel, up = true, seg = 4, capUv) {
  const s = up ? 1 : -1;
  const prof = up
    ? [[0, 0], [0, h - bevel], [bevel * 0.3, h - bevel * 0.3], [bevel, h]]
    : [[bevel, -h], [bevel * 0.3, -h + bevel * 0.3], [0, -h + bevel], [0, 0]];
  return {
    side: sideGeo(THREE, { hw, hd, r, profile: prof, seg }),
    cap: capGeo(THREE, { hw: hw - bevel, hd: hd - bevel, r: Math.max(r - bevel, 1e-4), y: s * h, up, seg, uv: capUv }),
  };
}

// ---------- раскладка клавиатуры (латинская QWERTY) ----------
function keyLayout() {
  const keys = [];
  const x0 = TRAY.x0 + 0.001;
  const rowZ = (i) => (i === 0 ? TRAY.z0 + 0.001 + FROW / 2 : TRAY.z0 + 0.001 + FROW + ROW * (i - 0.5));
  const two = (a, b) => ({ top: a, bot: b });
  const rows = [
    ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrtSc', 'Ins', 'Del'].map((l) => [l, 15 / 16, 0.05]),
    [[two('~', '`'), 1, 0.1], [two('!', '1'), 1, 0.3], [two('@', '2'), 1, 0.3], [two('#', '3'), 1, 0.25], [two('$', '4'), 1, 0.2],
      [two('%', '5'), 1, 0.2], [two('^', '6'), 1, 0.15], [two('&', '7'), 1, 0.15], [two('*', '8'), 1, 0.15], [two('(', '9'), 1, 0.2],
      [two(')', '0'), 1, 0.3], [two('_', '-'), 1, 0.25], [two('+', '='), 1, 0.15], ['Backspace', 2, 0.75]],
    [['Tab', 1.5, 0.45], ['Q', 1, 0.3], ['W', 1, 0.45], ['E', 1, 0.9], ['R', 1, 0.7], ['T', 1, 0.8], ['Y', 1, 0.4], ['U', 1, 0.5], ['I', 1, 0.75],
      ['O', 1, 0.75], ['P', 1, 0.45], [two('{', '['), 1, 0.1], [two('}', ']'), 1, 0.1], [two('|', '\\'), 1.5, 0.1]],
    [['Caps', 1.75, 0.2], ['A', 1, 0.85], ['S', 1, 0.75], ['D', 1, 0.6], ['F', 1, 0.5], ['G', 1, 0.4], ['H', 1, 0.55], ['J', 1, 0.35], ['K', 1, 0.4],
      ['L', 1, 0.6], [two(':', ';'), 1, 0.2], [two('"', "'"), 1, 0.2], ['Enter', 2.25, 0.85]],
    [['Shift', 2.25, 0.65], ['Z', 1, 0.3], ['X', 1, 0.4], ['C', 1, 0.7], ['V', 1, 0.7], ['B', 1, 0.35], ['N', 1, 0.75], ['M', 1, 0.5],
      [two('<', ','), 1, 0.5], [two('>', '.'), 1, 0.5], [two('?', '/'), 1, 0.2], ['Shift', 2.75, 0.3]],
    [['Ctrl', 1.25, 0.7], ['Fn', 1, 0.15], ['', 1, 0.1], ['Alt', 1.25, 0.4], [' ', 5.5, 1.0], ['Alt', 1.25, 0.2], ['Ctrl', 1.25, 0.15]],
  ];
  rows.forEach((row, ri) => {
    let x = x0;
    const d = (ri === 0 ? FROW : ROW) - KGAP;
    for (const [label, wu, wear] of row) {
      const w = wu * U - KGAP;
      keys.push({ x: x + wu * U / 2, z: rowZ(ri), w, d, label, wear, row: ri });
      x += wu * U;
    }
    if (ri === 5) { // стрелки «перевёрнутой Т» половинной высоты
      const aw = (2.5 * U) / 3, hd = ROW / 2;
      const zc = rowZ(5);
      const mk = (i, top, label) => keys.push({ x: x + aw * (i + 0.5), z: zc + (top ? -hd / 2 : hd / 2), w: aw - KGAP, d: hd - KGAP * 0.8, label, wear: 0.35, row: 5, arrow: true });
      mk(0, false, 'left'); mk(1, true, 'up'); mk(1, false, 'down'); mk(2, false, 'right');
    }
  });
  return keys;
}

// =====================================================================================
export function buildLaptop47(THREE, opts = {}) {
  const t0 = now();
  const o = Object.assign({ lidAngle: 1.92, textureSize: 2048, photoTextures: {}, anisotropy: 8, seed: 47, onChange: null, pbr: true }, opts);
  const rel = (p) => { try { return new URL(p, import.meta.url).href; } catch (e) { return p; } };
  if (!o.stickerUrl) { // по умолчанию наклейка v4 и её карта шероховатости
    o.stickerUrl = rel('./sticker_47_v4_rgba.png');
    if (o.stickerRoughUrl === undefined) o.stickerRoughUrl = rel('./sticker_47_v4_rough.png');
  }
  const PBR = o.pbr !== false;
  const pbrBase = o.pbrBase || rel('./textures/pbr/');
  // слабое устройство (телефон): сетки под смещение вдвое реже, карты вдвое меньше
  const LOW = o.lowPower != null ? !!o.lowPower
    : (typeof window !== 'undefined' && ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || Math.min(window.innerWidth, window.innerHeight) < 700));
  const DENS = LOW ? 0.5 : 1;
  const TS = Math.max(512, Math.min(2048, o.textureSize | 0));
  const rng = rngFactory(o.seed);
  const rr = (a, b) => a + (b - a) * rng();
  const disposables = [];

  // ----- текстуры -----
  function tex(canvas, srgb, repeat) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = o.anisotropy;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    disposables.push(t);
    return t;
  }
  function finishSurf(S, p = {}) {
    const { strength = 2.0, grain = 0.16, colorNoise = 7, roughNoise = 14 } = p;
    if (colorNoise) addNoise(S.c, S.w, S.h, colorNoise, rng, 7);
    if (roughNoise) addNoise(S.r, S.rc.width, S.rc.height, roughNoise, rng, 2);
    const nc = heightToNormalCanvas(S.hc, strength, grain, rng);
    S.hc.width = S.hc.height = 2; // высота больше не нужна — освобождаем память
    return { map: tex(S.cc, true), normalMap: tex(nc, false), orm: tex(S.rc, false) };
  }
  function surfMaterial(T, extra = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({
      map: T.map, normalMap: T.normalMap, roughnessMap: T.orm, metalnessMap: T.orm, roughness: 1, metalness: 1,
    }, extra));
    disposables.push(m);
    return m;
  }

  // плитка мелкой фактуры пластика (нормали), бесшовная
  const grainTex = (() => {
    const n = 256, hc = mkCanvas(n, n), g = hc.getContext('2d', { willReadFrequently: true });
    const img = g.createImageData(n, n);
    const f = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) f[i] = rng();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { // лёгкое сглаживание с заворотом
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += f[((y + dy + n) % n) * n + ((x + dx + n) % n)] * (dx === 0 && dy === 0 ? 4 : 1);
      const v = (s / 12) * 255, i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // нормали с заворотом по краям
    const out = mkCanvas(n, n), octx = out.getContext('2d'), oi = octx.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const h = (xx, yy) => img.data[(((yy + n) % n) * n + ((xx + n) % n)) * 4] / 255;
      const dx = (h(x + 1, y) - h(x - 1, y)) * 2.2, dy = (h(x, y + 1) - h(x, y - 1)) * 2.2;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * n + x) * 4;
      oi.data[i] = (-dx * inv * 0.5 + 0.5) * 255; oi.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255; oi.data[i + 2] = (inv * 0.5 + 0.5) * 255; oi.data[i + 3] = 255;
    }
    octx.putImageData(oi, 0, 0);
    return tex(out, false, true);
  })();

  const COL_BODY = '#1d1f22', COL_KEY = PBR ? '#2b2b2c' : '#17181a', COL_LID = '#1f2125', COL_BOTTOM = '#1b1c1f';
  const DUST = '168,162,150';

  function dustSpecks(c, n, x0, y0, x1, y1, aMax = 0.3, rMax = 1.3) {
    for (let i = 0; i < n; i++) {
      c.fillStyle = `rgba(${DUST},${rr(0.06, aMax)})`;
      c.beginPath(); c.arc(rr(x0, x1), rr(y0, y1), rr(0.4, rMax), 0, 7); c.fill();
    }
  }
  // пыль вдоль линии (щель, шов): россыпь крапинок, прижатых к линии
  function dustLine(c, xa, ya, xb, yb, density, spread, aMax = 0.35) {
    const len = Math.hypot(xb - xa, yb - ya), n = Math.round(len * density);
    for (let i = 0; i < n; i++) {
      const t = rng(), off = (rng() + rng() - 1) * spread;
      const nx = -(yb - ya) / (len || 1), ny = (xb - xa) / (len || 1);
      c.fillStyle = `rgba(${DUST},${rr(0.05, aMax)})`;
      c.beginPath(); c.arc(xa + (xb - xa) * t + nx * off, ya + (yb - ya) * t + ny * off, rr(0.35, 1.0), 0, 7); c.fill();
    }
  }
  function dustRectEdge(c, x0, y0, x1, y1, density, spread, aMax) {
    dustLine(c, x0, y0, x1, y0, density, spread, aMax); dustLine(c, x1, y0, x1, y1, density, spread, aMax);
    dustLine(c, x1, y1, x0, y1, density, spread, aMax); dustLine(c, x0, y1, x0, y0, density, spread, aMax);
  }
  // потёртая кромка: по периметру чуть светлее и глаже, сильнее на углах
  function edgeWear(S, inset, width, strength, roughTo) {
    const { c, r, w, h } = S;
    for (const [ctx, style, a] of [[c, '255,255,255', 0.05 * strength], [r, null, 0.5 * strength]]) {
      ctx.save();
      ctx.lineWidth = width;
      ctx.strokeStyle = style ? `rgba(${style},${a})` : rm(roughTo, 0, a);
      for (let k = 0; k < 3; k++) { rrect(ctx, inset + k * width * 0.3, inset + k * width * 0.3, w - inset - k * width * 0.3, h - inset - k * width * 0.3, width * 2); ctx.stroke(); }
      ctx.restore();
    }
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
      blob(c, x, y, width * 9, width * 9, '255,255,255', 0.09 * strength);
      blob(r, x, y, width * 9, width * 9, `0,${Math.round(roughTo * 255)},0`, 0.8 * strength);
    }
  }
  function mottling(S, n, amp) {
    for (let i = 0; i < n; i++) {
      const dark = rng() < 0.5;
      blob(S.c, rr(0, S.w), rr(0, S.h), rr(S.w * 0.04, S.w * 0.18), rr(S.w * 0.03, S.w * 0.12), dark ? '0,0,0' : '255,255,255', rr(0.3, 1) * amp);
    }
    for (let i = 0; i < n; i++) {
      blob(S.r, rr(0, S.w), rr(0, S.h), rr(S.w * 0.03, S.w * 0.15), rr(S.w * 0.03, S.w * 0.1), rng() < 0.5 ? '0,90,0' : '0,210,0', rr(0.04, 0.12));
    }
  }
  function screwHead(S, x, y, rRecess, rHead) {
    const { c, g, r } = S;
    let gr = g.createRadialGradient(x, y, rHead * 0.9, x, y, rRecess);
    gr.addColorStop(0, gray(70)); gr.addColorStop(0.8, gray(84)); gr.addColorStop(1, gray(128));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rRecess, 0, 7); g.fill();
    c.fillStyle = '#0c0c0d'; c.beginPath(); c.arc(x, y, rRecess * 0.96, 0, 7); c.fill();
    gr = c.createRadialGradient(x - rHead * 0.3, y - rHead * 0.3, 0, x, y, rHead);
    gr.addColorStop(0, '#6d6d70'); gr.addColorStop(1, '#3d3d40');
    c.fillStyle = gr; c.beginPath(); c.arc(x, y, rHead, 0, 7); c.fill();
    r.fillStyle = rm(0.42, 1); r.beginPath(); r.arc(x, y, rHead, 0, 7); r.fill();
    const a = rr(0, Math.PI);
    c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = '#101011';
    c.fillRect(-rHead * 0.62, -rHead * 0.13, rHead * 1.24, rHead * 0.26); c.fillRect(-rHead * 0.13, -rHead * 0.62, rHead * 0.26, rHead * 1.24);
    c.restore();
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = gray(52);
    g.fillRect(-rHead * 0.62, -rHead * 0.13, rHead * 1.24, rHead * 0.26); g.fillRect(-rHead * 0.13, -rHead * 0.62, rHead * 0.26, rHead * 1.24);
    g.restore();
    // пыль в углублении
    for (let i = 0; i < 14; i++) {
      const an = rr(0, 6.28), rad = rr(rHead * 1.02, rRecess * 0.95);
      c.fillStyle = `rgba(${DUST},${rr(0.1, 0.4)})`; c.beginPath(); c.arc(x + Math.cos(an) * rad, y + Math.sin(an) * rad, rr(0.5, 1.4), 0, 7); c.fill();
    }
  }
  function groove(S, drawPath, wpx = 2, depth = 70) {
    const { c, g } = S;
    g.save(); g.lineWidth = wpx; g.strokeStyle = gray(depth); drawPath(g); g.stroke(); g.restore();
    c.save(); c.lineWidth = wpx * 0.8; c.strokeStyle = 'rgba(0,0,0,0.75)'; drawPath(c); c.stroke(); c.restore();
  }

  // ===== текстура верхней панели (вид сверху, зад — вверху холста) =====
  function drawDeck() {
    const w = TS, h = Math.round(TS * D / W), k = w / W;
    const X = (x) => (x + W / 2) * k, Z = (z) => (z + D / 2) * k;
    const S = makeSurf(w, h, COL_BODY, 0.56);
    const { c, g, r } = S;
    mottling(S, 40, 0.035);
    // упоры для ладоней: отполированы до сатинового блеска
    const palms = [[-0.108, 0.068, 0.050, 0.036], [0.096, 0.070, 0.058, 0.038]];
    for (const [px, pz, prx, prz] of palms) {
      blob(r, X(px), Z(pz), prx * k * 1.25, prz * k * 1.25, '0,82,0', 0.9);
      
      for (let i = 0; i < 10; i++) { // неровный край полировки
        const a = rr(0, 6.28), d = rr(0.4, 1.0);
        blob(r, X(px + Math.cos(a) * prx * d), Z(pz + Math.sin(a) * prz * d), rr(0.016, 0.03) * k, rr(0.012, 0.022) * k, '0,98,0', rr(0.15, 0.3));
      }
    }
    // передняя кромка под запястьями
    for (let i = 0; i < 30; i++) {
      const x = rr(-0.15, 0.15);
      blob(r, X(x), Z(D / 2 - 0.004), rr(0.02, 0.04) * k, 0.006 * k, '0,98,0', rr(0.2, 0.4));
    }
    edgeWear(S, 0.002 * k, 0.0022 * k, 1.0, 0.36);
    // полоса динамика — перфорация
    const sx0 = -0.098, sx1 = 0.098, sz0 = -0.1010, sz1 = -0.0915;
    groove(S, (q) => rrect(q, X(sx0 - 0.002), Z(sz0 - 0.0012), X(sx1 + 0.002), Z(sz1 + 0.0012), 0.002 * k), 1.5, 96);
    const pitch = 0.00145;
    let row = 0;
    for (let z = sz0 + 0.0006; z < sz1; z += pitch * 0.866, row++) {
      for (let x = sx0 + (row % 2 ? pitch / 2 : 0); x < sx1; x += pitch) {
        const dusty = rng() < 0.16;
        c.fillStyle = dusty ? `rgba(${DUST},${rr(0.25, 0.5)})` : '#070708';
        c.beginPath(); c.arc(X(x), Z(z), 0.00040 * k, 0, 7); c.fill();
        if (dusty) { c.fillStyle = 'rgba(7,7,8,0.55)'; c.beginPath(); c.arc(X(x), Z(z), 0.00040 * k, 0, 7); c.fill(); }
        g.fillStyle = gray(60); g.beginPath(); g.arc(X(x), Z(z), 0.00042 * k, 0, 7); g.fill();
      }
    }
    // кольцо вокруг кнопки питания и три глазка индикаторов (не горят)
    groove(S, (q) => { q.beginPath(); q.arc(X(0.130), Z(-0.0963), 0.0056 * k, 0, 7); }, 1.6, 84);
    for (let i = 0; i < 3; i++) {
      const lx = X(-0.134 + i * 0.0075), lz = Z(-0.0963);
      c.fillStyle = '#0a0b0c'; c.beginPath(); c.arc(lx, lz, 0.0011 * k, 0, 7); c.fill();
      r.fillStyle = rm(0.18); r.beginPath(); r.arc(lx, lz, 0.0011 * k, 0, 7); r.fill();
      g.fillStyle = gray(112); g.beginPath(); g.arc(lx, lz, 0.0012 * k, 0, 7); g.fill();
    }
    // пыль: у петель и задней полосы гуще, вокруг клавиатуры и тачпада — по щели
    dustSpecks(c, 1500, 0, 0, w, h, 0.2, 1.1);
    dustSpecks(c, 1400, 0, 0, w, Z(-0.100), 0.38, 1.5);
    dustLine(c, X(-0.16), Z(-0.1045), X(0.16), Z(-0.1045), 1.6, 0.0025 * k, 0.5);
    for (const hx of [-0.128, 0.128]) blob(c, X(hx), Z(-0.106), 0.022 * k, 0.006 * k, DUST, 0.16);
    dustRectEdge(c, X(TRAY.x0), Z(TRAY.z0), X(TRAY.x1), Z(TRAY.z1), 0.9, 0.0011 * k, 0.45);
    dustRectEdge(c, X(PADHOLE.x0), Z(PADHOLE.z0), X(PADHOLE.x1), Z(PADHOLE.z1), 0.7, 0.0008 * k, 0.4);
    // лёгкие следы пальцев у клавиатуры
    for (let i = 0; i < 10; i++) blob(r, X(rr(-0.15, 0.15)), Z(rr(0.022, 0.03)), rr(0.004, 0.009) * k, rr(0.003, 0.006) * k, '0,96,0', rr(0.2, 0.45));
    return finishSurf(S, { strength: 2.2, grain: 0.07, colorNoise: 4, roughNoise: 10 });
  }

  // ===== текстура дна (вид снизу: X зеркален, зад — вверху холста) =====
  const FEET = [[-0.143, -0.100], [0.143, -0.100], [-0.140, 0.094], [0.140, 0.094]];
  function drawBottom() {
    const w = TS, h = Math.round(TS * D / W), k = w / W;
    const X = (x) => (W / 2 - x) * k, Z = (z) => (z + D / 2) * k;
    const S = makeSurf(w, h, COL_BOTTOM, 0.66);
    const { c, g, r } = S;
    mottling(S, 46, 0.04);
    // крышка батареи — задняя полоса, чуть иной пластик
    const bx0 = -0.108, bx1 = 0.108, bz1 = -0.066;
    c.fillStyle = 'rgba(255,255,255,0.035)'; c.fillRect(X(bx1), 0, (bx1 - bx0) * k, Z(bz1));
    r.fillStyle = rm(0.54, 0, 0.8); r.fillRect(X(bx1), 0, (bx1 - bx0) * k, Z(bz1));
    groove(S, (q) => { q.beginPath(); q.moveTo(X(bx1), 0); q.lineTo(X(bx1), Z(bz1)); q.lineTo(X(bx0), Z(bz1)); q.lineTo(X(bx0), 0); }, 2.2, 60);
    dustLine(c, X(bx1), Z(bz1), X(bx0), Z(bz1), 1.2, 0.0007 * k, 0.5);
    dustLine(c, X(bx1), 0, X(bx1), Z(bz1), 1.2, 0.0007 * k, 0.5); dustLine(c, X(bx0), 0, X(bx0), Z(bz1), 1.2, 0.0007 * k, 0.5);
    // ребристые ползунки-защёлки батареи
    for (const lx of [-0.082, 0.082]) {
      const x0 = X(lx + 0.009), x1 = X(lx - 0.009), z0 = Z(-0.0625), z1 = Z(-0.0555);
      groove(S, (q) => rrect(q, x0, z0, x1, z1, 0.0008 * k), 1.6, 76);
      for (let x = x0 + 4; x < x1 - 3; x += 0.0016 * k) {
        g.fillStyle = gray(168); g.fillRect(x, z0 + 3, 0.0007 * k, z1 - z0 - 6);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 0.0007 * k, z0 + 3, 0.0007 * k, z1 - z0 - 6);
      }
      dustLine(c, x0, z1, x1, z1, 1.5, 0.0005 * k, 0.5);
    }
    // вентиляционные щели
    const slots = (xa, xb, za, zb, pz) => {
      const x0 = Math.min(X(xa), X(xb)), x1 = Math.max(X(xa), X(xb));
      for (let z = za; z < zb; z += pz) {
        const y0 = Z(z), sh = pz * 0.52 * k;
        c.fillStyle = '#040404'; rrect(c, x0, y0, x1, y0 + sh, sh / 2); c.fill();
        g.fillStyle = gray(30); rrect(g, x0, y0, x1, y0 + sh, sh / 2); g.fill();
        r.fillStyle = rm(0.9); r.fillRect(x0, y0, x1 - x0, sh);
        dustLine(c, x0, y0 + sh * 0.85, x1, y0 + sh * 0.85, 0.5, sh * 0.25, 0.55);
        if (rng() < 0.3) blob(c, rr(x0, x1), y0 + sh / 2, rr(4, 14), sh * 0.7, DUST, rr(0.12, 0.3));
      }
    };
    slots(0.002, 0.017, -0.044, 0.060, 0.0024); // длинная колонка в центре
    // люк с винтами (память/диск) и решётка вентилятора внутри него
    const hx0 = -0.138, hx1 = -0.034, hz0 = -0.050, hz1 = 0.062;
    groove(S, (q) => rrect(q, X(hx1), Z(hz0), X(hx0), Z(hz1), 0.004 * k), 2.2, 58);
    c.fillStyle = 'rgba(0,0,0,0.05)'; rrect(c, X(hx1), Z(hz0), X(hx0), Z(hz1), 0.004 * k); c.fill();
    dustRectEdge(c, X(hx1), Z(hz0), X(hx0), Z(hz1), 0.9, 0.0007 * k, 0.5);
    for (let i = 0; i < 3; i++) slots(-0.128 + i * 0.0125, -0.118 + i * 0.0125, -0.040, -0.004, 0.0022);
    // выемка под ноготь у люка
    g.fillStyle = gray(92); rrect(g, X(-0.080), Z(hz1 - 0.001), X(-0.094), Z(hz1 + 0.004), 0.002 * k); g.fill();
    c.fillStyle = 'rgba(0,0,0,0.4)'; rrect(c, X(-0.080), Z(hz1 - 0.001), X(-0.094), Z(hz1 + 0.004), 0.002 * k); c.fill();
    // винты
    const screws = [[hx0 + 0.007, hz0 + 0.007], [hx1 - 0.007, hz0 + 0.007], [hx0 + 0.007, hz1 - 0.007], [hx1 - 0.007, hz1 - 0.007],
      [0.152, -0.050], [-0.152, -0.058], [0.150, 0.060], [0.045, 0.100], [-0.060, 0.100], [0.045, -0.052], [0.118, -0.062], [-0.118, -0.062]];
    for (const [sx, sz] of screws) screwHead(S, X(sx), Z(sz), 0.0029 * k, 0.0019 * k);
    // шов передней кромки
    groove(S, (q) => { q.beginPath(); q.moveTo(X(0.158), Z(0.106)); q.lineTo(X(-0.158), Z(0.106)); }, 1.6, 84);
    dustLine(c, X(0.158), Z(0.106), X(-0.158), Z(0.106), 0.8, 0.0006 * k, 0.4);
    // мелкие параллельные потёртости от скольжения по столу
    for (let i = 0; i < 520; i++) {
      const zone = rng();
      let x = rr(-0.16, 0.16), z = rr(-0.115, 0.115);
      if (zone < 0.35) z = rr(-0.115, -0.07); else if (zone < 0.55) z = rr(0.07, 0.115);
      const len = rr(0.003, 0.03) * k, a = rr(-0.12, 0.12) + (rng() < 0.12 ? rr(-0.5, 0.5) : 0);
      const xa = X(x), ya = Z(z), xb = xa + Math.cos(a) * len, yb = ya + Math.sin(a) * len;
      c.strokeStyle = `rgba(215,215,220,${rr(0.02, 0.085)})`; c.lineWidth = rr(0.6, 1.3);
      c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke();
      r.strokeStyle = rm(0.42, 0, rr(0.15, 0.4)); r.lineWidth = 2;
      r.beginPath(); r.moveTo(xa, ya); r.lineTo(xb, yb); r.stroke();
    }
    // выступающие зоны затёрты до блеска
    for (let i = 0; i < 9; i++) blob(r, X(rr(-0.09, 0.09)), Z(rr(-0.108, -0.078)), rr(0.03, 0.06) * k, rr(0.01, 0.018) * k, '0,104,0', rr(0.15, 0.3));
    edgeWear(S, 0.0052 * k, 0.0026 * k, 1.2, 0.4);
    // пыль вокруг ножек
    for (const [fx, fz] of FEET) {
      const hw = 0.0105 * k, hd = 0.0052 * k;
      dustRectEdge(c, X(fx) - hw, Z(fz) - hd, X(fx) + hw, Z(fz) + hd, 1.3, 0.0009 * k, 0.5);
    }
    dustSpecks(c, 2600, 0, 0, w, h, 0.22, 1.2);
    return finishSurf(S, { strength: 2.4, grain: 0.13, colorNoise: 4, roughNoise: 14 });
  }

  // ===== крышка снаружи: тонкая шлифовка полосой =====
  function drawLid() {
    const w = TS, h = Math.round(TS * LD / W);
    const k = w / W;
    const S = makeSurf(w, h, COL_LID, 0.46, 0);
    const { c, g, r } = S;
    mottling(S, 30, 0.03);
    // построчная шлифовка
    for (let y = 0; y < h; y++) {
      const v = rng();
      c.fillStyle = v < 0.5 ? `rgba(0,0,0,${(0.5 - v) * 0.10})` : `rgba(255,255,255,${(v - 0.5) * 0.035})`;
      c.fillRect(0, y, w, 1);
      g.fillStyle = gray(Math.round(128 + (rng() - 0.5) * 70)); g.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 2600; i++) {
      const y = Math.floor(rr(0, h)), x = rr(-0.4, 1) * w, len = rr(0.3, 1.2) * w, light = rng() < 0.5;
      c.fillStyle = light ? `rgba(255,255,255,${rr(0.006, 0.02)})` : `rgba(0,0,0,${rr(0.015, 0.05)})`;
      c.fillRect(x, y, len, 1);
      g.fillStyle = gray(light ? 150 : 100, 0.5); g.fillRect(x, y, len, 1);
    }
    // общий износ: кромка и углы светлее и глаже, следы от сумки — едва заметные, без глубоких царапин
    edgeWear(S, 0.001 * k, 0.003 * k, 0.8, 0.3);
    for (let i = 0; i < 90; i++) {
      const xa = rr(0.05, 0.95) * w, ya = rr(0.08, 0.92) * h, a = rr(-0.5, 0.5) + (rng() < 0.3 ? 1.3 : 0), len = rr(0.004, 0.02) * k;
      c.strokeStyle = `rgba(220,220,225,${rr(0.015, 0.05)})`; c.lineWidth = rr(0.6, 1.2);
      c.beginPath(); c.moveTo(xa, ya); c.lineTo(xa + Math.cos(a) * len, ya + Math.sin(a) * len); c.stroke();
    }
    // отпечатки: где берут, чтобы открыть (передний край), и по центру
    for (let i = 0; i < 16; i++) blob(r, rr(0.25, 0.75) * w, rr(0.86, 0.97) * h, rr(0.006, 0.012) * k, rr(0.007, 0.012) * k, '0,150,0', rr(0.12, 0.3));
    for (let i = 0; i < 12; i++) blob(r, rr(0.1, 0.9) * w, rr(0.1, 0.8) * h, rr(0.008, 0.02) * k, rr(0.008, 0.016) * k, '0,150,0', rr(0.06, 0.16));
    dustSpecks(c, 900, 0, 0, w, h, 0.16, 1.0);
    return finishSurf(S, { strength: 0.55, grain: 0.04, colorNoise: 3, roughNoise: 10 });
  }

  // ===== рамка экрана (вид спереди, свободный край — вверху) =====
  function drawBezel() {
    const w = Math.min(TS, 1536), h = Math.round(w * LD / W), k = w / W;
    const X = (x) => (x + W / 2) * k, Y = (z) => (LZ1 - z) * k;
    const S = makeSurf(w, h, '#1a1b1d', 0.7);
    const { c, g, r } = S;
    mottling(S, 20, 0.03);
    const sx0 = -SCREEN.w / 2, sx1 = SCREEN.w / 2, sz0 = SCREEN.zc - SCREEN.h / 2, sz1 = SCREEN.zc + SCREEN.h / 2;
    dustRectEdge(c, X(sx0), Y(sz1), X(sx1), Y(sz0), 0.8, 0.0008 * k, 0.45);
    dustLine(c, X(sx0), Y(sz0), X(sx1), Y(sz0), 1.2, 0.0012 * k, 0.5); // внизу пыли больше
    // резиновые упоры
    const pads = [[-0.12, sz1 + 0.006, 1], [0.12, sz1 + 0.006, 1], [-0.160, 0.15, 0], [0.160, 0.15, 0], [-0.160, 0.06, 0], [0.160, 0.06, 0]];
    for (const [px, pz, horiz] of pads) {
      const hw = (horiz ? 0.004 : 0.0013) * k, hh = (horiz ? 0.0013 : 0.004) * k;
      c.fillStyle = '#121213'; rrect(c, X(px) - hw, Y(pz) - hh, X(px) + hw, Y(pz) + hh, 0.001 * k); c.fill();
      g.fillStyle = gray(190); rrect(g, X(px) - hw, Y(pz) - hh, X(px) + hw, Y(pz) + hh, 0.001 * k); g.fill();
      r.fillStyle = rm(0.9); r.fillRect(X(px) - hw, Y(pz) - hh, hw * 2, hh * 2);
    }
    // лёгкий лоск там, где крышку берут пальцами (верхняя кромка)
    for (let i = 0; i < 14; i++) blob(r, X(rr(-0.1, 0.1)), Y(sz1 + 0.008), rr(0.006, 0.014) * k, 0.005 * k, '0,105,0', rr(0.2, 0.45));
    edgeWear(S, 0.001 * k, 0.002 * k, 0.8, 0.42);
    dustSpecks(c, 700, 0, 0, w, h, 0.2, 1.0);
    return finishSurf(S, { strength: 2.0, grain: 0.11, colorNoise: 4, roughNoise: 12 });
  }

  // ===== клавиатура: один холст-«вид сверху» на все клавиши (надписи + лоск частых клавиш) =====
  const keys = keyLayout();
  const KTOP = 0.0026; // отступ верхней площадки клавиши от основания
  function drawKeys() {
    const tw = TRAY.x1 - TRAY.x0, td = TRAY.z1 - TRAY.z0;
    const w = TS, h = Math.round(TS * td / tw), k = w / tw;
    const X = (x) => (x - TRAY.x0) * k, Z = (z) => (z - TRAY.z0) * k;
    const S = makeSurf(w, h, COL_KEY, 0.55);
    const { c, r } = S;
    const INK = '186,188,190';
    c.textBaseline = 'alphabetic';
    const font = (px, bold) => `${bold ? 600 : 500} ${Math.round(px)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    for (const key of keys) {
      const hx = key.w / 2 - KTOP, hz = key.d / 2 - KTOP;
      const x0 = X(key.x - hx), x1 = X(key.x + hx), y0 = Z(key.z - hz), y1 = Z(key.z + hz);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // едва заметная разница оттенка от клавиши к клавише
      c.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${rr(0, 0.018)})` : `rgba(0,0,0,${rr(0, 0.05)})`;
      c.fillRect(X(key.x - key.w / 2), Z(key.z - key.d / 2), key.w * k, key.d * k);
      // лоск: все клавиши чуть, частые — заметно, пробел — полосой под большими пальцами
      const wr = key.wear;
      if (key.label === ' ') {
        for (const off of [-0.25, 0.12, 0.3]) blob(r, cx + off * (x1 - x0), cy, (x1 - x0) * 0.2, (y1 - y0) * 0.75, '0,84,0', 0.9);
        blob(r, cx, cy, (x1 - x0) * 0.52, (y1 - y0) * 0.7, '0,92,0', 0.8);
        
      } else {
        blob(r, cx + rr(-2, 2), cy + rr(-1, 3), (x1 - x0) * 0.62, (y1 - y0) * 0.62, '0,88,0', 0.2 + wr * 0.7);
        
      }
      // надписи
      c.fillStyle = `rgba(${INK},0.92)`;
      const L = key.label;
      if (key.arrow) {
        const s = 0.0016 * k;
        c.save(); c.translate(cx, cy);
        c.rotate({ left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[L]);
        c.beginPath(); c.moveTo(s, 0); c.lineTo(-s * 0.7, -s * 0.9); c.lineTo(-s * 0.7, s * 0.9); c.closePath(); c.fill();
        c.restore();
      } else if (typeof L === 'object') {
        c.font = font(0.0034 * k, true); c.textAlign = 'left';
        c.fillText(L.top, x0 + 0.0006 * k, y0 + 0.0036 * k);
        c.fillText(L.bot, x0 + 0.0006 * k, y1 - 0.0012 * k);
      } else if (L.length === 1 && L !== ' ') {
        c.font = font(0.0044 * k, true); c.textAlign = 'left';
        c.fillText(L, x0 + 0.0007 * k, y0 + 0.0046 * k);
      } else if (L.length > 1) {
        c.font = font(key.row === 0 ? 0.0024 * k : 0.0027 * k, false); c.textAlign = 'left';
        c.fillText(L, x0 + 0.0005 * k, key.row === 0 ? cy + 0.0009 * k : y1 - 0.0014 * k);
      }
      // риски на F и J
      if (L === 'F' || L === 'J') { c.fillRect(cx - 0.0015 * k, y1 - 0.0016 * k, 0.003 * k, 0.0005 * k); }
    }
    dustSpecks(c, 500, 0, 0, w, h, 0.18, 1.0);
    addNoise(S.c, S.w, S.h, 3, rng, 7);
    addNoise(S.r, S.rc.width, S.rc.height, 12, rng, 2);
    return { map: tex(S.cc, true), orm: tex(S.rc, false) };
  }

  // ===== дно клавиатурной ниши: темнота и серая пыль в щелях =====
  function drawTray() {
    const tw = TRAY.x1 - TRAY.x0, td = TRAY.z1 - TRAY.z0;
    const w = 1024, h = Math.round(1024 * td / tw), k = w / tw;
    const cv = mkCanvas(w, h), c = cv.getContext('2d');
    c.fillStyle = '#060607'; c.fillRect(0, 0, w, h);
    for (const key of keys) { // пыль ложится в щели вокруг клавиш
      const x0 = (key.x - key.w / 2 - TRAY.x0) * k, x1 = (key.x + key.w / 2 - TRAY.x0) * k;
      const y0 = (key.z - key.d / 2 - TRAY.z0) * k, y1 = (key.z + key.d / 2 - TRAY.z0) * k;
      dustRectEdge(c, x0, y0, x1, y1, 0.55, 1.6, 0.6);
    }
    dustRectEdge(c, 2, 2, w - 2, h - 2, 1.2, 3, 0.6);
    for (let i = 0; i < 40; i++) blob(c, rr(0, w), rr(0, h), rr(6, 30), rr(3, 8), DUST, rr(0.05, 0.16));
    return tex(cv, true);
  }

  // ===== тачпад =====
  function drawPad() {
    const w = 512, h = 300;
    const S = makeSurf(w, h, '#1a1b1d', 0.47, 0, 1);
    const { c, g, r } = S;
    for (let y = 2; y < h; y += 4) for (let x = (y % 8 ? 2 : 4); x < w; x += 4) { g.fillStyle = gray(150); g.fillRect(x, y, 1.5, 1.5); }
    blob(r, w * 0.5, h * 0.5, w * 0.42, h * 0.45, '0,100,0', 0.6);
    blob(r, w * 0.55, h * 0.45, w * 0.25, h * 0.3, '0,96,0', 0.4);
    
    for (let i = 0; i < 14; i++) blob(r, rr(0.15, 0.85) * w, rr(0.15, 0.85) * h, rr(20, 46), rr(10, 22), '0,120,0', rr(0.1, 0.22));
    dustRectEdge(c, 2, 2, w - 2, h - 2, 0.5, 2.5, 0.4);
    return finishSurf(S, { strength: 0.8, grain: 0.06, colorNoise: 5, roughNoise: 10 });
  }

  // ===== экран: тёмное стекло, лёгкие разводы и пылинки =====
  function drawScreen() {
    const w = 1024, h = 640;
    const cv = mkCanvas(w, h), c = cv.getContext('2d');
    c.fillStyle = rm(0.3); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { // разводы от протирки — мягкие дуги
      c.save(); c.translate(rr(0, w), rr(0, h)); c.rotate(rr(-0.6, 0.6));
      blob(c, 0, 0, rr(60, 240), rr(8, 28), '0,110,0', rr(0.05, 0.13)); c.restore();
    }
    for (let i = 0; i < 7; i++) blob(c, rr(0.05, 0.95) * w, rr(0.1, 0.9) * h, rr(9, 15), rr(11, 17), '0,112,0', rr(0.08, 0.18));
    for (let i = 0; i < 120; i++) { c.fillStyle = rm(0.8, 0, rr(0.2, 0.6)); c.beginPath(); c.arc(rr(0, w), rr(0, h), rr(0.4, 1.0), 0, 7); c.fill(); }
    c.setTransform(1, 0, 0, 1, 0, 0);
    addNoise(c, w, h, 8, rng, 2);
    return tex(cv, false);
  }

  // ===== боковые полосы с портами =====
  // Возвращает текстуры; фон прозрачный — полоса лежит поверх бока корпуса.
  function drawPorts(lenM, heightM, painter) {
    const w = TS, s = w / (lenM * 1000), h = Math.round(heightM * 1000 * s);
    const S = makeSurf(w, h, null, 0.6, 0, 1);
    const { c, g, r } = S;
    const P = {
      s, S,
      hole(x0, y0, x1, y1, rad, color = '#050506', depth = 40) {
        c.fillStyle = color; rrect(c, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); c.fill();
        g.fillStyle = gray(depth); rrect(g, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); g.fill();
        r.fillStyle = rm(0.85); rrect(r, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); r.fill();
      },
      metal(x0, y0, x1, y1, rad, color = '#77787a', rough = 0.38, height = 150) {
        c.fillStyle = color; rrect(c, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); c.fill();
        g.fillStyle = gray(height); rrect(g, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); g.fill();
        r.fillStyle = rm(rough, 1); rrect(r, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); r.fill();
      },
      plastic(x0, y0, x1, y1, rad, color, rough = 0.5, height = 110) {
        c.fillStyle = color; rrect(c, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); c.fill();
        g.fillStyle = gray(height); rrect(g, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); g.fill();
        r.fillStyle = rm(rough, 0); rrect(r, x0 * s, y0 * s, x1 * s, y1 * s, rad * s); r.fill();
      },
      circle(x, y, rad, color, rough, metal, height) {
        c.fillStyle = color; c.beginPath(); c.arc(x * s, y * s, rad * s, 0, 7); c.fill();
        g.fillStyle = gray(height); g.beginPath(); g.arc(x * s, y * s, rad * s, 0, 7); g.fill();
        r.fillStyle = rm(rough, metal); r.beginPath(); r.arc(x * s, y * s, rad * s, 0, 7); r.fill();
      },
      line(x0, y0, x1, y1, wmm = 0.25) {
        c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = wmm * s; c.beginPath(); c.moveTo(x0 * s, y0 * s); c.lineTo(x1 * s, y1 * s); c.stroke();
        g.strokeStyle = gray(60); g.lineWidth = wmm * s * 1.3; g.beginPath(); g.moveTo(x0 * s, y0 * s); g.lineTo(x1 * s, y1 * s); g.stroke();
        // чтобы у линии была шероховатость там, где цвет непрозрачен
        r.strokeStyle = rm(0.8); r.lineWidth = wmm * s; r.beginPath(); r.moveTo(x0 * s, y0 * s); r.lineTo(x1 * s, y1 * s); r.stroke();
      },
      dust(x0, y, x1, dens = 0.5, a = 0.5) { dustLine(c, x0 * s, y * s, x1 * s, y * s, dens, 0.25 * s, a); },
      usb(x, y) {
        P.metal(x - 0.5, y - 0.5, x + 13, y + 5.6, 0.5, '#6f7072', 0.4, 150);
        P.hole(x, y, x + 12.5, y + 5.1, 0.3, '#050506', 50);
        P.plastic(x + 0.6, y + 0.5, x + 11.9, y + 2.4, 0.15, '#1b1b1d', 0.5, 80);
        for (let i = 0; i < 4; i++) P.metal(x + 2.2 + i * 2.4, y + 2.0, x + 3.4 + i * 2.4, y + 2.4, 0, '#8a7440', 0.35, 84);
        P.dust(x + 0.5, y + 4.9, x + 12, 0.5, 0.5);
      },
    };
    painter(P);
    addNoise(c, w, h, 6, rng, 7);
    const nc = heightToNormalCanvas(S.hc, 2.6, 0.1, rng);
    S.hc.width = S.hc.height = 2;
    return { map: tex(S.cc, true), normalMap: tex(nc, false), orm: tex(S.rc, false) };
  }
  const STRIP_H = 0.0098;
  const paintLeft = (P) => { // слева направо: зад -> перед
    P.hole(6, 3.6, 13, 6.6, 1.2);                               // гнездо замка
    P.circle(23, 5, 3.2, '#0a0a0b', 0.8, 0, 60); P.circle(23, 5, 2.3, '#5e5f61', 0.4, 1, 90); P.circle(23, 5, 1.7, '#050506', 0.9, 0, 40); P.circle(23, 5, 0.55, '#8a8b8d', 0.35, 1, 120);
    // VGA: металлическая D-рамка, тёмная вставка, 15 гнёзд
    const vx = 33, vy = 1.2, c = P.S.c, g = P.S.g, r = P.S.r, s = P.s;
    const dshape = (ctx, grow) => { ctx.beginPath(); ctx.moveTo((vx - grow) * s, (vy - grow) * s); ctx.lineTo((vx + 16.6 + grow) * s, (vy - grow) * s); ctx.lineTo((vx + 15.2 + grow) * s, (vy + 7.6 + grow) * s); ctx.lineTo((vx + 1.4 - grow) * s, (vy + 7.6 + grow) * s); ctx.closePath(); };
    c.fillStyle = '#737476'; dshape(c, 0.7); c.fill(); g.fillStyle = gray(160); dshape(g, 0.7); g.fill(); r.fillStyle = rm(0.36, 1); dshape(r, 0.7); r.fill();
    c.fillStyle = '#141a2c'; dshape(c, -0.2); c.fill(); g.fillStyle = gray(70); dshape(g, -0.2); g.fill(); r.fillStyle = rm(0.55, 0); dshape(r, -0.2); r.fill();
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) P.circle(vx + 3.6 + i * 2.3 + (row === 1 ? 1.15 : 0), vy + 1.9 + row * 1.9, 0.45, '#020203', 0.9, 0, 30);
    P.usb(58, 2.2); P.usb(75, 2.2);
    // решётка выдува
    P.plastic(96, 0.9, 166, 9.0, 0.8, '#1a1a1b', 0.6, 100);
    for (let x = 98; x < 164; x += 2.7) {
      P.hole(x, 1.6, x + 1.7, 8.4, 0.3, '#030303', 26);
      P.dust(x + 0.2, 8.1, x + 1.5, 1.2, 0.6);
      if (Math.sin(x * 12.9898) > 0.3) P.dust(x + 0.2, 1.9, x + 1.5, 0.6, 0.35);
    }
    P.hole(176, 2.4, 216, 3.9, 0.4, '#040404', 40); P.dust(176, 3.7, 216, 0.25, 0.4); // щель карты
  };
  const paintRight = (P) => { // слева направо: перед -> зад
    // лоток привода: шов-контур, кнопка, отверстие
    P.line(16, 1.4, 148, 1.4); P.line(16, 8.6, 148, 8.6); P.line(16, 1.4, 16, 8.6); P.line(148, 1.4, 148, 8.6);
    P.dust(16, 8.75, 148, 0.25, 0.4); P.dust(16, 1.55, 148, 0.12, 0.3);
    P.plastic(100, 5.2, 113, 7.4, 0.5, '#1d1d1f', 0.42, 150); P.line(100, 5.2, 113, 5.2, 0.15);
    P.circle(118, 6.3, 0.45, '#020202', 0.9, 0, 30); P.circle(92, 6.3, 0.7, '#0c0d0d', 0.25, 0, 110);
    for (const ax of [159, 170]) { P.circle(ax, 5, 2.9, '#0d0d0e', 0.5, 0, 150); P.circle(ax, 5, 2.2, '#3a3a3c', 0.4, 1, 100); P.circle(ax, 5, 1.75, '#020202', 0.9, 0, 30); }
    P.usb(179, 2.2); P.usb(196, 2.2);
  };
  const paintBack = (P) => { // слева направо со стороны зрителя сзади: +X -> -X
    // Ethernet
    P.metal(27.3, 0.6, 41.2, 10.2, 0.4, '#707173', 0.4, 150);
    P.hole(28, 1.2, 40.5, 9.6, 0.3, '#060607', 40);
    P.hole(31.5, 8.6, 37, 10.6, 0.2, '#060607', 40);
    for (let i = 0; i < 8; i++) P.metal(29.8 + i * 1.15, 1.6, 30.3 + i * 1.15, 4.2, 0, '#8f7a45', 0.35, 70);
    P.dust(28.3, 9.3, 40.2, 0.6, 0.5);
    // швы батареи
    for (const x of [58, 259]) { P.line(x, 0, x, 10.9, 0.3); }
    P.line(58, 0.4, 259, 0.4, 0.2); P.dust(58, 0.6, 259, 0.2, 0.35);
    // второе гнездо USB у правого края
    P.usb(286, 2.6);
  };

  // ============================== карты PBR (фото GEN18) ==============================
  // Файлы готовит tools/prep_pbr.py в папку <pbrBase>pack/. Карты грузятся сами; пока их нет, вещь скрыта.
  const loads = [];
  function loadTex(file, srgb, repeat, opt = {}) {
    const t = new THREE.Texture();
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = o.anisotropy;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opt.noMip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    disposables.push(t);
    loads.push(new Promise((res) => {
      if (typeof Image === 'undefined') { res(false); return; }
      const img = new Image();
      img.onload = () => {
        let src = img;
        const sc = opt.scale || (LOW ? 0.5 : 1);
        if (sc < 1) { // телефон: вдвое меньше по стороне — вчетверо меньше видеопамяти
          try {
            const cv = mkCanvas(img.naturalWidth * sc, img.naturalHeight * sc), cx = cv.getContext('2d');
            cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, cv.width, cv.height); cx.getImageData(0, 0, 1, 1); src = cv;
          } catch (e) { src = img; }
        }
        t.image = src; t.needsUpdate = true; res(true);
      };
      img.onerror = () => { console.warn('[laptop47] нет карты ' + file); res(false); };
      img.src = pbrBase + 'pack/' + file;
    }));
    return t;
  }
  const TILE_GRAIN = 0.030, TILE_BRUSH = 0.040, TILE_DUST = 0.024, TILE_SMUDGE = 0.100; // метров на повтор
  const P = PBR ? {
    grainA: loadTex('grain_a.jpg', true, true), grainN: loadTex('grain_n.jpg', false, true), brushN: loadTex('brushed_n.jpg', false, true),
    dust: loadTex('dust.jpg', false, true), smudge: loadTex('smudge.jpg', false, true), keysWear: loadTex('keys_wear.jpg', false, false, { scale: 1 }),
    face: {}, disp: {},
  } : null;
  if (PBR) {
    for (const f of ['deck', 'bottom', 'lid', 'bezel', 'left', 'right']) {
      P.face[f] = { a: loadTex(f + '_a.jpg', true), n: loadTex(f + '_n.jpg', false), orc: loadTex(f + '_orc.jpg', false) };
    }
    for (const f of ['left', 'right', 'bottom']) P.disp[f] = loadTex(f + '_d.png', false, false, { noMip: true, scale: 1 });
    // плитка зерна на «общих» деталях (кромки, валик, клавиши): их UV — в долях GRAIN_TILE
    P.grainA.repeat.set(GRAIN_TILE / TILE_GRAIN, GRAIN_TILE / TILE_GRAIN);
    P.grainN.repeat.set(GRAIN_TILE / TILE_GRAIN, GRAIN_TILE / TILE_GRAIN);
  }
  // Общий оттенок пластика. Фото — нейтрально-серые; под тёплой лампой серый уходит в коричневый,
  // поэтому цвет чуть сдвинут в холод и притемнён до угольного (свет сцены не меняется).
  // Главное — блик: у тёмного пластика почти весь видимый свет — отражение лампы, и оно несёт её цвет.
  // Поэтому отражению дан холодный оттенок (specularColor), обратный теплу лампы по умолчанию.
  const TINT = new THREE.Color(0.48, 0.56, 0.70);
  const SPEC = new THREE.Color(0.70, 0.84, 1.0);
  const GEN_TINT = TINT.clone().multiplyScalar(0.86);   // плитка зерна светлее фото граней — выравниваем

  // Материал грани с фото-картами. Поверх стандартного шейдера:
  //  • мелкий рельеф: нормали плитки (зерно / шлифовка) добавляются к нормали грани (смешение UDN);
  //  • пыль: маска плитки × карта «щелей» (канал B) — серый цвет, шероховатость 1;
  //  • отпечатки: плитка чуть меняет шероховатость в заданной полосе грани;
  //  • AO немного гасит и прямой свет (в three карта AO действует только на рассеянный);
  //  • band: лента бока базы — фото проецируется сбоку, к углам, переду и заду плавно переходит в плитку зерна.
  function pbrMat(face, c = {}) {
    const F = P.face[face];
    const size = c.size || [W, D];
    const m = new THREE.MeshPhysicalMaterial({
      map: F.a, normalMap: F.n, roughnessMap: F.orc, roughness: 1, metalness: 0, color: c.tint || TINT, specularColor: SPEC,
      normalScale: new THREE.Vector2(c.normal || 0.8, c.normal || 0.8),
    });
    if (!c.band) { m.aoMap = F.orc; m.aoMapIntensity = 0.85; }
    if (c.vertexColors) m.vertexColors = true;
    if (c.disp) { m.displacementMap = c.disp; m.displacementScale = -c.depth; m.displacementBias = 0; }
    const detTile = c.detTile || TILE_GRAIN;
    const u = {
      uDetN: { value: c.detN || P.grainN },
      uDet: { value: new THREE.Vector3(size[0] / detTile, size[1] / detTile, c.detail == null ? 0.35 : c.detail) },
      uDust: { value: P.dust },
      uDustP: { value: new THREE.Vector3(size[0] / TILE_DUST, size[1] / TILE_DUST, c.dust == null ? 1.0 : c.dust) },
      uSmudge: { value: P.smudge },
      uSmP: { value: new THREE.Vector3(size[0] / TILE_SMUDGE, size[1] / TILE_SMUDGE, c.smudge || 0) },
      uSmZone: { value: new THREE.Vector2(...(c.smudgeZone || [0, 1])) },
      uAoDirect: { value: c.aoDirect == null ? 0.45 : c.aoDirect },
    };
    if (c.band) {
      u.uGenA = { value: P.grainA };
      u.uGen = { value: new THREE.Vector3(GRAIN_TILE / TILE_GRAIN, GRAIN_TILE / TILE_GRAIN, 0.62) };
      u.uGenTint = { value: GEN_TINT };
      u.uSide = { value: c.band };
    }
    m.userData.p47 = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFaceUv;' + (c.band ? '\nvarying vec2 vGenUv;\nvarying vec3 vObjN;\nuniform float uSide;' : ''))
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + (c.band ? `
          vGenUv = uv; vObjN = normal;
          vFaceUv = vec2(0.5 - uSide * position.z / ${D.toFixed(4)}, (position.y + 0.001) / 0.034);
          vMapUv = vFaceUv; vNormalMapUv = vFaceUv; vRoughnessMapUv = vFaceUv;` : 'vFaceUv = uv;'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vFaceUv;
          uniform sampler2D uDetN; uniform vec3 uDet;
          uniform sampler2D uDust; uniform vec3 uDustP;
          uniform sampler2D uSmudge; uniform vec3 uSmP; uniform vec2 uSmZone;
          uniform float uAoDirect;
          float p47dust = 0.0;
          float p47w = 1.0;
          ${c.band ? 'varying vec2 vGenUv; varying vec3 vObjN; uniform sampler2D uGenA; uniform vec3 uGen; uniform vec3 uGenTint;' : ''}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 orc = texture2D( roughnessMap, vRoughnessMapUv ).rgb;
            diffuseColor.rgb *= mix( 1.0, orc.r, uAoDirect );
            // плитка пыли берётся дважды (вторая — повёрнута и другого шага) и смешивается по крупному пятну:
            // так комки не выстраиваются в ровный ряд с шагом плитки
            vec2 duv = vFaceUv * uDustP.xy;
            float dmix = smoothstep( 0.38, 0.62, texture2D( uSmudge, duv * 0.19 + 0.13 ).r );
            float dtex = mix( texture2D( uDust, duv ).r, texture2D( uDust, duv.yx * 1.37 + vec2( 0.31, 0.67 ) ).r, dmix );
            p47dust = clamp( dtex * orc.b * uDustP.z, 0.0, 1.0 );
            ${c.band ? `p47w = smoothstep( 0.35, 0.75, abs( normalize( vObjN ).x ) );
            p47dust *= p47w * smoothstep( 0.15, 0.22, vFaceUv.y ); // у нижней кромки фото — край кадра, не щель
            diffuseColor.rgb = mix( texture2D( uGenA, vGenUv * uGen.xy ).rgb * uGenTint, diffuseColor.rgb, p47w );` : ''}
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.195, 0.178, 0.150 ), p47dust * 0.85 );
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          {
            ${c.band ? 'roughnessFactor = mix( uGen.z, roughnessFactor, p47w );' : ''}
            float zone = clamp( ( vFaceUv.y - uSmZone.x ) / ( uSmZone.y - uSmZone.x ), 0.0, 1.0 );
            float sm = texture2D( uSmudge, vFaceUv * uSmP.xy ).r;
            roughnessFactor = clamp( roughnessFactor * ( 1.0 - zone * uSmP.z * ( sm - 0.45 ) * 2.0 ), 0.06, 1.0 );
            roughnessFactor = mix( roughnessFactor, 1.0, p47dust );
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            ${c.band ? 'normal = normalize( mix( nonPerturbedNormal, normal, p47w ) );' : ''}
            vec2 dUv = ${c.band ? 'vGenUv * uGen.xy' : 'vFaceUv * uDet.xy'};
            mat3 tbD = getTangentFrame( - vViewPosition, nonPerturbedNormal, dUv );
            vec3 dn = texture2D( uDetN, dUv ).xyz * 2.0 - 1.0;
            normal = normalize( normal + ( tbD[0] * dn.x + tbD[1] * dn.y ) * uDet.z * ( 1.0 - 0.6 * p47dust ) );
          }`);
    };
    m.customProgramCacheKey = () => 'laptop47-pbr-' + (c.band ? 'band' : 'face') + (c.disp ? '-d' : '');
    disposables.push(m);
    return m;
  }
  // «общий» пластик без фото: плитка зерна (цвет + нормали)
  const genMat = (rough, extra = {}) => {
    const m = new THREE.MeshPhysicalMaterial(Object.assign({ map: P.grainA, normalMap: P.grainN, normalScale: new THREE.Vector2(0.7, 0.7), color: GEN_TINT, specularColor: SPEC, roughness: rough, metalness: 0 }, extra));
    disposables.push(m); return m;
  };
  // плотная сетка под смещение: fn(s, t) -> [x, y, z, u, v], нормаль одна на всю сетку
  function gridGeo(nu, nv, fn, n) {
    nu = Math.max(2, Math.round(nu)); nv = Math.max(2, Math.round(nv));
    const cnt = (nu + 1) * (nv + 1);
    const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2);
    const idx = new Uint32Array(nu * nv * 6);
    let k = 0;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++, k++) {
      const q = fn(i / nu, j / nv);
      pos[k * 3] = q[0]; pos[k * 3 + 1] = q[1]; pos[k * 3 + 2] = q[2];
      nor[k * 3] = n[0]; nor[k * 3 + 1] = n[1]; nor[k * 3 + 2] = n[2];
      uv[k * 2] = q[3]; uv[k * 2 + 1] = q[4];
    }
    // обход — так, чтобы лицевая сторона смотрела по нормали
    const A = fn(0, 0), B = fn(1, 0), C = fn(0, 1);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    k = 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c2 = a + nu + 1, d = c2 + 1;
      if (flip) { idx[k++] = a; idx[k++] = c2; idx[k++] = b; idx[k++] = b; idx[k++] = c2; idx[k++] = d; }
      else { idx[k++] = a; idx[k++] = b; idx[k++] = c2; idx[k++] = b; idx[k++] = d; idx[k++] = c2; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  // ============================== сборка ==============================
  const root = new THREE.Group();
  root.name = 'laptop_47';
  const allMeshes = [];
  const mesh = (geo, mat, name, parent, shadow = 3) => {
    const m = new THREE.Mesh(geo, mat); m.name = name;
    m.castShadow = !!(shadow & 1); m.receiveShadow = !!(shadow & 2);
    (parent || root).add(m); allMeshes.push(m); disposables.push(geo);
    return m;
  };
  const std = (p) => { const m = new THREE.MeshStandardMaterial(p); disposables.push(m); return m; };
  const wedge = (g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * hTop(p.getZ(i)) / HB);
    return g;
  };
  const grainNS = (s) => new THREE.Vector2(s, s);

  const T = PBR ? { keys: drawKeys() } : { deck: drawDeck(), bottom: drawBottom(), lid: drawLid(), bezel: drawBezel(), keys: drawKeys(), pad: drawPad() };
  const tTex = now();

  const deckUV = (x, z) => [(x + W / 2) / W, 1 - (z + D / 2) / D];
  const bottomUV = (x, z) => [(W / 2 - x) / W, 1 - (z + D / 2) / D];

  let mBody, mDeck, mBottom, mLid, mLidRim, mBezel, mPad, mBtn, mRubber, mBar, mFootTop, mBtnTop;
  if (PBR) {
    mBody = [-1, 1].map((sgn) => pbrMat(sgn < 0 ? 'left' : 'right', { band: sgn, size: [D, 0.034], vertexColors: true, dust: 0.9 }));
    mDeck = pbrMat('deck', { size: [W, D], dust: 0.75 });
    mBottom = pbrMat('bottom', { size: [W, D], dust: 1.0, detail: 0.4 });
    // крышка: мелкая шлифовка плиткой нормалей (линии вдоль ширины), отпечатки — у свободного края, где её берут
    mLid = pbrMat('lid', { size: [W, LD], detN: P.brushN, detTile: TILE_BRUSH, detail: 0.45, dust: 0.25, smudge: 0.08, smudgeZone: [0.2, 0.02] });
    mBezel = pbrMat('bezel', { size: [W, LD], dust: 0.9, detail: 0.35, smudge: 0.08, smudgeZone: [0.9, 0.97] });
    mLidRim = genMat(0.58, { vertexColors: true });
    mBar = genMat(0.58);
    mBtn = genMat(0.5, { vertexColors: true });
    mRubber = genMat(0.9, { color: GEN_TINT.clone().multiplyScalar(0.55), vertexColors: true });
    mPad = mDeck; mBtnTop = mDeck; mFootTop = mBottom;
  } else {
    mBody = std({ color: COL_BODY, roughness: 0.6, normalMap: grainTex, normalScale: grainNS(0.45), vertexColors: true });
    mDeck = surfMaterial(T.deck);
    mBottom = surfMaterial(T.bottom);
    mLid = surfMaterial(T.lid);
    mLidRim = std({ color: '#1c1d20', roughness: 0.55, normalMap: grainTex, normalScale: grainNS(0.4), vertexColors: true });
    mBar = std({ color: '#1c1d20', roughness: 0.55, normalMap: grainTex, normalScale: grainNS(0.4) });
    mBezel = surfMaterial(T.bezel);
    mPad = surfMaterial(T.pad, { normalScale: grainNS(0.5) });
    mBtn = std({ color: '#1b1c1e', roughness: 0.4, normalMap: grainTex, normalScale: grainNS(0.3), vertexColors: true });
    mRubber = std({ color: '#161616', roughness: 0.88, normalMap: grainTex, normalScale: grainNS(1.0), vertexColors: true });
    mBtnTop = mBtn; mFootTop = mRubber;
  }
  const mDark = std({ color: '#060606', roughness: 0.9 });
  // дно ниши клавиатуры: в режиме фото — чёрное, пыль и ворсинки из плитки-маски (видны в щелях между клавишами)
  const mTray = PBR ? std({ map: P.dust, color: '#3a4250', roughness: 1 }) : std({ map: drawTray(), roughness: 0.92 });
  const mMetal = std({ color: '#9a9b9e', metalness: 1, roughness: 0.3 });

  // ----- база -----
  const baseProfile = [[0.0050, 0, 0], [0.0030, 0.0007, 0.6], [0.0012, 0.0022, 0.7], [0.0003, 0.0042, 0.25], [0, 0.0060, 0],
    [0, HB - 0.0030, 0], [0.0003, HB - 0.0018, 0.3], [0.0009, HB - 0.0007, 0.9], [0.0018, HB, 0.45]];
  const SIDE_Y0 = 0.0060, SIDE_Y1 = HB - 0.0030, SEG = 8;   // плоская часть бока (до клина)
  {
    // в режиме фото в ленте бока вырезаны два «окна» (левый и правый бок) под плотные сетки со смещением
    const skip = PBR ? (a, b, j) => a[0] === 0 && b[0] === 0 && a[1] > SIDE_Y0 - 1e-6 && b[1] < SIDE_Y1 + 1e-6 && (j === 2 * (SEG + 1) - 1 || j === 4 * (SEG + 1) - 1) : null;
    const g = wedge(sideGeo(THREE, { hw: W / 2, hd: D / 2, r: R, profile: baseProfile, seg: SEG, skip }));
    if (PBR) { // две группы: левая половина — фото левого бока, правая — правого
      const src = g.index.array, pos = g.attributes.position, L = [], Rr = [];
      for (let i = 0; i < src.length; i += 3) {
        const cx = pos.getX(src[i]) + pos.getX(src[i + 1]) + pos.getX(src[i + 2]);
        (cx < 0 ? L : Rr).push(src[i], src[i + 1], src[i + 2]);
      }
      g.setIndex(L.concat(Rr)); g.addGroup(0, L.length, 0); g.addGroup(L.length, Rr.length, 1);
    }
    mesh(g, mBody, 'base_side');
  }
  mesh(wedge(capGeo(THREE, {
    hw: W / 2 - 0.0018, hd: D / 2 - 0.0018, r: R - 0.0018, y: HB, up: true, uv: deckUV,
    holes: [Object.assign({ r: 0.0015 }, TRAY), Object.assign({ r: 0.0015 }, PADHOLE)],
  })), mDeck, 'deck');
  // решётки дна: в режиме фото — отверстия в плите и плотные сетки со смещением (щели уходят вглубь)
  const VENTS = [{ x0: 0.0005, x1: 0.0195, z0: -0.046, z1: 0.062, dx: 0.0010, dz: 0.0003 }, { x0: -0.130, x1: -0.089, z0: -0.042, z1: -0.001, dx: 0.0007, dz: 0.0003 }];
  mesh(capGeo(THREE, { hw: W / 2 - 0.005, hd: D / 2 - 0.005, r: R - 0.005, y: 0, up: false, uv: bottomUV, holes: PBR ? VENTS.map((v) => Object.assign({ r: 0 }, v)) : [] }), mBottom, 'bottom');
  if (PBR) {
    const mVent = pbrMat('bottom', { size: [W, D], dust: 1.0, detail: 0.4, disp: P.disp.bottom, depth: 0.0020 });
    VENTS.forEach((v, i) => {
      const g = gridGeo((v.x1 - v.x0) / v.dx * DENS, (v.z1 - v.z0) / v.dz * DENS, (s, t) => {
        const x = v.x0 + (v.x1 - v.x0) * s, z = v.z0 + (v.z1 - v.z0) * t, q = bottomUV(x, z);
        return [x, 0, z, q[0], q[1]];
      }, [0, -1, 0]);
      mesh(g, mVent, 'vent_' + i, root, 3);
    });
    // бока: плоская часть — сетка со смещением по карте глубины (гнёзда, решётка выдува, щели)
    for (const sgn of [-1, 1]) {
      const name = sgn < 0 ? 'left' : 'right';
      const mSide = pbrMat(name, { size: [D, 0.034], dust: 0.9, disp: P.disp[name], depth: 0.0048 });
      const z0 = -(D / 2 - R), z1 = D / 2 - R;
      const g = gridGeo((z1 - z0) / 0.00036 * DENS, (SIDE_Y1 - SIDE_Y0) / 0.00036 * DENS, (s, t) => {
        const z = z0 + (z1 - z0) * s, y = (SIDE_Y0 + (SIDE_Y1 - SIDE_Y0) * t) * hTop(z) / HB;
        return [sgn * W / 2, y, z, 0.5 - sgn * z / D, (y + 0.001) / 0.034];
      }, [sgn, 0, 0]);
      mesh(g, mSide, 'side_' + name, root, 3);
    }
  }

  // всё, что лежит на наклонной верхней панели
  const deckTop = new THREE.Group();
  deckTop.name = 'deck_top'; deckTop.position.set(0, DECK_Y, 0); deckTop.rotation.x = SLOPE;
  root.add(deckTop);
  const holeBox = (H, name, floorMat, floorUV) => {
    const hw = (H.x1 - H.x0) / 2, hd = (H.z1 - H.z0) / 2, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
    mesh(sideGeo(THREE, { hw, hd, r: 0.0015, cx, cz, inward: true, profile: [[0, -H.depth - 0.0002], [0, 0.00005]], seg: 3 }), mDark, name + '_walls', deckTop, 2);
    mesh(capGeo(THREE, { hw, hd, r: 0, cx, cz, y: -H.depth, up: true, uv: floorUV }), floorMat, name + '_floor', deckTop, 2);
  };
  holeBox(TRAY, 'tray', mTray, PBR ? (x, z) => [x / 0.030, z / 0.030] : (x, z) => [(x - TRAY.x0) / (TRAY.x1 - TRAY.x0), 1 - (z - TRAY.z0) / (TRAY.z1 - TRAY.z0)]);
  holeBox(PADHOLE, 'pad', mDark);

  // ----- клавиши: один InstancedMesh, размер клавиши — атрибутом (скосы не растягиваются) -----
  {
    const bw = U - KGAP, bd = ROW - KGAP;
    const kg = mergeGeos(THREE, [
      sideGeo(THREE, { hw: bw / 2, hd: bd / 2, r: 0.0014, seg: 3, profile: [[0, 0], [0.0001, 0.0012], [0.0016, 0.0031], [0.0020, 0.00355], [KTOP, 0.0038]] }),
      capGeo(THREE, { hw: bw / 2 - KTOP, hd: bd / 2 - KTOP, r: 0.0009, y: 0.0038, up: true, seg: 3 }),
    ]);
    kg.deleteAttribute('color');
    const pos = kg.attributes.position, corner = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { corner[i * 2] = Math.sign(pos.getX(i)); corner[i * 2 + 1] = Math.sign(pos.getZ(i)); }
    kg.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    const grow = new Float32Array(keys.length * 2);
    const patchPos = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aCorner;\nattribute vec2 aGrow;\nuniform vec4 uKb;')
        .replace('#include <begin_vertex>', 'vec3 transformed = position + vec3(aCorner.x * aGrow.x, 0.0, aCorner.y * aGrow.y);');
    };
    const uKb = { value: new THREE.Vector4(TRAY.x0, TRAY.z0, 1 / (TRAY.x1 - TRAY.x0), 1 / (TRAY.z1 - TRAY.z0)) };
    // материал клавиш: надписи и лоск — свой холст; зерно — плитка с фото; в режиме фото крупные пятна лоска
    // дополнительно берутся с фото по месту (keys_wear — размытая шероховатость ниши клавиатуры)
    const mKeys = PBR
      ? new THREE.MeshPhysicalMaterial({ map: T.keys.map, roughnessMap: T.keys.orm, roughness: 1, normalMap: P.grainN, normalScale: grainNS(0.55), color: TINT, specularColor: SPEC })
      : std({ map: T.keys.map, roughnessMap: T.keys.orm, roughness: 1, normalMap: grainTex, normalScale: grainNS(0.3) });
    disposables.push(mKeys);
    const uKeyWear = { value: PBR ? P.keysWear : null };
    mKeys.onBeforeCompile = (sh) => {
      sh.uniforms.uKb = uKb;
      patchPos(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        {
          vec3 kLocal = position + vec3(aCorner.x * aGrow.x, 0.0, aCorner.y * aGrow.y);
          vec4 kPos = instanceMatrix * vec4(kLocal, 1.0);
          vec2 kUv = vec2((kPos.x - uKb.x) * uKb.z, 1.0 - (kPos.z - uKb.y) * uKb.w);
          #ifdef USE_MAP
            vMapUv = kUv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = kUv;
          #endif
        }`);
      if (PBR) {
        sh.uniforms.uKeyWear = uKeyWear;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D uKeyWear;')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor * mix( 0.70, 1.30, texture2D( uKeyWear, vRoughnessMapUv ).r ), 0.08, 1.0 );');
      }
    };
    mKeys.customProgramCacheKey = () => 'laptop47-keys' + (PBR ? '-pbr' : '');
    const inst = new THREE.InstancedMesh(kg, mKeys, keys.length);
    inst.name = 'keys';
    const m4 = new THREE.Matrix4();
    keys.forEach((key, i) => {
      m4.makeTranslation(key.x, -TRAY.depth, key.z); inst.setMatrixAt(i, m4);
      grow[i * 2] = (key.w - bw) / 2; grow[i * 2 + 1] = (key.d - bd) / 2;
    });
    kg.setAttribute('aGrow', new THREE.InstancedBufferAttribute(grow, 2));
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMat.onBeforeCompile = (sh) => { sh.uniforms.uKb = uKb; patchPos(sh); };
    depthMat.customProgramCacheKey = () => 'laptop47-keys-depth';
    inst.customDepthMaterial = depthMat;
    inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false;
    deckTop.add(inst); allMeshes.push(inst); disposables.push(kg, depthMat);
  }

  // ----- тачпад и две кнопки -----
  // В режиме фото площадка и верх кнопок берут свой участок фото верхней панели (те же UV, что у плиты).
  {
    const px0 = PADHOLE.x0 + 0.0006, px1 = PADHOLE.x1 - 0.0006, pz0 = PADHOLE.z0 + 0.0006, pz1 = PAD_SPLIT;
    const cx = (px0 + px1) / 2, cz = (pz0 + pz1) / 2, hw = (px1 - px0) / 2, hd = (pz1 - pz0) / 2;
    const padSide = sideGeo(THREE, { hw, hd, r: 0.0012, cx, cz, seg: 3, profile: [[0, -PADHOLE.depth], [0, -0.0005], [0.0003, -0.00025]] });
    mesh(padSide, mBtn, 'touchpad_side', deckTop, 2);
    const padUV = PBR ? deckUV : (x, z) => [(x - px0) / (px1 - px0), 1 - (z - pz0) / (pz1 - pz0)];
    mesh(capGeo(THREE, { hw: hw - 0.0003, hd: hd - 0.0003, r: 0.001, cx, cz, y: -0.00025, up: true, seg: 3, uv: padUV }), mPad, 'touchpad', deckTop, 2);
    const bz0 = PAD_SPLIT + 0.0012, bz1 = PADHOLE.z1 - 0.0006, mid = (px0 + px1) / 2;
    for (const [bx0, bx1, name] of [[px0, mid - 0.0005, 'pad_button_l'], [mid + 0.0005, px1, 'pad_button_r']]) {
      const bx = (bx0 + bx1) / 2, bz = (bz0 + bz1) / 2;
      const parts = chipParts(THREE, (bx1 - bx0) / 2, (bz1 - bz0) / 2, 0.0014, PADHOLE.depth + 0.0003, 0.0006, true, 4, PBR ? (x, z) => deckUV(x + bx, z + bz) : undefined);
      for (const [g, mat, suffix] of [[parts.side, mBtn, '_side'], [parts.cap, mBtnTop, '']]) {
        const b = mesh(g, mat, name + suffix, deckTop);
        b.position.set(bx, -PADHOLE.depth, bz);
      }
    }
    // кнопка питания
    const pb = mesh(new THREE.CylinderGeometry(0.0042, 0.0046, 0.0009, 28), std({ color: '#3a3a3d', roughness: 0.35, metalness: 0.6 }), 'power_button', deckTop);
    pb.position.set(0.130, 0.00035, -0.0963);
  }

  // ----- петли: металлические бочонки на базе -----
  const barrelProfile = (r, len, bev) => {
    const pts = [[0, -len / 2], [r - bev, -len / 2], [r, -len / 2 + bev], [r, len / 2 - bev], [r - bev, len / 2], [0, len / 2]];
    return pts.map((p) => new THREE.Vector2(p[0], p[1]));
  };
  const barrelGeo = (r, len, bev) => { const g = new THREE.LatheGeometry(barrelProfile(r, len, bev), 24); g.rotateZ(Math.PI / 2); return g; };
  for (const s of [-1, 1]) {
    const b = mesh(barrelGeo(0.0050, 0.024, 0.0008), mMetal, s < 0 ? 'hinge_l' : 'hinge_r');
    b.position.set(s * 0.130, HY, HZ);
  }

  // ----- ножки (в режиме фото верх ножки — участок фото дна: на фото ножки стоят там же) -----
  FEET.forEach(([fx, fz], i) => {
    const parts = chipParts(THREE, 0.0095, 0.0042, 0.0025, 0.0013, 0.0006, false, 4, PBR ? (x, z) => bottomUV(x + fx, z + fz) : undefined);
    for (const [g, mat, suffix] of [[parts.side, mRubber, '_side'], [parts.cap, mFootTop, '']]) {
      const f = mesh(g, mat, 'foot_' + i + suffix);
      f.position.set(fx, 0, fz);
    }
  });

  // ----- наклейка HEXON на дне (v4: в стёртой зоне клей полупрозрачный, сквозь него виден пластик дна) -----
  const mSticker = std({ transparent: true, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, alphaTest: 0.02, depthWrite: false });
  const sticker = mesh(new THREE.PlaneGeometry(STICKER.w, STICKER.h), mSticker, 'sticker_hexon_47', root, 2);
  sticker.rotation.order = 'YXZ'; sticker.rotation.set(Math.PI / 2, Math.PI, 0);
  sticker.position.set(STICKER.x, -0.0002, STICKER.z);
  sticker.visible = false;
  const setSticker = (t) => { mSticker.map = t; mSticker.needsUpdate = true; sticker.visible = true; if (o.onChange) o.onChange(); };
  const shrinkImage = (img, maxW) => { // на телефоне не нужно держать 1652×1302 в памяти
    try {
      const sc = Math.min(1, maxW / img.naturalWidth);
      const cv = mkCanvas(img.naturalWidth * sc, img.naturalHeight * sc);
      const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, cv.width, cv.height); cx.getImageData(0, 0, 1, 1); return cv;
    } catch (e) { return img; }
  };
  const STICKER_PX = LOW ? 1024 : 1652;
  if (o.stickerTexture) setSticker(o.stickerTexture);
  else if (typeof Image !== 'undefined') {
    loads.push(new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const t = new THREE.Texture(shrinkImage(img, STICKER_PX)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = o.anisotropy; t.needsUpdate = true;
        disposables.push(t); setSticker(t); res(true);
      };
      img.onerror = () => { if (o.onChange) o.onChange(); res(false); };
      img.src = o.stickerUrl;
    }));
    if (o.stickerRoughUrl) loads.push(new Promise((res) => { // карта шероховатости: бумага матовая, плёнка клея блестит
      const img = new Image();
      img.onload = () => {
        const t = new THREE.Texture(shrinkImage(img, STICKER_PX)); t.colorSpace = THREE.NoColorSpace; t.anisotropy = o.anisotropy; t.needsUpdate = true;
        disposables.push(t); mSticker.roughnessMap = t; mSticker.roughness = 1; mSticker.needsUpdate = true; if (o.onChange) o.onChange(); res(true);
      };
      img.onerror = () => { res(false); };
      img.src = o.stickerRoughUrl;
    }));
  }

  // ----- полосы портов (процедурные): в режиме фото — только задняя, бока сделаны фото и смещением -----
  const strips = {};
  const addStrip = (slot, lenM, painter, place) => {
    const t = drawPorts(lenM, STRIP_H, painter);
    const m = std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const s = mesh(new THREE.PlaneGeometry(lenM, STRIP_H), m, 'ports_' + slot, root, 2);
    place(s); strips[slot] = m;
  };
  const stripY = 0.0058 + STRIP_H / 2;
  if (!PBR) {
    addStrip('left', D - 2 * R, paintLeft, (s) => { s.rotation.y = -Math.PI / 2; s.position.set(-W / 2 - 0.00012, stripY, 0); });
    addStrip('right', D - 2 * R, paintRight, (s) => { s.rotation.y = Math.PI / 2; s.position.set(W / 2 + 0.00012, stripY, 0); });
  }
  addStrip('back', W - 2 * R, paintBack, (s) => { s.rotation.y = Math.PI; s.position.set(0, 0.0072 + STRIP_H / 2, -D / 2 - 0.00012); });
  // стойки VGA (шестигранники) — только без фото: на фото бока они уже есть
  if (!PBR) for (const zmm of [30.4, 52.2]) {
    const p = mesh(new THREE.CylinderGeometry(0.0021, 0.0023, 0.0016, 6), mMetal, 'vga_post', root, 2);
    p.rotation.z = Math.PI / 2; p.position.set(-W / 2 - 0.0007, 0.0058 + STRIP_H - 0.005, -(D / 2 - R) + zmm / 1000);
  }

  // ----- крышка -----
  const lid = new THREE.Group();
  lid.name = 'lid_hinge'; lid.position.set(0, HY, HZ);
  root.add(lid);
  {
    const t = LT / 2, czl = (LZ0 + LZ1) / 2;
    const prof = [[0.0012, -t, 0.5], [0.0003, -t + 0.0008, 0.6], [0, -t + 0.0018, 0.1], [0, t - 0.0030, 0], [0.0008, t - 0.0013, 0.5], [0.0021, t - 0.0004, 1.0], [0.0034, t, 0.6]];
    mesh(sideGeo(THREE, { hw: W / 2, hd: LD / 2, r: R, cz: czl, profile: prof }), mLidRim, 'lid_rim', lid);
    mesh(capGeo(THREE, { hw: W / 2 - 0.0034, hd: LD / 2 - 0.0034, r: R - 0.0034, cz: czl, y: t, up: true, uv: (x, z) => [(x + W / 2) / W, 1 - (z - LZ0) / LD] }), mLid, 'lid_top', lid);
    const sh = { x0: -SCREEN.w / 2, x1: SCREEN.w / 2, z0: SCREEN.zc - SCREEN.h / 2, z1: SCREEN.zc + SCREEN.h / 2, r: 0.001 };
    mesh(capGeo(THREE, { hw: W / 2 - 0.0012, hd: LD / 2 - 0.0012, r: R - 0.0012, cz: czl, y: -t, up: false, holes: [sh], uv: (x, z) => [(x + W / 2) / W, (z - LZ0) / LD] }), mBezel, 'bezel', lid);
    // стенки углубления экрана (нормали внутрь)
    const walls = sideGeo(THREE, { hw: SCREEN.w / 2, hd: SCREEN.h / 2, r: 0.001, cz: SCREEN.zc, inward: true, seg: 2, profile: [[0, -t - 0.00002], [0, -t + 0.0010]] });
    mesh(walls, mDark, 'screen_walls', lid, 2);
    const mScreen = new THREE.MeshPhysicalMaterial({ color: '#050607', roughness: 1, roughnessMap: drawScreen(), metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, specularIntensity: 1 });
    disposables.push(mScreen);
    const screen = mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), mScreen, 'screen', lid, 2);
    screen.rotation.x = Math.PI / 2; screen.position.set(0, -t + 0.0008, SCREEN.zc);
    // валик петли вдоль нижней кромки крышки (пластик) — закрывает просвет между бочонками
    const bar = mesh(barrelGeo(0.0047, 0.236, 0.0006), mBar, 'lid_hinge_bar', lid);
    bar.geometry.deleteAttribute('color');
    { // UV валика — в долях плитки зерна (у LatheGeometry они 0…1 на всю деталь, фактура растягивалась)
      const uv = bar.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * 0.0047) / GRAIN_TILE, uv.getY(i) * 0.236 / GRAIN_TILE);
    }
  }
  const setLidAngle = (a) => {
    a = Math.max(0, Math.min(2.4, a));
    root.userData.lidAngle = a;
    lid.rotation.x = SLOPE - a;
  };

  // ----- подмена карты цвета грани своей текстурой (только процедурный режим, pbr: false) -----
  const photoSlots = PBR ? {} : { lid: mLid, deck: mDeck, bottom: mBottom, bezel: mBezel, left: strips.left, right: strips.right };
  const applyPhotoTexture = (slot, t) => {
    const m = photoSlots[slot];
    if (!m || !t) return false;
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = o.anisotropy; t.flipY = true;
    m.map = t;
    if (slot === 'left' || slot === 'right') { m.transparent = false; m.depthWrite = true; }
    m.needsUpdate = true;
    if (o.onChange) o.onChange();
    return true;
  };
  for (const k of Object.keys(o.photoTextures || {})) applyPhotoTexture(k, o.photoTextures[k]);

  // ----- итог -----
  let tris = 0, dispTris = 0;
  for (const m of allMeshes) {
    const g = m.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += n * (m.isInstancedMesh ? m.count : 1);
    if (/^(vent_|side_)/.test(m.name)) dispTris += n;
  }
  const stats = { triangles: Math.round(tris), displacedTriangles: Math.round(dispTris), meshes: allMeshes.length, keys: keys.length, textureSize: TS, pbr: PBR, lowPower: LOW, texturesMs: Math.round(tTex - t0), buildMs: 0, mapsMs: 0, mapsMissing: 0 };
  // ready — когда догрузились все карты и наклейка; до этого вещь скрыта (иначе она мигнула бы чёрной)
  if (PBR) root.visible = false;
  const ready = Promise.all(loads).then((res) => {
    stats.mapsMs = Math.round(now() - t0); stats.mapsMissing = res.filter((r) => !r).length;
    root.visible = true;
    if (o.onChange) o.onChange();
    return stats;
  });
  root.userData = {
    lidAngle: 0, setLidAngle, applyPhotoTexture, ready,
    dims: { W, D, HB, HF, LT, hingeY: HY, hingeZ: HZ, lidDepth: LD },
    stats,
    dispose() { for (const d of disposables) d.dispose && d.dispose(); },
  };
  setLidAngle(o.lidAngle);
  stats.buildMs = Math.round(now() - t0);
  return root;
}
