// phone48.js — телефон из стола кабинета руководителя (материал дела № 48), построенный кодом three.js.
// Без файлов-моделей: форма — геометрией, поверхности — фото-карты PBR (или рисунок кодом, если карт нет).
// Класс вещи: недорогой сенсорный моноблок 2009 года (по размерам и раскладке — Samsung S5230), без марок и надписей.
// Модуль не зависит от страницы: buildPhone48(THREE, opts) -> THREE.Group.
//
// Узлы по именам: screen (экран: uv — участок общей карты переда, uv1 — 0…1 под картинку интерфейса),
//                 key_call, key_back, key_end (кнопки под экраном), key_volume, key_lock, key_camera (бока),
//                 port_flap (заглушка разъёма на верхнем торце), camera_plate, label_bureau_48 (если opts.label).
// Единицы — метры. Телефон лежит на спине: X — вправо, Y — вверх (к зрителю экрана), Z — к нижнему торцу (кнопки).
// y = 0 — плоскость спинки, верх телефона (динамик) — на −Z.
//
// opts:
//   pbr         — true (по умолчанию): фото-карты из <pbrBase>pack/ или pack_low/; false — рисунок кодом
//   pbrBase     — папка карт (по умолчанию ./textures/pbr/ рядом с модулем)
//   mapSet      — 'full' | 'low' (по умолчанию low на телефоне/малом окне, иначе full); на ходу — userData.loadMapSet(set)
//   lowPower    — телефон: меньше сегментов у скруглений, набор карт low
//   textureSize — длинная сторона холстов процедурного режима (по умолчанию 2048)
//   anisotropy  — анизотропная фильтрация (по умолчанию 8)
//   onChange    — вызывается, когда что-то догрузилось и нужен новый кадр
//
// group.userData: ready (Promise), setScreenTexture(tex | null), loadMapSet(set), mapSet, stats, dims, layout, dispose()

const MM = 0.001;
export const PHONE48 = {
  W: 53 * MM, L: 104 * MM, T: 11.9 * MM, R: 8.5 * MM,
  yFront: 11.65 * MM,                    // плоскость лицевой панели (обод выше на 0,25 мм)
  backInset: 4.6 * MM, backRise: 4.2 * MM, // скругление спинки (четверть эллипса)
  seamLo: 4.2 * MM, seamHi: 10.2 * MM,    // швы: крышка/рамка и рамка/обод
  rimInset: 1.55 * MM,
  screen: { x0: -20 * MM, x1: 20 * MM, z0: -33.1 * MM, z1: 33.5 * MM },
  ear: { z: -45.4 * MM, hw: 8.25 * MM, hd: 1.6 * MM },
  bandZ: 40 * MM,                        // граница глянцевой панели и полосы кнопок
  keys: { z: 44.4 * MM, side: 14 * MM, pill: [5.3 * MM, 2.15 * MM], mid: 4.35 * MM },
  plate: { x: 15.5 * MM, z0: -45.9 * MM, z1: -20.7 * MM, hw: 4.8 * MM, lensZ: -40.9 * MM, mirrorZ: -33.4 * MM },   // по фото GEN20
  volume: { z: -34.45 * MM, len: 16.1 * MM }, lock: { z: 7.35 * MM, len: 6.5 * MM }, cam: { z: 29.35 * MM, len: 8 * MM },
  flap: { x: -6 * MM, len: 11 * MM },
};
const TILE = 0.030; // метров на повтор плитки «общего» пластика

function rngFactory(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function rrect(ctx, x0, y0, x1, y1, r) {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.arcTo(x1, y0, x1, y0 + r, r); ctx.lineTo(x1, y1 - r);
  ctx.arcTo(x1, y1, x1 - r, y1, r); ctx.lineTo(x0 + r, y1); ctx.arcTo(x0, y1, x0, y1 - r, r); ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r); ctx.closePath();
}

// ---------- геометрия ----------
function mergeGeos(THREE, list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
// контур скруглённого прямоугольника в плоскости XZ
function outline(hw, hd, r, seg, cx, cz) {
  const pts = [], cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const ox = cx + cs[k][0] * (hw - r), oz = cz + cs[k][1] * (hd - r);
    for (let s = 0; s <= seg; s++) {
      const a = (k + s / seg) * Math.PI / 2, nx = Math.cos(a), nz = Math.sin(a);
      pts.push({ x: ox + nx * r, z: oz + nz * r, nx, nz });
    }
  }
  pts.push(Object.assign({}, pts[0]));
  return pts;
}
// боковая «лента»: профиль [[inset, y], ...] снизу вверх вдоль контура; нормали аналитические
function sideGeo(THREE, p) {
  const { hw, hd, r, cx = 0, cz = 0, seg = 10, inward = false, uvf = null } = p;
  const prof = [];
  for (let i = 0; i < p.profile.length; i++) {
    const a = p.profile[i]; prof.push([a[0], a[1]]);
    const b = p.profile[i + 1];
    if (b) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 0.0015) { const t = 0.00008 / len; prof.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); prof.push([b[0] - (b[0] - a[0]) * t, b[1] - (b[1] - a[1]) * t]); }
    }
  }
  const nr = prof.length, pn = [];
  for (let i = 0; i < nr; i++) {
    let rx = 0, ry = 0;
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= nr - 1) continue;
      const di = prof[j + 1][0] - prof[j][0], dy = prof[j + 1][1] - prof[j][1], l = Math.hypot(di, dy) || 1;
      rx += dy / l; ry += di / l;
    }
    const l = Math.hypot(rx, ry) || 1; pn.push([rx / l, ry / l]);
  }
  const base = outline(hw, hd, Math.max(r, 1e-5), seg, cx, cz), nc = base.length;
  const ulen = [0];
  for (let j = 1; j < nc; j++) ulen.push(ulen[j - 1] + Math.hypot(base[j].x - base[j - 1].x, base[j].z - base[j - 1].z));
  const pos = [], nor = [], uv = [], idx = [];
  let v = 0;
  for (let i = 0; i < nr; i++) {
    const ins = inward ? -prof[i][0] : prof[i][0];
    if (i > 0) v += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
    const ring = outline(hw - ins, hd - ins, Math.max(r - ins, 1e-5), seg, cx, cz);
    for (let j = 0; j < nc; j++) {
      const q = ring[j], s = inward ? -1 : 1;
      pos.push(q.x, prof[i][1], q.z);
      nor.push(q.nx * pn[i][0] * s, pn[i][1], q.nz * pn[i][0] * s);
      if (uvf) { const t = uvf(q.x, q.z, prof[i][1]); uv.push(t[0], t[1]); } else uv.push(ulen[j] / TILE, v / TILE);
    }
  }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const a = i * nc + j, b = (i + 1) * nc + j, c = i * nc + j + 1, d = (i + 1) * nc + j + 1;
    if (inward) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function rrPath(path, x0, z0, x1, z1, r) {
  const P = Math.PI;
  r = Math.min(r, (x1 - x0) / 2 - 1e-7, (z1 - z0) / 2 - 1e-7);
  if (r <= 0) { path.moveTo(x0, z0); path.lineTo(x1, z0); path.lineTo(x1, z1); path.lineTo(x0, z1); path.closePath(); return path; }
  path.moveTo(x0 + r, z0); path.lineTo(x1 - r, z0); path.absarc(x1 - r, z0 + r, r, -P / 2, 0, false);
  path.lineTo(x1, z1 - r); path.absarc(x1 - r, z1 - r, r, 0, P / 2, false);
  path.lineTo(x0 + r, z1); path.absarc(x0 + r, z1 - r, r, P / 2, P, false);
  path.lineTo(x0, z0 + r); path.absarc(x0 + r, z0 + r, r, P, P * 1.5, false);
  return path;
}
// плоская крышка (с отверстиями), нормаль вверх или вниз
function capGeo(THREE, p) {
  const { hw, hd, r, cx = 0, cz = 0, y, up = true, holes = [], seg = 10 } = p;
  const uvf = p.uv || ((x, z) => [x / TILE, z / TILE]);
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
// скруглённая «плитка» (кнопка, накладка): бок + верх; растёт от y0 на h вверх (up) или вниз
function chipGeo(THREE, p) {
  const { hw, hd, r, cx = 0, cz = 0, y0 = 0, h, bevel, up = true, seg = 6, uv = null } = p;
  const s = up ? 1 : -1;
  const prof = up
    ? [[0, y0], [0, y0 + h - bevel], [bevel * 0.3, y0 + h - bevel * 0.3], [bevel, y0 + h]]
    : [[bevel, y0 - h], [bevel * 0.3, y0 - h + bevel * 0.3], [0, y0 - h + bevel], [0, y0]];
  const uvf = uv ? (x, z) => uv(x, z) : null;
  return mergeGeos(THREE, [
    sideGeo(THREE, { hw, hd, r, cx, cz, profile: prof, seg, uvf }),
    capGeo(THREE, { hw: hw - bevel, hd: hd - bevel, r: Math.max(r - bevel, 1e-5), cx, cz, y: y0 + s * h, up, seg, uv: uv || undefined }),
  ]);
}

// =====================================================================================
export function buildPhone48(THREE, opts = {}) {
  const D = PHONE48, { W, L, T, R } = D;
  const rel = (p) => { try { return new URL(p, import.meta.url).href; } catch (e) { return p; } };
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const smallWin = typeof innerWidth !== 'undefined' && Math.min(innerWidth, innerHeight) < 700;
  const o = Object.assign({ pbr: true, pbrBase: rel('./textures/pbr/'), textureSize: 2048, anisotropy: 8, lowPower: coarse || smallWin }, opts);
  let mapSet = o.mapSet || (o.lowPower ? 'low' : 'full');
  const SEG = o.lowPower ? 8 : 14;
  const rng = rngFactory(4809);
  const disposables = [];
  const group = new THREE.Group(); group.name = 'phone48';
  const fUV = (x, z) => [(x + W / 2) / W, 1 - (z + L / 2) / L];   // перед: как видит зритель экрана, верх телефона — верх картинки
  const bUV = (x, z) => [(W / 2 - x) / W, 1 - (z + L / 2) / L];   // спинка: как видят её, перевернув телефон через бок

  // ---------- рисунок кодом (ортовиды для генератора и запасной режим без карт) ----------
  function canvasTex(c, srgb, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = o.anisotropy;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    disposables.push(t); return t;
  }
  // высота (серый холст) -> карта нормалей
  function heightToNormal(hc, strength) {
    const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
    const out = mkCanvas(w, h), octx = out.getContext('2d'), img = octx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = src[(y * w + Math.max(x - 1, 0)) * 4], r2 = src[(y * w + Math.min(x + 1, w - 1)) * 4];
      const u = src[(Math.max(y - 1, 0) * w + x) * 4], dn = src[(Math.min(y + 1, h - 1) * w + x) * 4];
      let nx = (l - r2) / 255 * strength, ny = (dn - u) / 255 * strength; const il = 1 / Math.hypot(nx, ny, 1);
      d[i] = (nx * il * 0.5 + 0.5) * 255; d[i + 1] = (ny * il * 0.5 + 0.5) * 255; d[i + 2] = (il * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    octx.putImageData(img, 0, 0); return out;
  }
  const orm = (rough, metal, ao = 1) => `rgb(${Math.round(ao * 255)},${Math.round(rough * 255)},${Math.round(metal * 255)})`;
  // значки кнопок: трубка (вызов), стрелка «назад», трубка вниз (отбой). u — миллиметр в пикселях.
  function iconHandset(c, x, y, u, color, rot) {
    c.save(); c.translate(x, y); c.rotate(rot); c.strokeStyle = color; c.lineCap = 'round'; c.lineWidth = 0.5 * u;
    c.beginPath(); c.arc(0, 2.9 * u, 3.3 * u, -Math.PI * 0.69, -Math.PI * 0.31); c.stroke();          // ручка трубки
    c.lineWidth = 1.05 * u; c.lineCap = 'butt';
    for (const sg of [-1, 1]) { const a0 = -Math.PI / 2 + sg * Math.PI * 0.2; c.beginPath(); c.arc(0, 2.9 * u, 2.95 * u, Math.min(a0, a0 + sg * 0.17), Math.max(a0, a0 + sg * 0.17)); c.stroke(); }
    c.restore();
  }
  function iconBack(c, x, y, u, color) {
    c.save(); c.translate(x, y); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 0.42 * u; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-1.1 * u, 0.55 * u); c.lineTo(1.3 * u, 0.55 * u); c.lineTo(1.3 * u, -0.95 * u); c.lineTo(-1.3 * u, -0.95 * u); c.stroke();
    c.beginPath(); c.moveTo(-1.9 * u, 0.55 * u); c.lineTo(-0.9 * u, -0.15 * u); c.lineTo(-0.9 * u, 1.25 * u); c.closePath(); c.fill(); c.restore();
  }
  function drawFront(size) {
    const s = size / (L / MM), w = Math.round(53 * s), h = size;
    const A = mkCanvas(w, h), a = A.getContext('2d'), O = mkCanvas(w, h), q = O.getContext('2d'), H = mkCanvas(w, h), hh = H.getContext('2d');
    const mx = (x) => (x / MM + 26.5) * s, mz = (z) => (z / MM + 52) * s;
    a.fillStyle = '#6b6f76'; a.fillRect(0, 0, w, h); q.fillStyle = orm(0.2, 1); q.fillRect(0, 0, w, h); hh.fillStyle = '#808080'; hh.fillRect(0, 0, w, h);
    // глянцевая панель
    rrect(a, 1.55 * s, 1.55 * s, w - 1.55 * s, h - 1.55 * s, 6.95 * s); a.fillStyle = '#0b0b0d'; a.fill();
    rrect(q, 1.55 * s, 1.55 * s, w - 1.55 * s, h - 1.55 * s, 6.95 * s); q.fillStyle = orm(0.10, 0); q.fill();
    // экран: выключенная матрица чуть светлее рамки
    a.fillStyle = '#15171a'; a.fillRect(mx(D.screen.x0), mz(D.screen.z0), mx(D.screen.x1) - mx(D.screen.x0), mz(D.screen.z1) - mz(D.screen.z0));
    q.fillStyle = orm(0.14, 0); q.fillRect(mx(D.screen.x0), mz(D.screen.z0), mx(D.screen.x1) - mx(D.screen.x0), mz(D.screen.z1) - mz(D.screen.z0));
    // полоса кнопок: тёмный шлифованный металл
    a.save(); rrect(a, 1.55 * s, 1.55 * s, w - 1.55 * s, h - 1.55 * s, 6.95 * s); a.clip();
    a.fillStyle = '#2a2b2f'; a.fillRect(0, mz(D.bandZ), w, h); q.save(); rrect(q, 1.55 * s, 1.55 * s, w - 1.55 * s, h - 1.55 * s, 6.95 * s); q.clip();
    q.fillStyle = orm(0.36, 1); q.fillRect(0, mz(D.bandZ), w, h); q.restore();
    for (let i = 0; i < 260; i++) { const y = mz(D.bandZ) + rng() * (h - mz(D.bandZ)); a.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rng() * 0.06})`; a.fillRect(0, y, w, Math.max(1, s * 0.05)); }
    a.fillStyle = 'rgba(0,0,0,0.6)'; a.fillRect(0, mz(D.bandZ) - 0.15 * s, w, 0.3 * s); a.restore();
    hh.fillStyle = '#6c6c6c'; hh.fillRect(0, mz(D.bandZ) - 0.12 * s, w, 0.24 * s);
    // кнопки: две «пилюли» и квадрат с хромированной рамкой
    for (const sx of [-1, 1]) {
      const cx = mx(sx * D.keys.side), cz = mz(D.keys.z), kw = D.keys.pill[0] / MM * s, kd = D.keys.pill[1] / MM * s;
      rrect(a, cx - kw - 0.5 * s, cz - kd - 0.5 * s, cx + kw + 0.5 * s, cz + kd + 0.5 * s, kd + 0.5 * s); a.fillStyle = '#0a0a0b'; a.fill();
      rrect(a, cx - kw, cz - kd, cx + kw, cz + kd, kd); a.fillStyle = '#26272a'; a.fill();
      rrect(q, cx - kw, cz - kd, cx + kw, cz + kd, kd); q.fillStyle = orm(0.3, 1); q.fill();
      iconHandset(a, cx, cz + 0.15 * s, s * 0.86, sx < 0 ? '#7fb98a' : '#c9767a', sx < 0 ? -0.5 : 0);
    }
    { const cx = mx(0), cz = mz(D.keys.z), k = D.keys.mid / MM * s;
      rrect(a, cx - k, cz - k, cx + k, cz + k, 1.6 * s); a.fillStyle = '#b9bcc2'; a.fill(); rrect(q, cx - k, cz - k, cx + k, cz + k, 1.6 * s); q.fillStyle = orm(0.12, 1); q.fill();
      rrect(a, cx - k + 0.9 * s, cz - k + 0.9 * s, cx + k - 0.9 * s, cz + k - 0.9 * s, 1.0 * s); a.fillStyle = '#0a0a0c'; a.fill();
      rrect(q, cx - k + 0.9 * s, cz - k + 0.9 * s, cx + k - 0.9 * s, cz + k - 0.9 * s, 1.0 * s); q.fillStyle = orm(0.08, 0); q.fill();
      iconBack(a, cx, cz, s, '#e6e7ea'); }
    // динамик: хромированная «пилюля» с сеткой отверстий
    { const cx = mx(0), cz = mz(D.ear.z), ew = D.ear.hw / MM * s, ed = D.ear.hd / MM * s;
      rrect(a, cx - ew, cz - ed, cx + ew, cz + ed, ed); a.fillStyle = '#b4b7bd'; a.fill(); rrect(q, cx - ew, cz - ed, cx + ew, cz + ed, ed); q.fillStyle = orm(0.22, 1); q.fill();
      a.fillStyle = '#1a1b1d';
      for (let r2 = -2; r2 <= 2; r2++) for (let i = -17; i <= 17; i++) { const px = cx + (i + (r2 & 1) * 0.5) * 0.42 * s, py = cz + r2 * 0.42 * s; if (Math.abs(px - cx) < ew - 1.2 * s) { a.beginPath(); a.arc(px, py, 0.13 * s, 0, 7); a.fill(); } } }
    return { A, O, H, N: heightToNormal(H, 2), w, h };
  }
  function drawBack(size) {
    const s = size / (L / MM), w = Math.round(53 * s), h = size;
    const A = mkCanvas(w, h), a = A.getContext('2d'), O = mkCanvas(w, h), q = O.getContext('2d'), H = mkCanvas(w, h), hh = H.getContext('2d');
    const mx = (x) => (26.5 - x / MM) * s, mz = (z) => (z / MM + 52) * s;
    a.fillStyle = '#0e0e11'; a.fillRect(0, 0, w, h); q.fillStyle = orm(0.16, 0); q.fillRect(0, 0, w, h); hh.fillStyle = '#707070'; hh.fillRect(0, 0, w, h);
    // мелкий квадратный узор крышки: шаг 1 мм, квадратик 0,5 мм, в 4,6 мм от краёв
    hh.fillStyle = '#8c8c8c'; a.fillStyle = '#17171b';
    const pat = { x0: 4.6, x1: 48.4, z0: 4.6, z1: 99.4, r: 3.9 };
    a.save(); rrect(a, pat.x0 * s, pat.z0 * s, pat.x1 * s, pat.z1 * s, pat.r * s); a.clip(); hh.save(); rrect(hh, pat.x0 * s, pat.z0 * s, pat.x1 * s, pat.z1 * s, pat.r * s); hh.clip();
    for (let z = 5; z < 100; z++) for (let x = 5; x < 49; x++) { a.fillRect((x - 0.25) * s, (z - 0.25) * s, 0.5 * s, 0.5 * s); hh.fillRect((x - 0.25) * s, (z - 0.25) * s, 0.5 * s, 0.5 * s); }
    a.restore(); hh.restore();
    // накладка камеры: шлифованный металл, объектив, зеркальце
    const P = D.plate, x0 = mx(P.x + P.hw), x1 = mx(P.x - P.hw), z0 = mz(P.z0), z1 = mz(P.z1);
    rrect(a, x0, z0, x1, z1, 2.4 * s); a.fillStyle = '#b3b6bb'; a.fill(); rrect(q, x0, z0, x1, z1, 2.4 * s); q.fillStyle = orm(0.3, 1); q.fill();
    rrect(hh, x0, z0, x1, z1, 2.4 * s); hh.fillStyle = '#a8a8a8'; hh.fill();
    const lx = mx(P.x), lz = mz(P.lensZ), mz2 = mz(P.mirrorZ);
    a.fillStyle = '#7f8288'; a.beginPath(); a.arc(lx, lz, 4.0 * s, 0, 7); a.fill(); a.fillStyle = '#08080a'; a.beginPath(); a.arc(lx, lz, 3.0 * s, 0, 7); a.fill();
    a.fillStyle = '#23242a'; a.beginPath(); a.arc(lx, lz, 1.5 * s, 0, 7); a.fill(); a.fillStyle = '#050506'; a.beginPath(); a.arc(lx, lz, 0.8 * s, 0, 7); a.fill();
    a.fillStyle = '#d5d7db'; a.beginPath(); a.arc(lx, mz2, 2.7 * s, 0, 7); a.fill();
    q.fillStyle = orm(0.06, 0); q.beginPath(); q.arc(lx, lz, 3.0 * s, 0, 7); q.fill(); q.fillStyle = orm(0.04, 1); q.beginPath(); q.arc(lx, mz2, 2.7 * s, 0, 7); q.fill();
    return { A, O, H, N: heightToNormal(H, 2.5), w, h };
  }
  function drawTile() { // «общий» глянцевый пластик: едва заметные волосяные потёртости в шероховатости
    const n = 512, O = mkCanvas(n, n), q = O.getContext('2d');
    q.fillStyle = orm(0.14, 0); q.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) { const x = rng() * n, y = rng() * n, a2 = rng() * 7, l = 6 + rng() * 40; q.strokeStyle = `rgba(255,${Math.round(90 + rng() * 60)},0,${0.25 + rng() * 0.4})`; q.lineWidth = 0.6; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(a2) * l, y + Math.sin(a2) * l); q.stroke(); }
    return O;
  }

  // ---------- карты ----------
  const loads = [], texReg = [];
  const packUrl = (file, set) => o.pbrBase + (set === 'full' ? 'pack/' : 'pack_' + set + '/') + file;   // full | low | ultra (только для замеров)
  function loadInto(t, url) {
    return new Promise((res) => {
      if (typeof Image === 'undefined') { res(false); return; }
      const img = new Image();
      img.onload = () => { if (t.image) t.dispose(); t.image = img; t.needsUpdate = true; res(true); };
      img.onerror = () => { console.warn('[phone48] нет карты ' + url); res(false); };
      img.src = url;
    });
  }
  function loadTex(file, srgb, repeat) {
    const t = new THREE.Texture();
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = o.anisotropy;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    disposables.push(t); texReg.push({ t, file }); loads.push(loadInto(t, packUrl(file, mapSet))); return t;
  }
  let M;   // { front:{a,n,o}, back:{a,n,o}, tile:{n,o} }
  if (o.pbr) {
    M = { front: { a: loadTex('front_a.jpg', true), n: loadTex('front_n.png', false), o: loadTex('front_orm.jpg', false) },
      back: { a: loadTex('back_a.jpg', true), n: loadTex('back_n.png', false), o: loadTex('back_orm.jpg', false) },
      tile: { n: loadTex('tile_n.png', false, true), o: loadTex('tile_orm.jpg', false, true) } };
  } else {
    const F = drawFront(o.textureSize), B = drawBack(o.textureSize);
    group.userData.canvases = { front: F, back: B };   // для tools/export_masks: маски областей берутся с этих же холстов
    M = { front: { a: canvasTex(F.A, true), n: canvasTex(F.N, false), o: canvasTex(F.O, false) },
      back: { a: canvasTex(B.A, true), n: canvasTex(B.N, false), o: canvasTex(B.O, false) },
      tile: { n: null, o: canvasTex(drawTile(), false, true) } };
  }
  const phys = (p) => { const m = new THREE.MeshPhysicalMaterial(p); disposables.push(m); return m; };
  const faceMat = (F, extra = {}) => phys(Object.assign({ map: F.a, normalMap: F.n, roughnessMap: F.o, metalnessMap: F.o, aoMap: F.o, aoMapIntensity: 0.9,
    roughness: 1, metalness: 1, normalScale: new THREE.Vector2(1, 1) }, extra));
  const mFront = faceMat(M.front), mBack = faceMat(M.back);
  const mScreen = faceMat(M.front, { emissive: new THREE.Color(0x000000) });
  const mFrame = phys({ color: new THREE.Color(0.022, 0.022, 0.026), roughness: 1, metalness: 0, roughnessMap: M.tile.o, normalMap: M.tile.n, normalScale: new THREE.Vector2(0.5, 0.5) });
  const mChrome = phys({ color: new THREE.Color(0.40, 0.42, 0.47), roughness: 1, metalness: 1, roughnessMap: M.tile.o, normalMap: M.tile.n, normalScale: new THREE.Vector2(0.35, 0.35) });
  mChrome.userData.roughBias = 0.06;
  const mDark = phys({ color: 0x030303, roughness: 0.9, metalness: 0 });
  const mMirror = phys({ color: new THREE.Color(0.86, 0.87, 0.9), roughness: 0.035, metalness: 1, side: THREE.DoubleSide });
  const mRing = phys({ color: new THREE.Color(0.5, 0.52, 0.56), roughness: 0.22, metalness: 1, side: THREE.DoubleSide });
  const mLens = phys({ color: new THREE.Color(0.012, 0.012, 0.02), roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.55, iridescenceIOR: 1.6, iridescenceThicknessRange: [240, 420] });

  // ---------- сборка ----------
  let tris = 0, meshes = 0;
  const mesh = (geo, mat, name, cast = true) => {
    const m = new THREE.Mesh(geo, mat); if (name) m.name = name; m.castShadow = cast; m.receiveShadow = true;

    group.add(m); tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; meshes++; disposables.push(geo); return m;
  };
  const hw = W / 2, hd = L / 2;
  // спинка: крышка батареи — плоская середина и скруглённый край; UV — проекция снизу (как на фото спинки)
  const backProf = [];
  for (let k = 0; k <= 10; k++) { const th = (k / 10) * Math.PI / 2; backProf.push([D.backInset * (1 - Math.sin(th)), D.backRise * (1 - Math.cos(th))]); }
  backProf[backProf.length - 1][0] = 0.00012;
  mesh(mergeGeos(THREE, [
    capGeo(THREE, { hw: hw - D.backInset, hd: hd - D.backInset, r: R - D.backInset, y: 0, up: false, seg: SEG, uv: bUV }),
    sideGeo(THREE, { hw, hd, r: R, profile: backProf, seg: SEG, uvf: (x, z) => bUV(x, z) }),
  ]), mBack, 'back_cover');
  // рамка: глянцевый чёрный пластик между швами
  mesh(sideGeo(THREE, { hw, hd, r: R, seg: SEG, profile: [[0.00012, D.seamLo], [0, D.seamLo + 0.00015], [0, D.seamHi - 0.0001], [0.0001, D.seamHi]] }), mFrame, 'frame');
  // обод: хром, скруглён к лицевой панели, панель утоплена на 0,25 мм
  const rimProf = [[0.0001, D.seamHi], [0, D.seamHi + 0.00012], [0, 10.9 * MM]];
  for (let k = 1; k <= 8; k++) { const th = (k / 8) * Math.PI / 2; rimProf.push([1.0 * MM * (1 - Math.cos(th)), 10.9 * MM + 1.0 * MM * Math.sin(th)]); }
  rimProf.push([1.35 * MM, T], [1.48 * MM, T - 0.0001], [D.rimInset, D.yFront]);
  mesh(sideGeo(THREE, { hw, hd, r: R, seg: SEG, profile: rimProf }), mChrome, 'rim');
  // лицевая панель: окно экрана и окно динамика
  const S = D.screen, E = D.ear, yF = D.yFront;
  mesh(capGeo(THREE, { hw: hw - D.rimInset, hd: hd - D.rimInset, r: R - D.rimInset, y: yF, up: true, seg: SEG, uv: fUV,
    holes: [{ x0: S.x0, z0: S.z0, x1: S.x1, z1: S.z1, r: 0.0004 }, { x0: -E.hw, z0: E.z - E.hd, x1: E.hw, z1: E.z + E.hd, r: E.hd }] }), mFront, 'front_panel');
  // экран: отдельный меш в окне панели; uv — общий с панелью (отпечатки и царапины идут без шва), uv1 — под картинку
  {
    const g = new THREE.BufferGeometry(), c = [[S.x0, S.z0], [S.x1, S.z0], [S.x0, S.z1], [S.x1, S.z1]];
    const pos = [], nor = [], uv = [], uv1 = [];
    c.forEach(([x, z], i) => { pos.push(x, yF, z); nor.push(0, 1, 0); uv.push(...fUV(x, z)); uv1.push(i % 2, i < 2 ? 1 : 0); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));

    g.setIndex([0, 2, 1, 1, 2, 3]);
    mScreen.aoMap = null;
    mesh(g, mScreen, 'screen', false);
  }
  // динамик: стенка окна и утопленная сетка (берёт свой участок карты переда)
  mesh(mergeGeos(THREE, [
    sideGeo(THREE, { hw: E.hw, hd: E.hd, r: E.hd, cz: E.z, seg: 8, inward: true, profile: [[0, yF - 0.0003], [0, yF]], uvf: (x, z) => fUV(x, z) }),
    capGeo(THREE, { hw: E.hw, hd: E.hd, r: E.hd, cz: E.z, y: yF - 0.0003, up: true, seg: 8, uv: fUV }),
  ]), mFront, 'earpiece', false);
  // кнопки под экраном
  const K = D.keys;
  mesh(chipGeo(THREE, { hw: K.pill[0], hd: K.pill[1], r: K.pill[1], cx: -K.side, cz: K.z, y0: yF, h: 0.00032, bevel: 0.00012, uv: fUV }), mFront, 'key_call');
  mesh(chipGeo(THREE, { hw: K.pill[0], hd: K.pill[1], r: K.pill[1], cx: K.side, cz: K.z, y0: yF, h: 0.00032, bevel: 0.00012, uv: fUV }), mFront, 'key_end');
  mesh(mergeGeos(THREE, [
    chipGeo(THREE, { hw: K.mid, hd: K.mid, r: 1.6 * MM, cz: K.z, y0: yF, h: 0.00042, bevel: 0.00016, uv: fUV }),
    chipGeo(THREE, { hw: K.mid - 0.9 * MM, hd: K.mid - 0.9 * MM, r: 1.0 * MM, cz: K.z, y0: yF + 0.00042, h: 0.00014, bevel: 0.0001, uv: fUV }),
  ]), mFront, 'key_back');
  // накладка камеры на спинке, объектив и зеркальце для автопортрета
  const P = D.plate;
  mesh(chipGeo(THREE, { hw: P.hw, hd: (P.z1 - P.z0) / 2, r: 2.4 * MM, cx: P.x, cz: (P.z0 + P.z1) / 2, y0: 0, h: 0.00035, bevel: 0.00014, up: false, uv: bUV }), mBack, 'camera_plate');
  {
    const ring = new THREE.LatheGeometry([[3.0, 0.0], [3.12, 0.42], [3.45, 0.55], [3.8, 0.45], [4.0, 0.0]].map((q) => new THREE.Vector2(q[0] * MM, q[1] * MM)), 40);
    ring.rotateX(Math.PI); ring.translate(P.x, -0.00035, P.lensZ); mesh(ring, mRing, 'lens_ring');
    const lens = new THREE.CircleGeometry(3.05 * MM, 40); lens.rotateX(Math.PI / 2); lens.translate(P.x, -0.00035 - 0.00012, P.lensZ); mesh(lens, mLens, 'lens', false);
    const rc = 7 * MM, br = 2.7 * MM, th = Math.asin(br / rc);
    const dome = new THREE.SphereGeometry(rc, 32, 8, 0, Math.PI * 2, 0, th); dome.translate(0, -rc * Math.cos(th), 0); dome.rotateX(Math.PI); dome.translate(P.x, -0.00035, P.mirrorZ);
    mesh(dome, mMirror, 'selfie_mirror');
  }
  // боковые кнопки: «плитка» строится в плоскости XZ и кладётся на бок
  const sideKey = (name, side, z, len, hgt, out, y) => {
    const g = chipGeo(THREE, { hw: hgt / 2, hd: len / 2, r: hgt / 2 * 0.8, h: out, bevel: out * 0.45, seg: 5 });
    g.rotateZ(side < 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(side * hw, y, z); return mesh(g, mFrame, name);
  };
  sideKey('key_volume', -1, D.volume.z, D.volume.len, 2.6 * MM, 0.00055, 6.9 * MM);
  sideKey('key_lock', 1, D.lock.z, D.lock.len, 2.4 * MM, 0.0005, 6.9 * MM);
  sideKey('key_camera', 1, D.cam.z, D.cam.len, 2.4 * MM, 0.0005, 6.9 * MM);
  { // ложбинка посередине качельки громкости
    const g = new THREE.PlaneGeometry(0.0004, 2.0 * MM); g.rotateY(-Math.PI / 2); g.rotateX(Math.PI / 2); g.translate(-hw - 0.00056, 6.9 * MM, D.volume.z); mesh(g, mDark, 'volume_notch', false);
  }
  { // заглушка разъёма на верхнем торце (чуть выступает), с выемкой под ноготь
    const g = chipGeo(THREE, { hw: D.flap.len / 2, hd: 1.6 * MM, r: 0.9 * MM, h: 0.00014, bevel: 0.00007, seg: 5 });
    g.rotateX(-Math.PI / 2); g.translate(D.flap.x, 6.9 * MM, -hd); mesh(g, mFrame, 'port_flap');
    const n = new THREE.PlaneGeometry(3.2 * MM, 0.45 * MM); n.rotateY(Math.PI); n.translate(D.flap.x, 6.9 * MM - 1.6 * MM - 0.0003, -hd - 0.00002); mesh(n, mDark, 'flap_notch', false);
  }
  { // нижний торец: отверстие микрофона и выемка для снятия крышки
    const mic = new THREE.CircleGeometry(0.45 * MM, 16); mic.translate(-9 * MM, 6.9 * MM, hd + 0.00002); mesh(mic, mDark, 'mic_hole', false);
    const nt = new THREE.PlaneGeometry(7 * MM, 0.7 * MM); nt.translate(0, D.seamLo, hd + 0.00002); mesh(nt, mDark, 'cover_notch', false);
  }

  // ---------- экран: картинка интерфейса (светится сама) ----------
  const setScreenTexture = (tex) => {
    if (tex) { tex.channel = 1; tex.colorSpace = THREE.SRGBColorSpace; mScreen.emissiveMap = tex; mScreen.emissive.setRGB(1, 1, 1); mScreen.emissiveIntensity = 1; }
    else { mScreen.emissiveMap = null; mScreen.emissive.setRGB(0, 0, 0); }
    mScreen.needsUpdate = true; if (o.onChange) o.onChange();
  };

  // ---------- итог ----------
  const texMB = () => {
    let b = 0; const seen = new Set();
    for (const t of disposables) if (t.isTexture && t.image && !seen.has(t)) { seen.add(t); b += (t.image.width || 0) * (t.image.height || 0) * 4 * (t.generateMipmaps === false ? 1 : 4 / 3); }
    return Math.round(b / 1048576 * 10) / 10;
  };
  const stats = { triangles: Math.round(tris), meshes, mapSet, get texMB() { return texMB(); } };
  const finish = () => { if (o.onChange) o.onChange(); return true; };
  group.visible = !o.pbr;
  const ready = Promise.all(loads).then((r) => { group.userData.mapsOk = r.every(Boolean); group.visible = true; return finish(); });
  const loadMapSet = (set) => {
    if (!o.pbr || set === mapSet) return Promise.resolve(true);
    mapSet = set; stats.mapSet = set; group.userData.mapSet = set;
    return Promise.all(texReg.map((e) => loadInto(e.t, packUrl(e.file, set)))).then(finish);
  };
  Object.assign(group.userData, { ready, setScreenTexture, loadMapSet, mapSet, stats, dims: D,
    layout: { fUV, bUV }, dispose() { for (const d of disposables) d.dispose(); } });
  return group;
}
