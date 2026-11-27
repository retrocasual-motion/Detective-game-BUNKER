// camera24.js — служебная камера инженера (материал дела № 24), построенная кодом three.js.
// Без файлов-моделей: форма — геометрией, поверхности — фото-карты PBR (или рисунок кодом, если карт нет).
// Класс вещи: компактная камера 2009 года (по размерам и раскладке — Sony DSC-W210 / W220), без марок.
// Объектив убран, шторки закрыты: игрок только смотрит кадры, а в режиме просмотра у таких камер объектив не выезжает.
// Модуль не зависит от страницы: buildCamera24(THREE, opts) -> THREE.Group.
//
// Оси вещи: X — вправо, если смотреть на объектив; Y — вверх; +Z — объектив, −Z — экран. Центр — в середине корпуса.
// Узлы по именам: screen (матрица экрана под стеклом; uv1 — 0…1 под картинку, верх картинки — к верху камеры),
//   screen_glass (стекло: блики и царапины; в выбор лучом не попадает), нажимаемые детали — группы:
//   btn_play, btn_menu, btn_home, btn_ok, pad_ring (стрелки), zoom_rocker (W / T), btn_shutter, btn_power;
//   не нажимаются: mode_dial_*, lens_unit (кольца и шторки объектива), flash, front_plate, back_shell, band.
//
// opts: pbr (true), pbrBase, mapSet: 'full' | 'low', lowPower, textureSize, anisotropy, onChange — как у phone48.js;
//   label — false: без ярлыка бюро (по умолчанию ярлык есть: 38 × 21,7 мм на стороне объектива, слева от него; узел label_bureau_24).
// root.userData: ready (Promise), setScreenTexture(tex | null), loadMapSet(set), stats, dims, dispose(),
//   keys — имена кнопок: btn_up, btn_down, btn_left, btn_right, btn_ok, btn_menu, btn_home, btn_play,
//          btn_zoom_w, btn_zoom_t, btn_shutter, btn_power;
//   setKeyPressed(name, down), pressKey(name, ms), keyDepth(name) — 0…1,
//   keyFromHit(hit) — имя кнопки под лучом (у кольца стрелок и качельки зума — по месту попадания).

const MM = 0.001;
export const CAMERA24 = {
  W: 95 * MM, H: 57 * MM, T: 22 * MM, R: 7 * MM,
  fillet: 2.5 * MM, bandLo: 6 * MM, bandHi: 19.3 * MM,          // скругления кромок и пояс между ними
  // объектив, вспышка, лампа и микрофон стоят по фото GEN22 (замер tools/make_maps.py: центр колец 17,0 / 1,4 мм)
  front: { lens: { x: 17 * MM, z: 1.4 * MM, r: 20.25 * MM }, flash: { x: -8.6 * MM, z: -20.4 * MM, hw: 8.3 * MM, hd: 2.9 * MM, r: 2.2 * MM }, lamp: { x: 43.1 * MM, z: -5.5 * MM },
    mic: [[40.55 * MM, -14.75 * MM], [42.19 * MM, -14.75 * MM], [43.83 * MM, -14.75 * MM]] },
  // задняя стенка в координатах вещи (X вправо со стороны объектива): экран — слева для зрителя экрана, то есть на +X
  back: { screen: { x0: 43 * MM, x1: -11.9 * MM, z0: -22 * MM, z1: 19.1 * MM },
    zoom: { x: -31 * MM, z: -21.5 * MM }, dial: { x: -36.5 * MM, z: -8.5 * MM }, play: { x: -22 * MM, z: -9.5 * MM },
    pad: { x: -31 * MM, z: 9.5 * MM }, menu: { x: -21.5 * MM, z: 20.5 * MM }, home: { x: -40.5 * MM, z: 20.5 * MM },
    grip: { x: -45 * MM, z: 2 * MM }, ctl: { x0: -47.5 * MM, x1: -12.5 * MM } },
  top: { shutter: -30 * MM, power: -15 * MM },
  bottom: { tripod: 18 * MM, door: [-40 * MM, -12 * MM] },
  label: { x0: -44 * MM, x1: -6 * MM, zc: 6 * MM, lift: 0.6 * MM },   // ярлык бюро 38 × 21,7 мм на стороне объектива, слева от него
};
const TILE = 0.030; // метров на повтор плитки «общего» металла

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
  const { hw, hd, r, cx = 0, cz = 0, seg = 10, inward = false, uvf = null, perim = null } = p;   // perim: [y0, y1] — u по периметру 0…1, v по высоте
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
      if (uvf) { const t = uvf(q.x, q.z, prof[i][1]); uv.push(t[0], t[1]); }
      else if (perim) uv.push(ulen[j] / ulen[nc - 1], (prof[i][1] - perim[0]) / (perim[1] - perim[0]));
      else uv.push(ulen[j] / TILE, v / TILE);
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
// профиль края «плитки»: стенка и скругление четвертью круга (6 колец — грани не видны и вплотную)
function bevelProf(y0, h, bevel, up = true) {
  const NB = 5, arc = [];
  for (let k = 0; k <= NB; k++) { const a = (k / NB) * Math.PI / 2; arc.push([bevel * (1 - Math.cos(a)), bevel * Math.sin(a)]); }
  return up ? [[0, y0], ...arc.map(([i, d]) => [i, y0 + h - bevel + d])]
    : [...arc.map(([i, d]) => [i, y0 - h + bevel - d]).reverse(), [0, y0]];
}
// скруглённая «плитка» (кнопка, накладка): бок + верх; растёт от y0 на h вверх (up) или вниз
function chipGeo(THREE, p) {
  const { hw, hd, r, cx = 0, cz = 0, y0 = 0, h, bevel, up = true, seg = 6, uv = null } = p;
  const s = up ? 1 : -1;
  const prof = bevelProf(y0, h, bevel, up);
  const uvf = uv ? (x, z) => uv(x, z) : null;
  return mergeGeos(THREE, [
    sideGeo(THREE, { hw, hd, r, cx, cz, profile: prof, seg, uvf }),
    capGeo(THREE, { hw: hw - bevel, hd: hd - bevel, r: Math.max(r - bevel, 1e-5), cx, cz, y: y0 + s * h, up, seg, uv: uv || undefined }),
  ]);
}

// =====================================================================================
export function buildCamera24(THREE, opts = {}) {
  const D = CAMERA24, { W, H, T, R } = D;
  const rel = (p) => { try { return new URL(p, import.meta.url).href; } catch (e) { return p; } };
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const smallWin = typeof innerWidth !== 'undefined' && Math.min(innerWidth, innerHeight) < 700;
  const o = Object.assign({ pbr: true, pbrBase: rel('./textures/pbr/'), textureSize: 2048, anisotropy: 8, lowPower: coarse || smallWin }, opts);
  let mapSet = o.mapSet || (o.lowPower ? 'low' : 'full');
  const SEG = o.lowPower ? 16 : 24, KSEG = o.lowPower ? 14 : 20, LSEG = o.lowPower ? 64 : 112;
  const rng = rngFactory(2409);
  const disposables = [];
  const root = new THREE.Group(); root.name = 'camera24';
  // внутри камера «лежит на спине»: X — вправо (вид спереди), Y — к объективу, верх камеры на −Z, y = 0 — задняя стенка
  const group = new THREE.Group(); group.name = 'camera24_body'; group.rotation.x = Math.PI / 2; group.position.z = -T / 2; root.add(group);
  const hw = W / 2, hd = H / 2;
  const fUV = (x, z) => [(x + hw) / W, 1 - (z + hd) / H];   // перед: как видит зритель объектива, верх камеры — верх картинки
  const bUV = (x, z) => [(hw - x) / W, 1 - (z + hd) / H];   // зад: как видит зритель экрана

  // ---------- рисунок кодом: ортовиды для генератора, запасной режим, значки ----------
  function canvasTex(c, srgb, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = o.anisotropy;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    disposables.push(t); return t;
  }
  function heightToNormal(hc, strength) {
    const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
    const out = mkCanvas(w, h), octx = out.getContext('2d'), img = octx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = src[(y * w + Math.max(x - 1, 0)) * 4], r2 = src[(y * w + Math.min(x + 1, w - 1)) * 4];
      const u = src[(Math.max(y - 1, 0) * w + x) * 4], dn = src[(Math.min(y + 1, h - 1) * w + x) * 4];
      const nx = (l - r2) / 255 * strength, ny = (dn - u) / 255 * strength, il = 1 / Math.hypot(nx, ny, 1);
      d[i] = (nx * il * 0.5 + 0.5) * 255; d[i + 1] = (ny * il * 0.5 + 0.5) * 255; d[i + 2] = (il * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    octx.putImageData(img, 0, 0); return out;
  }
  const orm = (rough, metal, ao = 1) => `rgb(${Math.round(ao * 255)},${Math.round(rough * 255)},${Math.round(metal * 255)})`;
  // Надписи и значки задней стенки: печать на корпусе рядом с кнопками и на самих кнопках. Рисуются отдельным
  // прозрачным слоем: в запасном режиме — поверх рисунка, а tools/make_maps.py кладёт этот же слой на фото (резкий край).
  // Латиница MENU / DISP / W T — как на любой камере 2009 года и как на нынешней модели в игре; марок нет.
  function drawBackLabels(c, s) {
    const mx = (x) => (47.5 - x / MM) * s, mz = (z) => (z / MM + 28.5) * s, B = D.back, ink = '#2e3136';
    c.fillStyle = ink; c.strokeStyle = ink; c.lineJoin = 'round'; c.lineCap = 'round'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const font = (mm, bold = true) => { c.font = `${bold ? '700 ' : ''}${mm * s}px Arial, Helvetica, sans-serif`; };
    // качелька зума: W и T на самой качельке
    font(2.6); c.fillText('W', mx(B.zoom.x) - 4.6 * s, mz(B.zoom.z) + 0.1 * s); c.fillText('T', mx(B.zoom.x) + 4.6 * s, mz(B.zoom.z) + 0.1 * s);
    // просмотр: треугольник в рамке слева от кнопки
    { const x = mx(B.play.x) - 6.4 * s, y = mz(B.play.z); c.lineWidth = 0.28 * s; rrect(c, x - 2.0 * s, y - 1.5 * s, x + 2.0 * s, y + 1.5 * s, 0.5 * s); c.stroke();
      c.beginPath(); c.moveTo(x - 0.7 * s, y - 0.85 * s); c.lineTo(x + 0.95 * s, y); c.lineTo(x - 0.7 * s, y + 0.85 * s); c.closePath(); c.fill(); }
    // MENU под левой нижней кнопкой, домик под правой
    font(2.2); c.fillText('MENU', mx(B.menu.x), mz(B.menu.z) + 4.6 * s);
    { const x = mx(B.home.x), y = mz(B.home.z) + 4.6 * s; c.beginPath(); c.moveTo(x - 1.5 * s, y); c.lineTo(x, y - 1.35 * s); c.lineTo(x + 1.5 * s, y); c.lineTo(x + 1.05 * s, y); c.lineTo(x + 1.05 * s, y + 1.2 * s); c.lineTo(x - 1.05 * s, y + 1.2 * s); c.lineTo(x - 1.05 * s, y); c.closePath(); c.fill(); }
    // круговая кнопка: DISP сверху, вспышка справа, таймер снизу, макро слева — на самом кольце
    const px = mx(B.pad.x), pz = mz(B.pad.z), rr2 = 6.9 * s;
    font(1.75); c.fillText('DISP', px, pz - rr2);
    { const x = px + rr2, y = pz; c.beginPath(); c.moveTo(x + 0.35 * s, y - 1.3 * s); c.lineTo(x - 0.75 * s, y + 0.2 * s); c.lineTo(x - 0.05 * s, y + 0.2 * s); c.lineTo(x - 0.4 * s, y + 1.3 * s); c.lineTo(x + 0.75 * s, y - 0.25 * s); c.lineTo(x + 0.05 * s, y - 0.25 * s); c.closePath(); c.fill(); }
    { const x = px, y = pz + rr2; c.lineWidth = 0.26 * s; c.beginPath(); c.arc(x, y, 1.05 * s, 0, 7); c.stroke(); c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 0.7 * s); c.moveTo(x, y); c.lineTo(x + 0.5 * s, y + 0.3 * s); c.stroke(); }
    { const x = px - rr2, y = pz; for (let k = 0; k < 5; k++) { const a2 = k / 5 * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.arc(x + Math.cos(a2) * 0.62 * s, y - 0.25 * s + Math.sin(a2) * 0.62 * s, 0.42 * s, 0, 7); c.fill(); }
      c.lineWidth = 0.24 * s; c.beginPath(); c.moveTo(x, y + 0.3 * s); c.lineTo(x, y + 1.35 * s); c.stroke(); }
    // диск режимов: шесть значков по кругу на его верхе (камера — зелёная, P, плёнка, горы, луна, лицо)
    { const dx = mx(B.dial.x), dz = mz(B.dial.z), R2 = 4.2 * s, u = s * 0.05;
      const at = (k) => [dx + Math.cos(k / 6 * Math.PI * 2 - Math.PI / 2) * R2, dz + Math.sin(k / 6 * Math.PI * 2 - Math.PI / 2) * R2];
      { const [x, y] = at(0); c.fillStyle = '#2f8f58'; rrect(c, x - 22 * u, y - 14 * u, x + 22 * u, y + 16 * u, 5 * u); c.fill(); c.fillRect(x - 9 * u, y - 21 * u, 18 * u, 9 * u);
        c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(x, y + 1 * u, 8 * u, 0, 7); c.fill(); c.restore(); c.fillStyle = ink; }
      { const [x, y] = at(1); c.font = `700 ${40 * u}px Arial, Helvetica, sans-serif`; c.fillText('P', x, y + 2 * u); }
      { const [x, y] = at(2); rrect(c, x - 20 * u, y - 13 * u, x + 8 * u, y + 13 * u, 4 * u); c.fill(); c.beginPath(); c.moveTo(x + 10 * u, y - 3 * u); c.lineTo(x + 23 * u, y - 12 * u); c.lineTo(x + 23 * u, y + 12 * u); c.lineTo(x + 10 * u, y + 3 * u); c.closePath(); c.fill(); }
      { const [x, y] = at(3); c.beginPath(); c.moveTo(x - 24 * u, y + 14 * u); c.lineTo(x - 7 * u, y - 14 * u); c.lineTo(x + 3 * u, y + 1 * u); c.lineTo(x + 10 * u, y - 8 * u); c.lineTo(x + 24 * u, y + 14 * u); c.closePath(); c.fill(); }
      { const [x, y] = at(4); c.beginPath(); c.arc(x, y, 16 * u, 0.6, Math.PI * 2 - 0.6); c.arc(x + 10 * u, y, 12 * u, Math.PI * 2 - 1.0, 1.0, true); c.closePath(); c.fill(); }
      { const [x, y] = at(5); c.beginPath(); c.arc(x, y - 6 * u, 9 * u, 0, 7); c.fill(); c.beginPath(); c.arc(x, y + 22 * u, 17 * u, Math.PI, 0); c.closePath(); c.fill(); } }
  }
  function drawFront(size) {
    const s = size / (W / MM), w = size, h = Math.round(57 * s);
    const A = mkCanvas(w, h), a = A.getContext('2d'), O = mkCanvas(w, h), q = O.getContext('2d'), Hc = mkCanvas(w, h), hh = Hc.getContext('2d');
    const mx = (x) => (x / MM + 47.5) * s, mz = (z) => (z / MM + 28.5) * s, F = D.front;
    a.fillStyle = '#b4b7bb'; a.fillRect(0, 0, w, h); q.fillStyle = orm(0.36, 1); q.fillRect(0, 0, w, h); hh.fillStyle = '#808080'; hh.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { const y = rng() * h, x = rng() * w, ln = 80 + rng() * 900, up2 = rng() < 0.5, al = 0.03 + rng() * 0.08;
      a.fillStyle = `rgba(${up2 ? '255,255,255' : '0,0,0'},${al})`; a.fillRect(x, y, ln, 1); hh.fillStyle = `rgba(${up2 ? '255,255,255' : '0,0,0'},${al * 2})`; hh.fillRect(x, y, ln, 1); }
    // место блока объектива (на модели это геометрия): тёмный круг, чтобы генератор понял, где кольцо
    a.fillStyle = '#8d9095'; a.beginPath(); a.arc(mx(F.lens.x), mz(F.lens.z), F.lens.r / MM * s, 0, 7); a.fill();
    a.fillStyle = '#5c5f64'; a.beginPath(); a.arc(mx(F.lens.x), mz(F.lens.z), 15.3 * s, 0, 7); a.fill();
    a.fillStyle = '#1b1c1e'; a.beginPath(); a.arc(mx(F.lens.x), mz(F.lens.z), 10.0 * s, 0, 7); a.fill();
    // окно вспышки, лампа подсветки, три отверстия микрофона
    rrect(a, mx(F.flash.x - F.flash.hw), mz(F.flash.z - F.flash.hd), mx(F.flash.x + F.flash.hw), mz(F.flash.z + F.flash.hd), F.flash.r / MM * s); a.fillStyle = '#e9e6d8'; a.fill();
    a.fillStyle = '#3a3226'; a.beginPath(); a.arc(mx(F.lamp.x), mz(F.lamp.z), 1.6 * s, 0, 7); a.fill();
    a.fillStyle = '#202124'; hh.fillStyle = '#404040';
    for (const [dx, dz] of F.mic) for (const c2 of [a, hh]) { c2.beginPath(); c2.arc(mx(dx), mz(dz), 0.45 * s, 0, 7); c2.fill(); }
    return { A, O, H: Hc, N: heightToNormal(Hc, 1.6), w, h };
  }
  function drawBack(size) {
    const s = size / (W / MM), w = size, h = Math.round(57 * s);
    const A = mkCanvas(w, h), a = A.getContext('2d'), O = mkCanvas(w, h), q = O.getContext('2d'), Hc = mkCanvas(w, h), hh = Hc.getContext('2d');
    const mx = (x) => (47.5 - x / MM) * s, mz = (z) => (z / MM + 28.5) * s, B = D.back;
    a.fillStyle = '#a6a9ad'; a.fillRect(0, 0, w, h); q.fillStyle = orm(0.42, 0.85); q.fillRect(0, 0, w, h); hh.fillStyle = '#808080'; hh.fillRect(0, 0, w, h);
    // стекло экрана с чёрной каймой, сам экран выключен
    const S = B.screen, x0 = mx(S.x0), x1 = mx(S.x1), z0 = mz(S.z0), z1 = mz(S.z1);
    rrect(a, Math.min(x0, x1) - 1.6 * s, z0 - 1.6 * s, Math.max(x0, x1) + 1.6 * s, z1 + 1.6 * s, 1.2 * s); a.fillStyle = '#0b0b0d'; a.fill();
    rrect(q, Math.min(x0, x1) - 1.6 * s, z0 - 1.6 * s, Math.max(x0, x1) + 1.6 * s, z1 + 1.6 * s, 1.2 * s); q.fillStyle = orm(0.10, 0); q.fill();
    a.fillStyle = '#14161a'; a.fillRect(Math.min(x0, x1), z0, Math.abs(x1 - x0), z1 - z0);
    // места кнопок (на модели это геометрия): чуть светлее корпуса
    a.fillStyle = '#c3c6ca';
    rrect(a, mx(B.zoom.x) - 7.5 * s, mz(B.zoom.z) - 3 * s, mx(B.zoom.x) + 7.5 * s, mz(B.zoom.z) + 3 * s, 2 * s); a.fill();
    for (const k of ['play', 'menu', 'home']) { a.beginPath(); a.arc(mx(B[k].x), mz(B[k].z), 2.6 * s, 0, 7); a.fill(); }
    a.beginPath(); a.arc(mx(B.pad.x), mz(B.pad.z), 9.5 * s, 0, 7); a.fill(); a.fillStyle = '#b0b3b7'; a.beginPath(); a.arc(mx(B.pad.x), mz(B.pad.z), 3.9 * s, 0, 7); a.fill();
    a.fillStyle = '#9a9da2'; a.beginPath(); a.arc(mx(B.dial.x), mz(B.dial.z), 6.5 * s, 0, 7); a.fill();
    // точки под большой палец
    a.fillStyle = '#8f9297'; hh.fillStyle = '#9a9a9a';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) for (const c2 of [a, hh]) { c2.beginPath(); c2.arc(mx(B.grip.x) + (i - 0.5) * 1.6 * s, mz(B.grip.z) + (j - 1) * 1.6 * s, 0.42 * s, 0, 7); c2.fill(); }
    const Lc = mkCanvas(w, h); drawBackLabels(Lc.getContext('2d'), s); if (o.labels !== false) a.drawImage(Lc, 0, 0);   // labels: false — ортовид без надписей (их кладёт make_maps.py)
    return { A, O, H: Hc, L: Lc, N: heightToNormal(Hc, 1.6), w, h };
  }
  function drawTile() { // «общий» металл: волосяные потёртости в шероховатости
    const n = 512, O = mkCanvas(n, n), q = O.getContext('2d');
    q.fillStyle = orm(0.22, 1); q.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) { const x = rng() * n, y = rng() * n, a2 = rng() * 7, l = 6 + rng() * 40; q.strokeStyle = `rgba(255,${Math.round(110 + rng() * 60)},255,${0.25 + rng() * 0.4})`; q.lineWidth = 0.6; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(a2) * l, y + Math.sin(a2) * l); q.stroke(); }
    return O;
  }
  function drawLensCover() { // шторки убранного объектива: две тёмные створки в скруглённом квадрате
    const n = 512, A = mkCanvas(n, n), a = A.getContext('2d'), O = mkCanvas(n, n), q = O.getContext('2d'), c0 = n / 2;
    a.fillStyle = '#0c0c0d'; a.fillRect(0, 0, n, n); q.fillStyle = orm(0.55, 0); q.fillRect(0, 0, n, n);
    rrect(a, c0 - 150, c0 - 150, c0 + 150, c0 + 150, 46); a.fillStyle = '#2a2b2e'; a.fill(); rrect(q, c0 - 150, c0 - 150, c0 + 150, c0 + 150, 46); q.fillStyle = orm(0.36, 0); q.fill();
    const g = a.createLinearGradient(0, c0 - 150, 0, c0 + 150); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0.02)'); g.addColorStop(0.52, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.05)');
    rrect(a, c0 - 150, c0 - 150, c0 + 150, c0 + 150, 46); a.fillStyle = g; a.fill();
    a.strokeStyle = '#050505'; a.lineWidth = 5; a.beginPath(); a.moveTo(c0 - 150, c0 + 6); a.quadraticCurveTo(c0, c0 - 10, c0 + 150, c0 + 6); a.stroke();
    return { A, O };
  }
  function drawFlash() { // рассеиватель вспышки: мелкие вертикальные призмы
    const w = 512, h = 176, A = mkCanvas(w, h), a = A.getContext('2d'), Hc = mkCanvas(w, h), hh = Hc.getContext('2d');
    a.fillStyle = '#d9d6c6'; a.fillRect(0, 0, w, h); hh.fillStyle = '#808080'; hh.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { a.fillStyle = 'rgba(255,255,255,0.35)'; a.fillRect(x, 0, 3, h); a.fillStyle = 'rgba(90,85,60,0.22)'; a.fillRect(x + 5, 0, 2, h); hh.fillStyle = '#b0b0b0'; hh.fillRect(x, 0, 4, h); hh.fillStyle = '#505050'; hh.fillRect(x + 4, 0, 4, h); }
    const g = a.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.55); g.addColorStop(0, 'rgba(255,250,225,0.5)'); g.addColorStop(1, 'rgba(120,112,85,0.35)'); a.fillStyle = g; a.fillRect(0, 0, w, h);
    return { A, N: heightToNormal(Hc, 1.2) };
  }
  function drawDial() { // верх диска режимов: значки по кругу (камера, P, плёнка, горы, луна, лицо)
    const n = 384, A = mkCanvas(n, n), a = A.getContext('2d'), c0 = n / 2, R2 = n * 0.33, ink = '#2e3136';
    a.fillStyle = '#bfc2c6'; a.fillRect(0, 0, n, n);
    for (let i = 0; i < 240; i++) { const a2 = i / 240 * Math.PI * 2; a.strokeStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rng() * 0.07})`; a.beginPath(); a.arc(c0, c0, 20 + rng() * (n / 2 - 24), a2, a2 + 0.5 + rng()); a.stroke(); }
    a.fillStyle = ink; a.strokeStyle = ink; a.lineWidth = 5; a.lineJoin = 'round';
    const at = (k) => [c0 + Math.cos(k / 6 * Math.PI * 2 - Math.PI / 2) * R2, c0 + Math.sin(k / 6 * Math.PI * 2 - Math.PI / 2) * R2];
    { const [x, y] = at(0); a.fillStyle = '#2f8f58'; rrect(a, x - 22, y - 14, x + 22, y + 16, 5); a.fill(); a.fillRect(x - 9, y - 21, 18, 9); a.fillStyle = '#bfc2c6'; a.beginPath(); a.arc(x, y + 1, 8, 0, 7); a.fill(); a.fillStyle = ink; }
    { const [x, y] = at(1); a.font = '700 40px Arial'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.fillText('P', x, y + 2); }
    { const [x, y] = at(2); rrect(a, x - 20, y - 13, x + 8, y + 13, 4); a.fill(); a.beginPath(); a.moveTo(x + 10, y - 3); a.lineTo(x + 23, y - 12); a.lineTo(x + 23, y + 12); a.lineTo(x + 10, y + 3); a.closePath(); a.fill(); }
    { const [x, y] = at(3); a.beginPath(); a.moveTo(x - 24, y + 14); a.lineTo(x - 7, y - 14); a.lineTo(x + 3, y + 1); a.lineTo(x + 10, y - 8); a.lineTo(x + 24, y + 14); a.closePath(); a.fill(); }
    { const [x, y] = at(4); a.beginPath(); a.arc(x, y, 16, 0.6, Math.PI * 2 - 0.6); a.arc(x + 10, y, 12, Math.PI * 2 - 1.0, 1.0, true); a.closePath(); a.fill(); }
    { const [x, y] = at(5); a.beginPath(); a.arc(x, y - 6, 9, 0, 7); a.fill(); a.beginPath(); a.arc(x, y + 22, 17, Math.PI, 0); a.closePath(); a.fill(); }
    return A;
  }

  // ---------- карты ----------
  const loads = [], texReg = [];
  const packUrl = (file, set) => o.pbrBase + (set === 'full' ? 'pack/' : 'pack_' + set + '/') + file;
  function loadInto(t, url) {
    return new Promise((res) => {
      if (typeof Image === 'undefined') { res(false); return; }
      const img = new Image();
      img.onload = () => { if (t.image) t.dispose(); t.image = img; t.needsUpdate = true; res(true); };
      img.onerror = () => { console.warn('[camera24] нет карты ' + url); res(false); };
      img.src = url;
    });
  }
  function loadTex(file, srgb, repeat) {
    const t = new THREE.Texture();
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = o.anisotropy;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    disposables.push(t); texReg.push({ t, file }); loads.push(loadInto(t, packUrl(file, mapSet))); return t;
  }
  let M;
  if (o.pbr) {
    M = { front: { a: loadTex('front_a.jpg', true), n: loadTex('front_n.png', false), o: loadTex('front_orm.jpg', false) },
      back: { a: loadTex('back_a.jpg', true), n: loadTex('back_n.png', false), o: loadTex('back_orm.jpg', false) },
      ctl: { a: loadTex('ctl_a.jpg', true), n: loadTex('ctl_n.png', false), o: loadTex('ctl_orm.jpg', false) },
      side: { a: loadTex('side_a.jpg', true, true), n: loadTex('side_n.png', false, true), o: loadTex('side_orm.jpg', false, true) },
      tile: { n: loadTex('tile_n.png', false, true), o: loadTex('tile_orm.jpg', false, true) },
      label: o.label !== false ? { a: loadTex('label_a.jpg', true), n: loadTex('label_n.png', false), r: loadTex('label_r.jpg', false) } : null };
  } else {
    const F = drawFront(o.textureSize), B = drawBack(o.textureSize);
    root.userData.canvases = { front: F, back: B };   // для tools/export_masks.py: маски областей и слой надписей
    M = { front: { a: canvasTex(F.A, true), n: canvasTex(F.N, false), o: canvasTex(F.O, false) },
      back: { a: canvasTex(B.A, true), n: canvasTex(B.N, false), o: canvasTex(B.O, false) },
      ctl: null, side: null, tile: { n: null, o: canvasTex(drawTile(), false, true) } };
  }
  const phys = (p) => { const m = new THREE.MeshPhysicalMaterial(p); disposables.push(m); return m; };
  const faceMat = (F, extra = {}) => phys(Object.assign({ map: F.a, normalMap: F.n, roughnessMap: F.o, metalnessMap: F.o, aoMap: F.o, aoMapIntensity: 0.9,
    roughness: 1, metalness: 1, normalScale: new THREE.Vector2(1, 1) }, extra));
  const mFront = faceMat(M.front, { anisotropy: 0.6, anisotropyRotation: Math.PI / 2 });   // шлифовка вдоль ширины — блик поперёк
  const mBack = faceMat(M.back);
  // блок кнопок: своя карта плотнее общей (полоса справа от экрана), иначе значки вплотную мылятся
  const CTL = D.back.ctl, mCtl = M.ctl ? faceMat(M.ctl) : mBack;
  const cUV = M.ctl ? (x, z) => [(CTL.x1 - x) / (CTL.x1 - CTL.x0), 1 - (z + hd) / H] : bUV;
  const mSide = M.side ? phys({ map: M.side.a, roughnessMap: M.side.o, aoMap: M.side.o, normalMap: M.side.n, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, metalness: 1, metalnessMap: M.side.o })
    : phys({ color: new THREE.Color(0.55, 0.56, 0.58), roughness: 1.6, metalness: 1, roughnessMap: M.tile.o });
  const mChrome = phys({ color: new THREE.Color(0.86, 0.86, 0.87), roughness: 1.0, metalness: 0.95, roughnessMap: M.tile.o, normalMap: M.tile.n, normalScale: new THREE.Vector2(0.3, 0.3) });
  const mSatin = phys({ color: new THREE.Color(0.72, 0.72, 0.73), roughness: 1.7, metalness: 0.9, roughnessMap: M.tile.o, normalMap: M.tile.n, normalScale: new THREE.Vector2(0.4, 0.4) });
  const mDark = phys({ color: 0x030303, roughness: 0.9, metalness: 0 });
  const mBlack = phys({ color: new THREE.Color(0.012, 0.012, 0.014), roughness: 0.62, metalness: 0 });
  const mScreen = phys({ color: new THREE.Color(0.0018, 0.0020, 0.0024), roughness: 0.8, metalness: 0, specularIntensity: 0.08, emissive: new THREE.Color(0x000000) });
  const mGlass = phys({ map: M.back.a, normalMap: M.back.n, roughnessMap: M.back.o, roughness: 1, metalness: 0, color: new THREE.Color(0.42, 0.42, 0.42),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

  // ---------- сборка ----------
  let tris = 0, meshes = 0;
  const mesh = (geo, mat, name, cast = true, parent = group) => {
    const m = new THREE.Mesh(geo, mat); if (name) m.name = name; m.castShadow = cast; m.receiveShadow = true;
    parent.add(m); tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; meshes++; disposables.push(geo); return m;
  };
  const q4 = (pts, n, uvs) => { // прямоугольник по четырём углам (два треугольника), нормаль n
    const g = new THREE.BufferGeometry(), pos = [], nor = [], uv = [];
    pts.forEach((p, i) => { pos.push(...p); nor.push(...n); uv.push(...(uvs ? uvs[i] : [i % 2, i < 2 ? 1 : 0])); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    g.setIndex(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]); return g;
  };
  const lathe = (pts, y0, cx, cz, down) => { // тело вращения вокруг вертикали; pts — [радиус, высота] в мм, растёт вверх (или вниз от y0)
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0] * MM, p[1] * MM)), LSEG);
    if (down) g.rotateX(Math.PI);
    // лицевая сторона — наружу (от корпуса): если нормали смотрят внутрь, перевернуть обход и нормали
    const nor = g.attributes.normal, idx = g.index.array; let sy = 0;
    for (let i = 0; i < nor.count; i++) sy += nor.getY(i);
    if (sy * (down ? -1 : 1) < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
    }
    g.translate(cx, y0, cz); return g;
  };

  // корпус: задняя оболочка (скругление — проекция фото зада), пояс (полоса по периметру), передняя фаска (полированная)
  const fr = D.fillet, backProf = [], frontProf = [];
  for (let k = 0; k <= 8; k++) { const th = (k / 8) * Math.PI / 2; backProf.push([fr * (1 - Math.sin(th)), fr * (1 - Math.cos(th))]); }
  backProf[backProf.length - 1][0] = 0.00008; backProf.push([0.00008, D.bandLo - 0.0001], [0.00014, D.bandLo]);
  for (let k = 0; k <= 8; k++) { const th = (k / 8) * Math.PI / 2; frontProf.push([fr * (1 - Math.cos(th)), T - fr + fr * Math.sin(th)]); }
  frontProf.unshift([0.00014, D.bandHi], [0.00004, D.bandHi + 0.0001]);
  const S = D.back.screen, F = D.front;
  mesh(mergeGeos(THREE, [
    capGeo(THREE, { hw: hw - fr, hd: hd - fr, r: R - fr, y: 0, up: false, seg: SEG, uv: bUV,
      holes: [{ x0: S.x1, z0: S.z0, x1: S.x0, z1: S.z1, r: 0.0005 }] }),
    sideGeo(THREE, { hw, hd, r: R, profile: backProf, seg: SEG, uvf: (x, z) => bUV(x, z) }),
  ]), mBack, 'back_shell');
  mesh(sideGeo(THREE, { hw, hd, r: R, seg: SEG, perim: [D.bandLo, D.bandHi], profile: [[0.00014, D.bandLo], [0, D.bandLo + 0.00015], [0, D.bandHi - 0.00015], [0.00014, D.bandHi]] }), mSide, 'band');
  mesh(sideGeo(THREE, { hw, hd, r: R, seg: SEG, profile: frontProf, uvf: (x, z) => fUV(x, z) }), mFront, 'front_bevel');   // скругление переда — то же фото (проекция спереди)
  mesh(capGeo(THREE, { hw: hw - fr, hd: hd - fr, r: R - fr, y: T, up: true, seg: SEG, uv: fUV,
    holes: [{ x0: F.lens.x - F.lens.r, z0: F.lens.z - F.lens.r, x1: F.lens.x + F.lens.r, z1: F.lens.z + F.lens.r, r: F.lens.r },
      { x0: F.flash.x - F.flash.hw, z0: F.flash.z - F.flash.hd, x1: F.flash.x + F.flash.hw, z1: F.flash.z + F.flash.hd, r: F.flash.r }] }), mFront, 'front_plate');

  // блок объектива (убран, шторки закрыты): тело вращения по радиусам колец с фото GEN22 — внешнее хромированное кольцо,
  // канавка, две ступени тубуса, чёрное кольцо и шторки. В режиме фото-карт одето в то же фото переда (проекция спереди):
  // шлифовка колец, потёртости и пыль в канавках — настоящие. Без карт — простые материалы.
  {
    const lx = F.lens.x, lz = F.lens.z;
    const prof = [[20.25, -0.3], [20.2, 0.8], [19.9, 1.5], [19.2, 2.1], [17.8, 2.5], [17.0, 2.5], [16.8, 2.2], [16.7, 0.6],     // внешнее кольцо
      [15.35, 0.6], [15.25, 1.9], [15.0, 2.1], [13.0, 2.1], [12.85, 1.9], [12.8, 1.2],                                       // канавка и первая ступень
      [12.7, 1.2], [12.6, 1.7], [12.3, 1.9], [10.3, 1.9], [10.1, 1.7], [10.0, 0.9],                                           // вторая ступень
      [7.8, 0.9], [7.7, 0.7], [0.0, 0.7]];                                                                                    // чёрное кольцо и шторки
    const g = lathe(prof, T, lx, lz);
    if (o.pbr) {
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) { const t = fUV(pos.getX(i), pos.getZ(i)); uv.setXY(i, t[0], t[1]); }
      mesh(g, faceMat(M.front), 'lens_unit');
    } else {
      mesh(g, mChrome, 'lens_unit');
      const LC = drawLensCover(), cover = new THREE.CircleGeometry(10.0 * MM, LSEG); cover.rotateX(-Math.PI / 2); cover.translate(lx, T + 0.00092, lz);
      mesh(cover, phys({ map: canvasTex(LC.A, true), roughnessMap: canvasTex(LC.O, false), roughness: 1, metalness: 0 }), 'lens_cover', false);
    }
  }
  { // вспышка: утопленное окно с рассеивателем (в режиме фото-карт — фото рассеивателя); лампа подсветки — маленькая линза
    const fl = F.flash, x0 = fl.x - fl.hw, x1 = fl.x + fl.hw, z0 = fl.z - fl.hd, z1 = fl.z + fl.hd, y = T - 0.0005;
    let mFlash;
    if (o.pbr) mFlash = phys({ map: M.front.a, normalMap: M.front.n, roughnessMap: M.front.o, roughness: 1, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.12 });
    else { const FL = drawFlash(); mFlash = phys({ map: canvasTex(FL.A, true), normalMap: canvasTex(FL.N, false), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }); }
    mesh(q4([[x0, y, z0], [x1, y, z0], [x0, y, z1], [x1, y, z1]], [0, 1, 0], o.pbr ? [fUV(x0, z0), fUV(x1, z0), fUV(x0, z1), fUV(x1, z1)] : null), mFlash, 'flash', false);
    mesh(sideGeo(THREE, { hw: fl.hw, hd: fl.hd, r: fl.r, cx: fl.x, cz: fl.z, seg: 8, inward: true, profile: [[0, y], [0, T]] }), mDark, 'flash_well', false);
    const rc = 2.3 * MM, br = 1.55 * MM, th = Math.asin(br / rc), dome = new THREE.SphereGeometry(rc, 28, 8, 0, Math.PI * 2, 0, th); dome.translate(0, -rc * Math.cos(th), 0); dome.translate(F.lamp.x, T - 0.00005, F.lamp.z);
    mesh(dome, phys({ color: new THREE.Color(0.20, 0.13, 0.05), roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.55 }), 'af_lamp', false);
  }

  // экран с глубиной (как у телефона 48): матрица на 0,7 мм внутри, стекло — отдельный меш с бликами и царапинами
  const SCREEN_DEPTH = 0.0007;
  {
    const quad = (y) => { const g = q4([[S.x0, y, S.z0], [S.x1, y, S.z0], [S.x0, y, S.z1], [S.x1, y, S.z1]], [0, -1, 0], [bUV(S.x0, S.z0), bUV(S.x1, S.z0), bUV(S.x0, S.z1), bUV(S.x1, S.z1)]);
      g.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2)); return g; };
    mesh(quad(SCREEN_DEPTH), mScreen, 'screen', false);
    const glass = mesh(quad(0), mGlass, 'screen_glass', false); glass.raycast = () => {}; glass.renderOrder = 2; glass.receiveShadow = false;
    mesh(sideGeo(THREE, { hw: (S.x0 - S.x1) / 2, hd: (S.z1 - S.z0) / 2, r: 0.0005, cx: (S.x0 + S.x1) / 2, cz: (S.z0 + S.z1) / 2, seg: 3, inward: true, profile: [[0, 0], [0, SCREEN_DEPTH]] }), mDark, 'screen_well', false);
  }

  // ---------- кнопки ----------
  // Каждая нажимаемая деталь — группа с центром в своей точке опоры; keys: имя → { obj, как двигать }.
  const keys = {}, B = D.back;
  const keyGroup = (name, x, y, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); group.add(g); return g; };
  const gapUnder = (hwk, hdk, r, x, z, name) => mesh(chipGeo(THREE, { hw: hwk + 0.00028, hd: hdk + 0.00028, r: r + 0.00028, cx: x, cz: z, y0: 0, h: 0.000015, bevel: 0.000005, up: false, seg: KSEG }), mDark, name, false);
  // круглые кнопки задней стенки: просмотр, меню, «домой»
  for (const [name, P2] of [['btn_play', B.play], ['btn_menu', B.menu], ['btn_home', B.home]]) {
    gapUnder(0.0026, 0.0026, 0.0026, P2.x, P2.z, name + '_gap');
    const g = keyGroup(name, P2.x, 0, P2.z);
    mesh(chipGeo(THREE, { hw: 0.0026, hd: 0.0026, r: 0.0026, y0: 0, h: 0.00055, bevel: 0.00022, up: false, seg: KSEG, uv: (x, z) => cUV(x + P2.x, z + P2.z) }), mCtl, name + '_cap', true, g);
    keys[name] = { obj: g, axis: [0, 1, 0], travel: 0.00035 };
  }
  { // круговая кнопка: кольцо качается в четыре стороны, в середине — отдельная кнопка
    const P2 = B.pad; gapUnder(0.0097, 0.0097, 0.0097, P2.x, P2.z, 'pad_gap');
    const ring = keyGroup('pad_ring', P2.x, 0, P2.z);
    const rg = lathe([[4.25, 0.0], [4.3, 0.55], [4.6, 0.8], [5.2, 0.9], [8.6, 0.9], [9.2, 0.75], [9.5, 0.4], [9.5, 0.0]], 0, 0, 0, true);
    { const pos = rg.attributes.position, uv = rg.attributes.uv; for (let i = 0; i < pos.count; i++) { const t = cUV(pos.getX(i) + P2.x, pos.getZ(i) + P2.z); uv.setXY(i, t[0], t[1]); } }
    mesh(rg, mCtl, 'pad_ring_cap', true, ring);
    const dirs = { btn_up: ['x', 1], btn_down: ['x', -1], btn_left: ['z', 1], btn_right: ['z', -1] };
    for (const n in dirs) keys[n] = { obj: ring, tilt: dirs[n], angle: 0.075, sink: 0.00012 };
    ring.userData.keyFn = (p) => (Math.abs(p.x) > Math.abs(p.z) ? (p.x > 0 ? 'btn_left' : 'btn_right') : (p.z < 0 ? 'btn_up' : 'btn_down'));
    const ok = keyGroup('btn_ok', P2.x, 0, P2.z);
    mesh(chipGeo(THREE, { hw: 0.0039, hd: 0.0039, r: 0.0039, y0: 0, h: 0.0011, bevel: 0.0003, up: false, seg: KSEG, uv: (x, z) => cUV(x + P2.x, z + P2.z) }), mCtl, 'btn_ok_cap', true, ok);
    keys.btn_ok = { obj: ok, axis: [0, 1, 0], travel: 0.00035 };
  }
  { // качелька зума: W — левый конец (если смотреть на экран), T — правый
    const P2 = B.zoom; gapUnder(0.0075, 0.003, 0.002, P2.x, P2.z, 'zoom_gap');
    const g = keyGroup('zoom_rocker', P2.x, 0, P2.z);
    mesh(chipGeo(THREE, { hw: 0.0075, hd: 0.003, r: 0.002, y0: 0, h: 0.001, bevel: 0.0004, up: false, seg: KSEG, uv: (x, z) => cUV(x + P2.x, z + P2.z) }), mCtl, 'zoom_rocker_cap', true, g);
    keys.btn_zoom_w = { obj: g, tilt: ['z', 1], angle: 0.085, sink: 0.0001 }; keys.btn_zoom_t = { obj: g, tilt: ['z', -1], angle: 0.085, sink: 0.0001 };
    g.userData.keyFn = (p) => (p.x > 0 ? 'btn_zoom_w' : 'btn_zoom_t');
  }
  { // диск режимов: рифлёный бок, значки сверху (не нажимается)
    const P2 = B.dial;
    mesh(lathe([[6.5, 0.0], [6.5, 1.9], [6.2, 2.2]], 0, P2.x, P2.z, true), mSatin, 'mode_dial_side');
    const top = new THREE.CircleGeometry(6.2 * MM, LSEG); top.rotateX(Math.PI / 2); top.rotateY(Math.PI); top.translate(P2.x, -0.0022, P2.z);
    if (M.ctl) { const pos = top.attributes.position, uv = top.attributes.uv; for (let i = 0; i < pos.count; i++) { const t = cUV(pos.getX(i), pos.getZ(i)); uv.setXY(i, t[0], t[1]); }
      mesh(top, mCtl, 'mode_dial_top'); }   // верх диска — фото (круговая шлифовка) со значками из слоя надписей
    else mesh(top, phys({ map: canvasTex(drawDial(), true), roughness: 0.42, metalness: 0.9 }), 'mode_dial_top');
    const knurl = []; // насечка по боку — одним мешем
    for (let k = 0; k < 40; k++) { const g = new THREE.BoxGeometry(0.00045, 0.0015, 0.00035); g.translate(0, -0.00105, 0.0065); g.rotateY(k / 40 * Math.PI * 2); g.translate(P2.x, 0, P2.z); knurl.push(g); }
    mesh(mergeGeos(THREE, knurl), mSatin, 'mode_dial_knurl', false);
  }
  { // верхняя грань: спуск (большая хромированная кнопка в кольце) и питание
    const zT = -hd, yM = T / 2;
    const top = (x, r, h, bev, mat, name) => { const g = keyGroup(name, x, yM, zT);
      const c2 = chipGeo(THREE, { hw: r, hd: r, r, y0: 0, h, bevel: bev, seg: KSEG }); c2.rotateX(-Math.PI / 2); mesh(c2, mat, name + '_cap', true, g); return g; };
    { const base = chipGeo(THREE, { hw: 0.0068, hd: 0.0068, r: 0.0068, y0: 0, h: 0.0004, bevel: 0.00015, seg: KSEG }); base.rotateX(-Math.PI / 2); base.translate(D.top.shutter, yM, zT); mesh(base, mSatin, 'shutter_base'); }
    keys.btn_shutter = { obj: top(D.top.shutter, 0.0052, 0.0013, 0.0005, mChrome, 'btn_shutter'), axis: [0, 0, 1], travel: 0.0007 };
    { const well = chipGeo(THREE, { hw: 0.0031, hd: 0.0031, r: 0.0031, y0: 0, h: 0.00002, bevel: 0.000005, seg: KSEG }); well.rotateX(-Math.PI / 2); well.translate(D.top.power, yM, zT); mesh(well, mDark, 'power_gap', false); }
    keys.btn_power = { obj: top(D.top.power, 0.0026, 0.00035, 0.00015, mSatin, 'btn_power'), axis: [0, 0, 1], travel: 0.00025 };
  }
  { // нижняя грань: гнездо штатива и шов дверцы батареи и карты; сбоку — ушко для ремешка (ремешка нет)
    const zB = hd + 0.00002, yM = T / 2;
    const ring = new THREE.RingGeometry(0.0031, 0.0043, 40); ring.translate(D.bottom.tripod, yM, zB); mesh(ring, mSatin, 'tripod_ring', false);
    const hole = new THREE.CircleGeometry(0.0031, 40); hole.translate(D.bottom.tripod, yM, zB); mesh(hole, mDark, 'tripod_hole', false);
    const d0 = D.bottom.door;
    for (const [x, y, w2, h2] of [[(d0[0] + d0[1]) / 2, yM + 0.0062, d0[1] - d0[0], 0.00022], [(d0[0] + d0[1]) / 2, yM - 0.0062, d0[1] - d0[0], 0.00022], [d0[0], yM, 0.00022, 0.0124], [d0[1], yM, 0.00022, 0.0124]]) {
      const g = new THREE.PlaneGeometry(w2, h2); g.translate(x, y, zB); mesh(g, mDark, 'door_seam', false);
    }
    const lug = chipGeo(THREE, { hw: 0.0012, hd: 0.0034, r: 0.0011, h: 0.0009, bevel: 0.00035, seg: 8 }); lug.rotateZ(Math.PI / 2); lug.translate(-hw, T / 2, -0.012); mesh(lug, mChrome, 'strap_lug');
    const slot = new THREE.PlaneGeometry(0.0036, 0.0009); slot.rotateY(-Math.PI / 2); slot.rotateX(Math.PI / 2); slot.translate(-hw - 0.00092, T / 2, -0.012); mesh(slot, mDark, 'strap_slot', false);
  }

  // ---------- ярлык бюро на стороне объектива, слева от него (решение автора 27.11) ----------
  // Форма бюро как у ноутбука 47 и телефона 48, 38 × 21,7 мм. Бумага не плоская: правый верхний угол отошёл плавной дугой
  // (на 0,6 мм, без линии залома — решение автора 27.11), левый нижний чуть приподнят, по полю лёгкая волна; под бумагой — тень.
  const LAB = { w: D.label.x1 - D.label.x0, h: (D.label.x1 - D.label.x0) * 880 / 1540, x0: D.label.x0, z0: D.label.zc - (D.label.x1 - D.label.x0) * 880 / 1540 / 2 };
  const labLift = (u, v) => {   // u — слева направо, v — снизу вверх (1 — верх ярлыка)
    const t = (u - 0.779) / 0.221 + (v - 0.7125) / 0.2875 - 1, t2 = (0.14 - u) / 0.14 + (0.20 - v) / 0.20 - 1;
    const wave = 0.00005 * (0.5 + 0.5 * Math.sin(6.3 * u + 0.7) * Math.cos(4.1 * v + 1.3)) * Math.min(1, 6 * Math.min(u, 1 - u, v, 1 - v) + 0.25);
    return wave + (t > 0 ? D.label.lift * Math.pow(Math.min(t, 1), 1.5) : 0) + (t2 > 0 ? 0.00028 * Math.pow(Math.min(t2, 1), 1.6) : 0);
  };
  if (M.label) {
    const NU = 44, NV = 26, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const u = i / NU, v = 1 - j / NV;
      pos.push(LAB.x0 + u * LAB.w, T + 0.00007 + labLift(u, v), LAB.z0 + (1 - v) * LAB.h); uv.push(u, v);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    mesh(g, phys({ map: M.label.a, normalMap: M.label.n, normalScale: new THREE.Vector2(1.0, 1.0), roughnessMap: M.label.r, roughness: 1, metalness: 0 }), 'label_bureau_24', true);
    // изнанка: чистая бумага без печати — видна под отошедшим углом
    const gb = new THREE.BufferGeometry(), ib = [];
    for (let k = 0; k < idx.length; k += 3) ib.push(idx[k], idx[k + 2], idx[k + 1]);
    gb.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gb.setIndex(ib); gb.computeVertexNormals();
    const lb = mesh(gb, phys({ color: 0xcfc9b8, roughness: 0.95, metalness: 0 }), 'label_back', false); lb.raycast = () => {};
    // тень под бумагой: линия прилегания по контуру и мягкая тень там, где бумага приподнята (по той же функции подъёма)
    const mg = 1.6 * MM, fw = LAB.w + 2 * mg, fh = LAB.h + 2 * mg, cw = 380, ch = Math.round(cw * fh / fw);
    const cv = mkCanvas(cw, ch), c2 = cv.getContext('2d'), img = c2.createImageData(cw, ch), cl = (t) => Math.min(1, Math.max(0, t));
    for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
      const u = ((px + 0.5) / cw * fw - mg) / LAB.w, v = 1 - ((py + 0.5) / ch * fh - mg) / LAB.h;
      const out = Math.hypot(Math.max(0, -u, u - 1) * LAB.w, Math.max(0, -v, v - 1) * LAB.h);
      const lf = labLift(cl(u - 0.03), cl(v - 0.05)) - 0.00005;
      let a = Math.min(0.6, Math.max(0, lf) / (0.8 * MM)) * cl(1 - out / (Math.max(0, lf) * 1.1 + 1e-6));
      a = Math.max(a, 0.30 * cl(1 - out / 0.00028));
      const k = (py * cw + px) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; img.data[k + 3] = a * 255;
    }
    c2.putImageData(img, 0, 0);
    const st = new THREE.CanvasTexture(cv); disposables.push(st);
    const y = T + 0.00003, sx0 = LAB.x0 - mg, sx1 = LAB.x0 + LAB.w + mg, sz0 = LAB.z0 - mg, sz1 = LAB.z0 + LAB.h + mg;
    const ms = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, toneMapped: false }); disposables.push(ms);
    const sh = mesh(q4([[sx0, y, sz0], [sx1, y, sz0], [sx0, y, sz1], [sx1, y, sz1]], [0, 1, 0]), ms, 'label_shadow', false); sh.receiveShadow = false; sh.raycast = () => {};
  }

  // ---------- нажатие ----------
  // setKeyPressed(name, true|false) — держать и отпустить; pressKey(name, ms) — щелчок. Быстрый щелчок доходит до дна.
  // Модуль только двигает деталь: что делает кнопка в игре, решает игра.
  const kst = {}; for (const n in keys) kst[n] = { t: 0, want: false, hold: 0 };
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const raf = typeof requestAnimationFrame !== 'undefined' ? (f) => requestAnimationFrame(f) : null;
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (t) => t * t * (3 - 2 * t);
  const home0 = new Map(); for (const n in keys) if (!home0.has(keys[n].obj)) home0.set(keys[n].obj, keys[n].obj.position.clone());
  const applyKeys = () => {
    for (const [obj, p0] of home0) { obj.position.copy(p0); obj.rotation.set(0, 0, 0); }
    for (const n in keys) {
      const k = keys[n], e = ease(kst[n].t); if (!e) continue;
      if (k.axis) { k.obj.position.x += k.axis[0] * k.travel * e; k.obj.position.y += k.axis[1] * k.travel * e; k.obj.position.z += k.axis[2] * k.travel * e; }
      else { k.obj.rotation[k.tilt[0]] += k.tilt[1] * k.angle * e; k.obj.position.y = Math.max(k.obj.position.y, home0.get(k.obj).y + k.sink * e); }
    }
  };
  let keyAnim = false, keyLast = 0;
  function keyStep() {
    const t = nowMs(), dt = Math.min(50, Math.max(1, t - keyLast)); keyLast = t; let busy = false;
    for (const n in kst) {
      const k = kst[n], down = k.want || t < k.hold, target = down ? 1 : 0, speed = calm ? 1 : (down ? dt / 55 : dt / 100);
      if (k.t !== target) { k.t = target > k.t ? Math.min(1, k.t + speed) : Math.max(0, k.t - speed); busy = true; }
      else if (down && !k.want) busy = true;
    }
    applyKeys(); if (o.onChange) o.onChange();
    if (busy && raf) raf(keyStep); else keyAnim = false;
  }
  const kick = () => { if (!raf) { for (const n in kst) kst[n].t = kst[n].want ? 1 : 0; applyKeys(); if (o.onChange) o.onChange(); return; } if (!keyAnim) { keyAnim = true; keyLast = nowMs(); raf(keyStep); } };
  const setKeyPressed = (name, down) => { const k = kst[name]; if (!k) return false; k.want = !!down; if (down) k.hold = nowMs() + 90; kick(); return true; };
  const pressKey = (name, ms = 120) => { const k = kst[name]; if (!k) return false; k.want = false; k.hold = nowMs() + Math.max(90, ms); kick(); return true; };
  // какая кнопка под лучом: hit — первый результат Raycaster.intersectObject(камера, true)
  const keyFromHit = (hit) => {
    for (let ob = hit && hit.object; ob && ob !== root; ob = ob.parent) {
      if (ob.userData.keyFn) return ob.userData.keyFn(ob.worldToLocal(hit.point.clone()));
      if (keys[ob.name]) return ob.name;
    }
    return null;
  };

  // ---------- экран: картинка (светится сама) ----------
  const setScreenTexture = (tex) => {
    if (tex) { tex.channel = 1; tex.colorSpace = THREE.SRGBColorSpace; mScreen.emissiveMap = tex; mScreen.emissive.setRGB(1, 1, 1); mScreen.emissiveIntensity = 1; }
    else { mScreen.emissiveMap = null; mScreen.emissive.setRGB(0, 0, 0); }
    mScreen.needsUpdate = true; if (o.onChange) o.onChange();
  };

  // ---------- итог ----------
  const texMB = () => { let b = 0; const seen = new Set();
    for (const t of disposables) if (t.isTexture && t.image && !seen.has(t)) { seen.add(t); b += (t.image.width || 0) * (t.image.height || 0) * 4 * 4 / 3; }
    return Math.round(b / 1048576 * 10) / 10; };
  const stats = { triangles: Math.round(tris), meshes, mapSet, get texMB() { return texMB(); } };
  const finish = () => { if (o.onChange) o.onChange(); return true; };
  root.visible = !o.pbr;
  const ready = Promise.all(loads).then((r) => { root.userData.mapsOk = r.every(Boolean); root.visible = true; return finish(); });
  const loadMapSet = (set) => {
    if (!o.pbr || set === mapSet) return Promise.resolve(true);
    mapSet = set; stats.mapSet = set; root.userData.mapSet = set;
    return Promise.all(texReg.map((e) => loadInto(e.t, packUrl(e.file, set)))).then(finish);
  };
  Object.assign(root.userData, { ready, setScreenTexture, loadMapSet, mapSet, stats, dims: D, drawBackLabels,
    keys: Object.keys(keys), setKeyPressed, pressKey, keyFromHit, keyDepth: (n) => (kst[n] ? kst[n].t : 0),
    dispose() { for (const d of disposables) d.dispose(); } });
  return root;
}
