// recorder462.js — проигрыватель микрокассет бюро с кассетой «06.10.08» (материал дела L462), построенный кодом three.js.
// Без файлов-моделей: форма — геометрией, поверхности — фото-карты PBR (или рисунок кодом, если карт нет).
// Класс вещи: карманный микрокассетный диктофон 2000-х (по размерам и раскладке — Sony M-470 / M-679V), без марок.
// По канону (01 §11 п.17, A-272) это имущество бюро, а не вещь Адама: вещдок — кассета в окне, на ней дата его рукой.
// Модуль не зависит от страницы: buildRecorder462(THREE, opts) -> THREE.Group.
//
// Оси вещи: X — вправо, если смотреть на окно с кассетой; Y — вверх; +Z — перед (окно), −Z — спинка. Центр — в середине корпуса.
// Узлы по именам: door, window_glass (в выбор лучом не попадает), cassette_*, reel_supply / reel_takeup (катушки, вращаются),
//   counter (счётчик ленты), grille (решётка динамика с настоящими отверстиями), volume_wheel, label_inv (наклейка бюро на спинке);
//   нажимаемые — группы на правой грани: btn_rec, btn_play, btn_stop, wind_slider (ползунок перемотки);
//   wind_zone — невидимая площадка над прорезью ползунка: нажатие на пустое место у стрелки = перемотка в эту сторону.
//
// opts: pbr (true), pbrBase, mapSet: 'full' | 'low', lowPower, textureSize, anisotropy, onChange;
//   counter — false: без счётчика ленты; label — false: без наклейки бюро.
//   glassKeys — false: прозрачные клавиши без преломления (так же делается сам на слабом устройстве).
// root.userData: ready (Promise), loadMapSet(set), stats, dims, dispose(),
//   keys — btn_rec, btn_play, btn_stop, btn_ff, btn_rew;
//   setKeyPressed(name, down), pressKey(name, ms), setKeyLatched(name, on) — клавиша остаётся утопленной (пуск), keyDepth(name),
//   keyFromHit(hit) — имя клавиши под лучом (у прорези ползунка — по месту попадания: к верху вещи — вперёд, к низу — назад),
//   sliderFromHit(hit) — луч попал в сам ползунок (его берут и ведут), setSlider(v) — поставить ползунок: −1 (назад) … 0 … +1 (вперёд);
//     0 — отпустить, он сам вернётся в середину,
//   setTapeTime(sec) — место ленты от начала кассеты: углы катушек, толщина намотки и счётчик считаются из него,
//   setCounterZero(sec) — где счётчик обнулён, counterValue() — число на счётчике,
//   setLamp(on) — красная лампочка на переде (в игре — пока лента идёт), lampOn().

const MM = 0.001;
export const RECORDER462 = {
  W: 60 * MM, H: 110 * MM, T: 22.5 * MM, R: 7 * MM, fillet: 2.6 * MM, seam: 10 * MM,
  door: { x0: -28 * MM, x1: 28 * MM, z0: -53 * MM, z1: 6 * MM, r: 4.5 * MM, h: 0.6 * MM },
  win: { x0: -23 * MM, x1: 1 * MM, z0: -46 * MM, z1: -7 * MM, r: 3 * MM, bezel: 0.9 * MM },
  arrow: { x: 13 * MM, z: -20 * MM },
  counter: { x0: 8 * MM, x1: 19 * MM, z0: -41 * MM, z1: -35.5 * MM, reset: { x: 22.6 * MM, z: -38.25 * MM } },
  grille: { x0: -23 * MM, x1: 7 * MM, z0: 13 * MM, z1: 49 * MM, r: 2 * MM, hole: 0.6 * MM, pitch: 2.1 * MM, inset: 0.18 * MM },
  led: { x: 20.5 * MM, z: 11 * MM },
  keys: { y: 12.5 * MM, pod: [-44 * MM, 20 * MM], rec: -37 * MM, play: -24.5 * MM, stop: -11 * MM, slider: 7.5 * MM, post: -49 * MM },
  left: { wheel: { z: -22 * MM, r: 8 * MM, out: 1.3 * MM }, speed: 3 * MM },
  top: { mic: -13 * MM, ear: 8 * MM, pause: 19 * MM },
  back: { lid: { x0: -26 * MM, x1: 26 * MM, z0: 4 * MM, z1: 51 * MM }, label: { x0: -21 * MM, x1: 21 * MM, zc: -30 * MM, lift: 0.5 * MM } },
  cassette: { x0: -27 * MM, x1: 6 * MM, zc: -26.5 * MM, len: 50 * MM, hubs: 11.725 * MM, hubX: -10.52 * MM, strip: [-26 * MM, -17.3 * MM] },   // втулки — по фото GEN24 (замер tools/make_parts.py)
  hubR: 6.2 * MM,   // радиус вращающейся части втулки на фото кассеты
  tape: { r0: 5.6 * MM, r1: 9.6 * MM, length: 43, speed: 0.024, total: 1800 },   // намотка, длина ленты (м), скорость (м/с), секунд на сторону
};
const TILE = 0.030;

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

// ---------- геометрия (те же генераторы, что у camera24.js) ----------
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
  const { hw, hd, r, cx = 0, cz = 0, seg = 10, inward = false, uvf = null, perim = null } = p;
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
// плоская крышка (с отверстиями), нормаль вверх или вниз; holes: прямоугольники { x0, z0, x1, z1, r } или круги { cx, cz, r }
function capGeo(THREE, p) {
  const { hw, hd, r, cx = 0, cz = 0, y, up = true, holes = [], seg = 10 } = p;
  const uvf = p.uv || ((x, z) => [x / TILE, z / TILE]);
  const shape = rrPath(new THREE.Shape(), cx - hw, cz - hd, cx + hw, cz + hd, r);
  for (const h of holes) {
    if (h.cx !== undefined) { const pt = new THREE.Path(); pt.absarc(h.cx, h.cz, h.r, 0, Math.PI * 2, true); shape.holes.push(pt); }
    else shape.holes.push(rrPath(new THREE.Path(), h.x0, h.z0, h.x1, h.z1, h.r || 0));
  }
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
function bevelProf(y0, h, bevel, up = true) {
  const NB = 5, arc = [];
  for (let k = 0; k <= NB; k++) { const a = (k / NB) * Math.PI / 2; arc.push([bevel * (1 - Math.cos(a)), bevel * Math.sin(a)]); }
  return up ? [[0, y0], ...arc.map(([i, d]) => [i, y0 + h - bevel + d])]
    : [...arc.map(([i, d]) => [i, y0 - h + bevel - d]).reverse(), [0, y0]];
}
// скруглённая «плитка» (клавиша, накладка): бок + верх; растёт от y0 на h вверх (up) или вниз
function chipGeo(THREE, p) {
  const { hw, hd, r, cx = 0, cz = 0, y0 = 0, h, bevel, up = true, seg = 6, uv = null, holes = [] } = p;
  const s = up ? 1 : -1;
  const prof = bevelProf(y0, h, bevel, up);
  const uvf = uv ? (x, z) => uv(x, z) : null;
  return mergeGeos(THREE, [
    sideGeo(THREE, { hw, hd, r, cx, cz, profile: prof, seg, uvf }),
    capGeo(THREE, { hw: hw - bevel, hd: hd - bevel, r: Math.max(r - bevel, 1e-5), cx, cz, y: y0 + s * h, up, seg, uv: uv || undefined, holes }),
  ]);
}

// =====================================================================================
export function buildRecorder462(THREE, opts = {}) {
  const D = RECORDER462, { W, H, T, R } = D;
  const rel = (p) => { try { return new URL(p, import.meta.url).href; } catch (e) { return p; } };
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const smallWin = typeof innerWidth !== 'undefined' && Math.min(innerWidth, innerHeight) < 700;
  const o = Object.assign({ pbr: true, pbrBase: rel('./textures/pbr/'), textureSize: 2048, anisotropy: 8, lowPower: coarse || smallWin }, opts);
  let mapSet = o.mapSet || (o.lowPower ? 'low' : 'full');
  const SEG = o.lowPower ? 16 : 24, KSEG = o.lowPower ? 10 : 16, LSEG = o.lowPower ? 40 : 72, HSEG = o.lowPower ? 3 : 5;
  const rng = rngFactory(4620);
  const disposables = [];
  const root = new THREE.Group(); root.name = 'recorder462';
  // внутри вещь «лежит на спинке»: X — вправо (вид спереди), Y — к зрителю (перед), верх вещи на −Z, y = 0 — спинка
  const group = new THREE.Group(); group.name = 'recorder462_body'; group.rotation.x = Math.PI / 2; group.position.z = -T / 2; root.add(group);
  const hw = W / 2, hd = H / 2, fr = D.fillet;
  const fUV = (x, z) => [(x + hw) / W, 1 - (z + hd) / H];   // перед: как видит зритель окна
  const bUV = (x, z) => [(hw - x) / W, 1 - (z + hd) / H];   // спинка: как видит зритель спинки

  // ---------- рисунок кодом: образец для генератора, запасной режим, слой печати ----------
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
  // Печать на переде: стрелка хода ленты у окна. Отдельным прозрачным слоем: tools/make_maps.py кладёт его на фото резким.
  function drawFrontPrint(c, s) {
    const mx = (x) => (x / MM + 30) * s, mz = (z) => (z / MM + 55) * s, A = D.arrow;
    c.strokeStyle = '#5b5346'; c.lineWidth = 0.32 * s; c.lineJoin = 'round';
    const x = mx(A.x), y = mz(A.z);
    c.beginPath(); c.moveTo(x, y - 4.2 * s); c.lineTo(x + 3.1 * s, y + 3.6 * s); c.lineTo(x - 3.1 * s, y + 3.6 * s); c.closePath(); c.stroke();
  }
  function drawFront(size) {
    const s = size / 60, w = size, h = Math.round(110 * s);
    const A = mkCanvas(w, h), a = A.getContext('2d'), O = mkCanvas(w, h), q = O.getContext('2d'), Hc = mkCanvas(w, h), hh = Hc.getContext('2d');
    const mx = (x) => (x / MM + 30) * s, mz = (z) => (z / MM + 55) * s;
    a.fillStyle = '#8c7a62'; a.fillRect(0, 0, w, h); q.fillStyle = orm(0.42, 0.55); q.fillRect(0, 0, w, h); hh.fillStyle = '#808080'; hh.fillRect(0, 0, w, h);
    // дверца чуть светлее корпуса — генератору видно, где её край
    const dr = D.door; rrect(a, mx(dr.x0), mz(dr.z0), mx(dr.x1), mz(dr.z1), dr.r / MM * s); a.fillStyle = '#b6a48a'; a.fill();
    for (let i = 0; i < 5000; i++) { const x = rng() * w, y = rng() * h, v = rng() < 0.5; a.fillStyle = `rgba(${v ? '255,250,235' : '60,50,35'},${0.04 + rng() * 0.07})`; a.fillRect(x, y, 1.5, 1.5); }
    const Lc = mkCanvas(w, h); drawFrontPrint(Lc.getContext('2d'), s); if (o.labels !== false) a.drawImage(Lc, 0, 0);
    return { A, O, H: Hc, L: Lc, N: heightToNormal(Hc, 1.4), w, h };
  }
  function drawBack(size) {
    const s = size / 60, w = size, h = Math.round(110 * s);
    const A = mkCanvas(w, h), a = A.getContext('2d'), O = mkCanvas(w, h), q = O.getContext('2d'), Hc = mkCanvas(w, h), hh = Hc.getContext('2d');
    const mx = (x) => (30 - x / MM) * s, mz = (z) => (z / MM + 55) * s, L = D.back.lid;
    a.fillStyle = '#2c2e31'; a.fillRect(0, 0, w, h); q.fillStyle = orm(0.5, 0); q.fillRect(0, 0, w, h); hh.fillStyle = '#808080'; hh.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const x = rng() * w, y = rng() * h, v = rng() < 0.5; a.fillStyle = `rgba(${v ? '255,255,255' : '0,0,0'},${0.03 + rng() * 0.05})`; a.fillRect(x, y, 1.5, 1.5); }
    // крышка батарей: шов, пять рёбер под палец и стрелка сдвига
    const x0 = mx(L.x1), x1 = mx(L.x0), z0 = mz(L.z0), z1 = mz(L.z1);
    for (const c2 of [a, hh]) { c2.strokeStyle = c2 === a ? '#0f1011' : '#303030'; c2.lineWidth = 0.35 * s; rrect(c2, x0, z0, x1, z1, 2.2 * s); c2.stroke(); }
    for (let k = 0; k < 5; k++) { const y = z0 + (6 + k * 1.8) * s; a.fillStyle = '#17181a'; a.fillRect(mx(9 * MM), y, 18 * s, 0.6 * s); hh.fillStyle = '#c8c8c8'; hh.fillRect(mx(9 * MM), y - 0.5 * s, 18 * s, 0.5 * s); hh.fillStyle = '#383838'; hh.fillRect(mx(9 * MM), y, 18 * s, 0.6 * s); }
    { const x = w / 2, y = z0 + 19 * s; a.fillStyle = '#17181a'; a.beginPath(); a.moveTo(x, y + 3 * s); a.lineTo(x - 2.4 * s, y); a.lineTo(x + 2.4 * s, y); a.closePath(); a.fill(); }
    return { A, O, H: Hc, N: heightToNormal(Hc, 1.6), w, h };
  }
  function drawTile() {   // мелкое зерно литого пластика: шероховатость и высота
    const n = 512, O = mkCanvas(n, n), q = O.getContext('2d'), Hc = mkCanvas(n, n), hh = Hc.getContext('2d');
    q.fillStyle = orm(0.5, 0); q.fillRect(0, 0, n, n); hh.fillStyle = '#808080'; hh.fillRect(0, 0, n, n);
    for (let i = 0; i < 9000; i++) { const x = rng() * n, y = rng() * n, v = rng(); q.fillStyle = `rgba(255,${Math.round(100 + v * 90)},0,0.35)`; q.fillRect(x, y, 2, 2); hh.fillStyle = `rgba(${v < 0.5 ? '255,255,255' : '0,0,0'},0.22)`; hh.beginPath(); hh.arc(x, y, 1.3, 0, 7); hh.fill(); }
    return { O, N: heightToNormal(Hc, 1.1) };
  }
  // значки клавиш: запись, пуск, стоп, перемотка вперёд и назад — контуром, без слов
  function drawIcons() {
    const n = 128, A = mkCanvas(n * 5, n), a = A.getContext('2d'); a.clearRect(0, 0, n * 5, n);
    const ink = 'rgba(245,245,240,0.92)'; a.fillStyle = ink; a.strokeStyle = ink; a.lineWidth = 9; a.lineJoin = 'round';
    a.beginPath(); a.arc(n / 2, n / 2, 30, 0, 7); a.fill();                                                        // 0 — запись
    a.beginPath(); a.moveTo(n + 38, 30); a.lineTo(n + 100, 64); a.lineTo(n + 38, 98); a.closePath(); a.stroke();    // 1 — пуск
    a.strokeRect(2 * n + 36, 36, 56, 56);                                                                         // 2 — стоп
    for (const k of [0, 1]) { a.beginPath(); a.moveTo(3 * n + 22 + k * 44, 34); a.lineTo(3 * n + 62 + k * 44, 64); a.lineTo(3 * n + 22 + k * 44, 94); a.closePath(); a.fill(); }   // 3 — вперёд
    for (const k of [0, 1]) { a.beginPath(); a.moveTo(4 * n + 106 - k * 44, 34); a.lineTo(4 * n + 66 - k * 44, 64); a.lineTo(4 * n + 106 - k * 44, 94); a.closePath(); a.fill(); } // 4 — назад
    return A;
  }
  // Кассета лицом к зрителю, как она стоит в окне: образец раскладки для генератора и запасной рисунок.
  // 33 × 50 мм; слева — бумажная полоска (дата кладётся вёрсткой), две втулки с намоткой, справа — кромка с лентой и прижимом.
  function drawCassette(size) {
    const s = size / 33, w = size, h = Math.round(50 * s), A = mkCanvas(w, h), a = A.getContext('2d'), C2 = D.cassette, T2 = D.tape;
    const mx = (x) => (x - C2.x0) / MM * s, mz = (z) => (z - (C2.zc - C2.len / 2)) / MM * s, disc = (x, z, r, col) => { a.fillStyle = col; a.beginPath(); a.arc(mx(x), mz(z), r / MM * s, 0, 7); a.fill(); };
    a.fillStyle = '#8a8a8a'; a.fillRect(0, 0, w, h);
    rrect(a, 0.2 * s, 0.2 * s, w - 0.2 * s, h - 0.2 * s, 2.2 * s); a.fillStyle = '#c4c6c2'; a.fill(); a.strokeStyle = '#7d7f7c'; a.lineWidth = 0.35 * s; a.stroke();
    rrect(a, 1.2 * s, 1.2 * s, w - 1.2 * s, h - 1.2 * s, 1.6 * s); a.strokeStyle = 'rgba(90,92,90,0.5)'; a.lineWidth = 0.2 * s; a.stroke();
    const p = 300 / T2.total, Aq2 = T2.r1 * T2.r1 - T2.r0 * T2.r0, rT = Math.sqrt(T2.r0 * T2.r0 + p * Aq2), rS = Math.sqrt(T2.r1 * T2.r1 - p * Aq2);
    // лента: от намоток к правой кромке, вдоль неё мимо прижима
    a.strokeStyle = '#3a2a22'; a.lineWidth = 0.25 * s; a.beginPath(); a.moveTo(mx(C2.hubX), mz(C2.zc - C2.hubs) - rS / MM * s); a.lineTo(w - 2.2 * s, 2.6 * s); a.lineTo(w - 2.2 * s, h - 2.6 * s); a.lineTo(mx(C2.hubX), mz(C2.zc + C2.hubs) + rT / MM * s); a.stroke();
    for (const z of [2.6, 47.4]) { a.fillStyle = '#dcdcd8'; a.beginPath(); a.arc(w - 2.6 * s, z * s, 1.3 * s, 0, 7); a.fill(); }
    a.fillStyle = '#9a6a3c'; a.fillRect(w - 3.6 * s, 22.5 * s, 1.6 * s, 5 * s);
    for (const [dz, r] of [[-C2.hubs, rS], [C2.hubs, rT]]) {
      const z = C2.zc + dz; disc(C2.hubX, z, r, '#34261f'); disc(C2.hubX, z, T2.r0, '#e4e4df'); disc(C2.hubX, z, 3.3 * MM, '#2b2b2d');
      a.fillStyle = '#e4e4df'; for (let k = 0; k < 6; k++) { a.save(); a.translate(mx(C2.hubX), mz(z)); a.rotate(k / 6 * Math.PI * 2 + (dz > 0 ? 0.4 : 0)); a.fillRect(-0.45 * s, 2.3 * s, 0.9 * s, 1.1 * s); a.restore(); }
      disc(C2.hubX, z, 1.7 * MM, '#6d6f72');
    }
    // бумажная полоска вдоль левой кромки — пустая
    a.fillStyle = '#e8e2d2'; a.fillRect(mx(C2.strip[0]), mz(C2.zc - 21 * MM), (C2.strip[1] - C2.strip[0]) / MM * s, 42 * s);
    for (const [x, z] of [[30.3, 13], [30.3, 37]]) { a.fillStyle = '#8c8e8b'; a.beginPath(); a.arc(x * s, z * s, 0.9 * s, 0, 7); a.fill(); }
    return A;
  }
  // Значки клавиш на правой грани (карта грани: слева — перед вещи, сверху — верх вещи). Отдельным слоем: make_maps.py кладёт их резкими.
  function drawRightPrint(c, s) {
    const K2 = D.keys, u = (y) => (T - y) / MM * s, v = (z) => (z / MM + 55) * s, ink = 'rgba(238,238,232,0.95)';
    c.fillStyle = ink; c.strokeStyle = ink; c.lineJoin = 'round'; c.lineWidth = 0.26 * s;
    if (o.recMark !== 'dot') { const x = u(K2.y), y = v(K2.rec);   // «в начало» (решение автора 27.11, RK-B): две стрелки к низу вещи и черта под ними; recMark: 'dot' — прежняя точка
      for (const k of [0, 1]) { c.beginPath(); c.moveTo(x - 1.05 * s, y - 1.75 * s + k * 1.25 * s); c.lineTo(x + 1.05 * s, y - 1.75 * s + k * 1.25 * s); c.lineTo(x, y - 0.55 * s + k * 1.25 * s); c.closePath(); c.fill(); }
      c.fillRect(x - 1.05 * s, y + 1.05 * s, 2.1 * s, 0.34 * s); }
    else { c.beginPath(); c.arc(u(K2.y), v(K2.rec), 0.95 * s, 0, 7); c.fill(); }
    { const x = u(K2.y), y = v(K2.play - 2.5 * MM); c.beginPath(); c.moveTo(x - 1.1 * s, y - 1.3 * s); c.lineTo(x + 1.4 * s, y); c.lineTo(x - 1.1 * s, y + 1.3 * s); c.closePath(); c.stroke(); }
    { const x = u(K2.y), y = v(K2.stop); c.strokeRect(x - 1.05 * s, y - 1.05 * s, 2.1 * s, 2.1 * s); }
    for (const [dz, dir] of [[-5.3, -1], [5.3, 1]]) for (const k of [0, 1]) { const x = u(K2.y + 4.9 * MM), y = v(K2.slider + dz * MM) + dir * (k - 0.5) * 1.1 * s; c.beginPath(); c.moveTo(x - 0.8 * s, y - dir * 0.5 * s); c.lineTo(x + 0.8 * s, y - dir * 0.5 * s); c.lineTo(x, y + dir * 0.5 * s); c.closePath(); c.fill(); }
  }
  // запасная наклейка кассеты (без карт): полоска бумаги с датой; настоящая — вёрсткой tools/label_make.html
  function drawCassStrip() {
    const w = 256, h = 1024, A = mkCanvas(w, h), a = A.getContext('2d');
    a.fillStyle = '#e9e4d6'; a.fillRect(0, 0, w, h);
    a.save(); a.translate(w * 0.88, h / 2); a.rotate(-Math.PI / 2); a.fillStyle = '#1d2f6e'; a.font = 'italic 600 84px "Segoe Script", "Comic Sans MS", cursive'; a.textAlign = 'center'; a.fillText('06.10.08', 0, 0); a.restore();
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
      img.onerror = () => { console.warn('[recorder462] нет карты ' + url); res(false); };
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
      tile: { n: loadTex('tile_n.png', false, true), o: loadTex('tile_orm.jpg', false, true) },
      cass: { a: loadTex('cass_a.jpg', true), n: loadTex('cass_n.png', false), o: loadTex('cass_orm.jpg', false) },
      right: { a: loadTex('right_a.jpg', true), n: loadTex('right_n.png', false), o: loadTex('right_orm.jpg', false) },
      left: { a: loadTex('left_a.jpg', true), n: loadTex('left_n.png', false), o: loadTex('left_orm.jpg', false) },
      top: { a: loadTex('top_a.jpg', true), n: loadTex('top_n.png', false), o: loadTex('top_orm.jpg', false) },
      glass: { a: loadTex('glass_a.jpg', false) },
      label: o.label !== false ? { a: loadTex('label_a.jpg', true), n: loadTex('label_n.png', false), r: loadTex('label_r.jpg', false) } : null };
  } else {
    const F = drawFront(o.textureSize), B = drawBack(o.textureSize), TL = drawTile();
    const RL = mkCanvas(Math.round(o.textureSize * 22.5 / 60), Math.round(o.textureSize * 110 / 60)); drawRightPrint(RL.getContext('2d'), o.textureSize / 60);
    root.userData.canvases = { front: F, back: B, cass: { A: drawCassette(Math.round(o.textureSize * 33 / 60)) }, right: { L: RL } };
    M = { front: { a: canvasTex(F.A, true), n: canvasTex(F.N, false), o: canvasTex(F.O, false) },
      back: { a: canvasTex(B.A, true), n: canvasTex(B.N, false), o: canvasTex(B.O, false) },
      tile: { n: canvasTex(TL.N, false, true), o: canvasTex(TL.O, false, true) },
      cass: { a: canvasTex(drawCassStrip(), true) }, label: null, right: null, left: null, top: null, glass: null };
  }
  const phys = (p) => { const m = new THREE.MeshPhysicalMaterial(p); disposables.push(m); return m; };
  const faceMat = (F, extra = {}) => phys(Object.assign({ map: F.a, normalMap: F.n, roughnessMap: F.o, metalnessMap: F.o, aoMap: F.o, aoMapIntensity: 0.9,
    roughness: 1, metalness: 1, normalScale: new THREE.Vector2(1, 1) }, extra));
  const mFront = faceMat(M.front, { clearcoat: 0.25, clearcoatRoughness: 0.35 });   // краска «шампань» под лаком
  const mBack = faceMat(M.back, { specularIntensity: 0.6 });   // тёмный пластик: блик лампы не должен высветлять грань до серого
  // грани с фото: правая (клавиши), левая (колесо громкости), верхняя (микрофон, гнездо, пауза); карты — проекция в лоб на грань
  const mRight = M.right ? faceMat(M.right, { clearcoat: 0.35, clearcoatRoughness: 0.25 }) : null;
  const mLeft = M.left ? faceMat(M.left, { specularIntensity: 0.6 }) : null, mTop = M.top ? faceMat(M.top, { specularIntensity: 0.6 }) : null;
  const mCass = M.cass && M.cass.o ? faceMat(M.cass, { clearcoat: 0.6, clearcoatRoughness: 0.18 }) : null;
  const rUV = (y, z) => [(T - y) / T, 1 - (z + hd) / H];        // правая грань: слева — перед вещи
  const lUV = (y, z) => [y / T, 1 - (z + hd) / H];              // левая грань: справа — перед вещи
  const tUV = (x, y) => [(x + hw) / W, 1 - y / T];              // верхняя грань: сверху — спинка
  const setUV = (g, fn) => { const pos = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < pos.count; i++) { const t = fn(pos.getX(i), pos.getY(i), pos.getZ(i)); uv.setXY(i, t[0], t[1]); } return g; };
  const tileRough = (k) => ({ roughness: k, roughnessMap: M.tile.o, normalMap: M.tile.n });
  const mBody = phys(Object.assign({ color: new THREE.Color(0.014, 0.015, 0.017), metalness: 0, normalScale: new THREE.Vector2(0.25, 0.25) }, tileRough(0.72)));      // тёмный литой пластик боков
  const mPod = phys(Object.assign({ color: new THREE.Color(0.010, 0.011, 0.012), metalness: 0, normalScale: new THREE.Vector2(0.12, 0.12), clearcoat: 0.6, clearcoatRoughness: 0.2 }, tileRough(0.55)));
  const mGrey = phys(Object.assign({ color: new THREE.Color(0.20, 0.21, 0.22), metalness: 0, normalScale: new THREE.Vector2(0.3, 0.3) }, tileRough(1.0)));
  const mRed = phys({ color: new THREE.Color(0.52, 0.035, 0.03), roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  // прозрачные клавиши: на мощном устройстве — настоящее преломление (сквозь клавишу видны её рёбра и тёмное гнездо),
  // на слабом (lowPower) — простой полупрозрачный пластик без лишнего прохода отрисовки
  const mClear = o.lowPower || o.glassKeys === false
    ? phys({ color: new THREE.Color(0.50, 0.62, 0.64), roughness: 0.14, metalness: 0, transparent: true, opacity: 0.62, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: true })
    : phys({ color: new THREE.Color(0.86, 0.95, 0.96), roughness: 0.10, metalness: 0, transmission: 1, thickness: 0.0022, ior: 1.49, attenuationColor: new THREE.Color(0.55, 0.78, 0.80), attenuationDistance: 0.004, clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 1 });
  const mClearCore = phys({ color: new THREE.Color(0.20, 0.25, 0.27), roughness: 0.35, metalness: 0 });
  const mDark = phys({ color: 0x030303, roughness: 0.9, metalness: 0 });
  const mBezel = phys({ color: new THREE.Color(0.47, 0.42, 0.34), roughness: 0.5, metalness: 0.2 });
  const mWell = phys({ color: new THREE.Color(0.035, 0.035, 0.037), roughness: 0.7, metalness: 0 });
  const mChrome = phys({ color: new THREE.Color(0.8, 0.8, 0.8), roughness: 0.25, metalness: 1 });
  const mGlass = phys({ color: 0x000000, roughness: 0.07, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 1 });
  // кассета
  const mShell = phys({ color: new THREE.Color(0.030, 0.028, 0.024), roughness: 0.18, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
  const mHub = phys({ color: new THREE.Color(0.82, 0.82, 0.79), roughness: 0.45, metalness: 0 });
  const mTape = phys({ color: new THREE.Color(0.030, 0.018, 0.012), roughness: 0.62, metalness: 0, specularIntensity: 0.5 });
  const mLiner = phys({ color: new THREE.Color(0.30, 0.29, 0.27), roughness: 0.8, metalness: 0 });
  const mStrip = phys({ map: M.cass.a, roughness: 0.85, metalness: 0 });

  // ---------- сборка ----------
  let tris = 0, meshes = 0;
  const mesh = (geo, mat, name, cast = true, parent = group) => {
    const m = new THREE.Mesh(geo, mat); if (name) m.name = name; m.castShadow = cast; m.receiveShadow = true;
    parent.add(m); tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; meshes++; disposables.push(geo); return m;
  };
  const q4 = (pts, n, uvs) => {
    const g = new THREE.BufferGeometry(), pos = [], nor = [], uv = [];
    pts.forEach((p, i) => { pos.push(...p); nor.push(...n); uv.push(...(uvs ? uvs[i] : [i % 2, i < 2 ? 1 : 0])); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    g.setIndex(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]); return g;
  };
  const lathe = (pts, y0, cx, cz, down) => {   // тело вращения вокруг вертикали; pts — [радиус, высота] в мм
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0] * MM, p[1] * MM)), LSEG);
    if (down) g.rotateX(Math.PI);
    const nor = g.attributes.normal, idx = g.index.array; let sy = 0;
    for (let i = 0; i < nor.count; i++) sy += nor.getY(i);
    if (sy * (down ? -1 : 1) < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
    }
    g.translate(cx, y0, cz); return g;
  };
  // деталь на боковой грани: «плитка» растёт наружу от грани. side: +1 — правая (x = +hw), −1 — левая; 'top' — верхняя грань (z = −hd)
  // at — [координата поперёк грани, вдоль грани] центра детали в координатах вещи: по нему деталь одевается в фото своей грани
  const sideChip = (side, p, at) => {
    const q = Object.assign({ y0: 0, seg: KSEG }, p);
    if (at && side === 1 && M.right) q.uv = (x, z) => rUV(at[0] - x, at[1] + z);
    if (at && side === -1 && M.left) q.uv = (x, z) => lUV(at[0] + x, at[1] + z);
    if (at && side === 'top' && M.top) q.uv = (x, z) => tUV(at[0] + x, at[1] + z);
    const g = chipGeo(THREE, q);
    if (side === 'top') g.rotateX(-Math.PI / 2); else g.rotateZ(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    return g;
  };

  // корпус: спинка со скруглением (фото спинки), тёмные бока со швом между половинами, скругление переда (фото переда)
  const backProf = [], frontProf = [];
  for (let k = 0; k <= 8; k++) { const th = (k / 8) * Math.PI / 2; backProf.push([fr * (1 - Math.sin(th)), fr * (1 - Math.cos(th))]); }
  for (let k = 0; k <= 8; k++) { const th = (k / 8) * Math.PI / 2; frontProf.push([fr * (1 - Math.cos(th)), T - fr + fr * Math.sin(th)]); }
  const G = D.grille, WN = D.win, DR = D.door, CT = D.counter;
  mesh(mergeGeos(THREE, [
    capGeo(THREE, { hw: hw - fr, hd: hd - fr, r: R - fr, y: 0, up: false, seg: SEG, uv: bUV }),
    sideGeo(THREE, { hw, hd, r: R, profile: backProf, seg: SEG, uvf: (x, z) => bUV(x, z) }),
  ]), mBack, 'back_shell');
  const sm = D.seam;
  {
    const bandProf = [[0, fr], [0, sm - 0.00022], [0.00026, sm - 0.00008], [0.00026, sm + 0.00008], [0, sm + 0.00022], [0, T - fr]];
    const band = sideGeo(THREE, { hw, hd, r: R, seg: SEG, profile: bandProf });
    if (!M.right) mesh(band, mBody, 'band');
    else {   // каждая грань — своё фото в лоб; углы делятся пополам по 45°
      const ng = band.toNonIndexed(); band.dispose();
      const P2 = ng.attributes.position, N2 = ng.attributes.normal, parts = { right: [[], [], []], left: [[], [], []], top: [[], [], []], bottom: [[], [], []] };
      for (let i = 0; i < P2.count; i += 3) {
        const nx = N2.getX(i) + N2.getX(i + 1) + N2.getX(i + 2), nz = N2.getZ(i) + N2.getZ(i + 1) + N2.getZ(i + 2);
        const key = Math.abs(nx) >= Math.abs(nz) ? (nx > 0 ? 'right' : 'left') : (nz < 0 ? 'top' : 'bottom'), A2 = parts[key];
        for (let k = i; k < i + 3; k++) { const x = P2.getX(k), y = P2.getY(k), z = P2.getZ(k); A2[0].push(x, y, z); A2[1].push(N2.getX(k), N2.getY(k), N2.getZ(k));
          const t = key === 'right' ? rUV(y, z) : key === 'left' ? lUV(y, z) : key === 'top' ? tUV(x, y) : [x / TILE, y / TILE]; A2[2].push(t[0], t[1]); }
      }
      ng.dispose();
      for (const [key, mat] of [['right', mRight], ['left', mLeft || mBody], ['top', mTop || mBody], ['bottom', mBody]]) {
        const g2 = new THREE.BufferGeometry(), A2 = parts[key];
        g2.setAttribute('position', new THREE.Float32BufferAttribute(A2[0], 3)); g2.setAttribute('normal', new THREE.Float32BufferAttribute(A2[1], 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(A2[2], 2));
        mesh(g2, mat, 'band_' + key);
      }
    }
  }
  mesh(sideGeo(THREE, { hw, hd, r: R, seg: SEG, profile: frontProf, uvf: (x, z) => fUV(x, z) }), mFront, 'front_bevel');
  mesh(capGeo(THREE, { hw: hw - fr, hd: hd - fr, r: R - fr, y: T, up: true, seg: SEG, uv: fUV,
    holes: [{ x0: G.x0, z0: G.z0, x1: G.x1, z1: G.z1, r: G.r }, { x0: WN.x0, z0: WN.z0, x1: WN.x1, z1: WN.z1, r: WN.r }] }), mFront, 'front_plate');

  // решётка динамика: утопленная вставка с настоящими отверстиями (шахматный порядок), за ней — тёмная ткань
  {
    const yG = T - G.inset, holes = [], walls = [];
    const nz = Math.floor((G.z1 - G.z0 - 3.2 * MM) / (G.pitch * 0.866)), nx = Math.floor((G.x1 - G.x0 - 3.2 * MM) / G.pitch);
    const zs = (G.z0 + G.z1) / 2 - nz * G.pitch * 0.866 / 2, xs = (G.x0 + G.x1) / 2 - nx * G.pitch / 2;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx - (j % 2); i++) {
      const cx = xs + (i + (j % 2) * 0.5) * G.pitch, cz = zs + j * G.pitch * 0.866;
      holes.push({ cx, cz, r: G.hole });
      walls.push(sideGeo(THREE, { hw: G.hole, hd: G.hole, r: G.hole, cx, cz, seg: HSEG, inward: true, profile: [[0, yG - 0.0009], [0, yG]] }));
    }
    mesh(capGeo(THREE, { hw: (G.x1 - G.x0) / 2, hd: (G.z1 - G.z0) / 2, r: G.r, cx: (G.x0 + G.x1) / 2, cz: (G.z0 + G.z1) / 2, y: yG, up: true, seg: HSEG * 2, uv: fUV, holes }), mFront, 'grille');
    mesh(mergeGeos(THREE, walls), mWell, 'grille_holes', false);
    mesh(sideGeo(THREE, { hw: (G.x1 - G.x0) / 2, hd: (G.z1 - G.z0) / 2, r: G.r, cx: (G.x0 + G.x1) / 2, cz: (G.z0 + G.z1) / 2, seg: 8, inward: true, profile: [[0, yG], [0, T]] }), mWell, 'grille_rim', false);
    mesh(q4([[G.x0, yG - 0.0009, G.z0], [G.x1, yG - 0.0009, G.z0], [G.x0, yG - 0.0009, G.z1], [G.x1, yG - 0.0009, G.z1]], [0, 1, 0]), mDark, 'grille_cloth', false);
    root.userData.grilleHoles = holes.length;
  }

  // дверца кассеты: накладка с окном; фаска окна светлая, под ней — прозрачная панель и колодец с кассетой
  const yD = T + DR.h, yGl = yD - WN.bezel, yCas = T - 1.6 * MM, yFloor = T - 5.2 * MM;
  {
    const cxD = (DR.x0 + DR.x1) / 2, czD = (DR.z0 + DR.z1) / 2, hwD = (DR.x1 - DR.x0) / 2, hdD = (DR.z1 - DR.z0) / 2, bv = 0.00028;
    const holes = [{ x0: WN.x0, z0: WN.z0, x1: WN.x1, z1: WN.z1, r: WN.r }];
    if (o.counter !== false) holes.push({ x0: CT.x0, z0: CT.z0, x1: CT.x1, z1: CT.z1, r: 0.0006 });
    mesh(mergeGeos(THREE, [
      sideGeo(THREE, { hw: hwD, hd: hdD, r: DR.r, cx: cxD, cz: czD, profile: bevelProf(T - 0.00005, DR.h + 0.00005, bv), seg: SEG, uvf: (x, z) => fUV(x, z) }),
      capGeo(THREE, { hw: hwD - bv, hd: hdD - bv, r: DR.r - bv, cx: cxD, cz: czD, y: yD, up: true, seg: SEG, uv: fUV, holes }),
    ]), mFront, 'door');
    const wcx = (WN.x0 + WN.x1) / 2, wcz = (WN.z0 + WN.z1) / 2, whw = (WN.x1 - WN.x0) / 2, whd = (WN.z1 - WN.z0) / 2, bz = WN.bezel;
    mesh(sideGeo(THREE, { hw: whw, hd: whd, r: WN.r, cx: wcx, cz: wcz, seg: 10, inward: true, profile: [[-bz, yGl], [-0.00012, yD - 0.00012], [0, yD]], uvf: o.pbr ? (x, z) => fUV(x, z) : null }), o.pbr ? mFront : mBezel, 'window_bezel', false);
    mesh(sideGeo(THREE, { hw: whw - bz, hd: whd - bz, r: WN.r - bz, cx: wcx, cz: wcz, seg: 10, inward: true, profile: [[0, yFloor], [0, yGl]] }), mWell, 'window_well', false);
    const glass = mesh(capGeo(THREE, { hw: whw - bz, hd: whd - bz, r: WN.r - bz, cx: wcx, cz: wcz, y: yGl - 0.00005, up: true, seg: 10 }), mGlass, 'window_glass', false);
    glass.raycast = () => {}; glass.renderOrder = 3; glass.receiveShadow = false;
    if (M.glass) {
      const gx0 = WN.x0 + bz, gx1 = WN.x1 - bz, gz0 = WN.z0 + bz, gz1 = WN.z1 - bz, yy = yGl - 0.00003;
      const mScr = phys({ color: new THREE.Color(0.85, 0.85, 0.83), alphaMap: M.glass.a, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.75, metalness: 0 });
      const sc = mesh(capGeo(THREE, { hw: whw - bz, hd: whd - bz, r: WN.r - bz, cx: wcx, cz: wcz, y: yy, up: true, seg: 10, uv: (x, z) => [(x - gx0) / (gx1 - gx0), 1 - (z - gz0) / (gz1 - gz0)] }), mScr, 'window_marks', false);
      sc.raycast = () => {}; sc.renderOrder = 4; sc.receiveShadow = false;
    }
    mesh(q4([[WN.x0, yFloor, WN.z0], [WN.x1, yFloor, WN.z0], [WN.x0, yFloor, WN.z1], [WN.x1, yFloor, WN.z1]], [0, 1, 0]), mLiner, 'cassette_floor', false);
  }

  // Кассета в окне. С картами — фото кассеты на плоскости и две втулки поверх него (они вращаются: вырезаны из того же фото,
  // tools/make_maps.py ставит их центры точно в центры модели). Намотка на фото неподвижна: за полминуты записи её толщина
  // меняется на десятую миллиметра. Без карт — запасная сборка из геометрии.
  const CS = D.cassette, TP = D.tape, reels = {};
  const cz0 = CS.zc - CS.len / 2, cUV = (x, z) => [(x - CS.x0) / (CS.x1 - CS.x0), 1 - (z - cz0) / CS.len];
  if (mCass) {
    const z1 = cz0 + CS.len;
    mesh(q4([[CS.x0, yCas, cz0], [CS.x1, yCas, cz0], [CS.x0, yCas, z1], [CS.x1, yCas, z1]], [0, 1, 0], [cUV(CS.x0, cz0), cUV(CS.x1, cz0), cUV(CS.x0, z1), cUV(CS.x1, z1)]), mCass, 'cassette', false);
    for (const [name, dz] of [['reel_supply', -CS.hubs], ['reel_takeup', CS.hubs]]) {
      const g = new THREE.Group(); g.name = name; g.position.set(CS.hubX, 0, CS.zc + dz); group.add(g);
      const d = new THREE.CircleGeometry(D.hubR, LSEG); d.rotateX(-Math.PI / 2); d.translate(0, yCas + 0.00003, 0);
      setUV(d, (x, y, z) => cUV(x + CS.hubX, z + CS.zc + dz));
      mesh(d, mCass, name + '_hub', false, g);
      reels[name] = { g, pack: null };
    }
  } else {
    const z0 = cz0, z1 = cz0 + CS.len;
    const shell = mesh(q4([[CS.x0, yCas, z0], [CS.x1, yCas, z0], [CS.x0, yCas, z1], [CS.x1, yCas, z1]], [0, 1, 0]), mShell, 'cassette_shell', false); shell.renderOrder = 2; shell.raycast = () => {};
    const sx0 = CS.strip[0], sx1 = CS.strip[1], sz0 = CS.zc - 21 * MM, sz1 = CS.zc + 21 * MM, yS = yCas + 0.00004;
    const strip = mesh(q4([[sx0, yS, sz0], [sx1, yS, sz0], [sx0, yS, sz1], [sx1, yS, sz1]], [0, 1, 0], [[0, 1], [1, 1], [0, 0], [1, 0]]), mStrip, 'cassette_label', false); strip.renderOrder = 2;
    for (const [name, dz] of [['reel_supply', -CS.hubs], ['reel_takeup', CS.hubs]]) {
      const g = new THREE.Group(); g.name = name; g.position.set(CS.hubX, 0, CS.zc + dz); group.add(g);
      mesh(lathe([[5.6, -3.4], [5.6, -0.25], [5.3, -0.05], [3.5, -0.05], [3.3, -0.25], [3.3, -3.4]], yCas, 0, 0), mHub, name + '_hub', false, g);
      const lugs = [];
      for (let k = 0; k < 3; k++) { const b = new THREE.BoxGeometry(0.0011, 0.003, 0.0014); b.translate(0, yCas - 0.0017, 0.0027); b.rotateY(k / 3 * Math.PI * 2 + (dz > 0 ? 0.5 : 0)); lugs.push(b); }
      mesh(mergeGeos(THREE, lugs), mHub, name + '_lugs', false, g);
      mesh(lathe([[1.9, -3.4], [1.9, -0.9], [1.6, -0.7], [0, -0.7]], yCas, 0, 0), mGrey, name + '_spindle', false, g);
      const pack = mesh(lathe([[1000, -3.2], [1000, -0.75], [990, -0.6], [0, -0.6]], yCas, 0, 0), mTape, name + '_tape', false, g);
      reels[name] = { g, pack };
    }
  }

  let mLamp = null, mHalo = null;
  // счётчик ленты: три барабана в окошке на дверце, рядом кнопка сброса (не нажимается)
  let counterDraw = null;
  if (o.counter !== false) {
    const cw = 256, chh = 128, cv = mkCanvas(cw, chh), c2 = cv.getContext('2d'), tex = canvasTex(cv, true);
    counterDraw = (n) => {
      c2.fillStyle = '#0c0c0d'; c2.fillRect(0, 0, cw, chh);
      const s = String(((Math.floor(n) % 1000) + 1000) % 1000).padStart(3, '0');
      for (let k = 0; k < 3; k++) {
        const x = 10 + k * 80, g2 = c2.createLinearGradient(0, 8, 0, chh - 8);
        g2.addColorStop(0, '#161614'); g2.addColorStop(0.16, '#8f8a78'); g2.addColorStop(0.36, '#d9d4c0'); g2.addColorStop(0.62, '#d3ceb9'); g2.addColorStop(0.86, '#857f6d'); g2.addColorStop(1, '#141412');
        c2.fillStyle = g2; c2.fillRect(x, 6, 74, chh - 12);
        c2.fillStyle = '#1b1b1a'; c2.font = '700 88px "Arial Narrow", Arial, Helvetica, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
        c2.save(); c2.translate(x + 37, chh / 2 + 4); c2.scale(0.86, 1); c2.globalAlpha = 0.9; c2.fillText(s[k], 0, 0); c2.restore();
        // соседние цифры барабана уходят за край окна
        c2.save(); c2.globalAlpha = 0.35; c2.translate(x + 37, chh / 2 + 4); c2.scale(0.86, 0.5); c2.fillText(String((+s[k] + 1) % 10), 0, -196); c2.fillText(String((+s[k] + 9) % 10), 0, 196); c2.restore();
      }
      const cr = rngFactory(77);   // мелкая грязь и потёртости барабанов — одни и те же при каждом числе
      for (let i = 0; i < 260; i++) { c2.fillStyle = `rgba(${cr() < 0.6 ? '40,36,28' : '250,246,230'},${0.05 + cr() * 0.12})`; c2.fillRect(cr() * cw, 8 + cr() * (chh - 16), 1 + cr() * 2.5, 1 + cr() * 1.6); }
      tex.needsUpdate = true;
    };
    counterDraw(0);
    const y = yD - 0.00045;
    mesh(q4([[CT.x0, y, CT.z0], [CT.x1, y, CT.z0], [CT.x0, y, CT.z1], [CT.x1, y, CT.z1]], [0, 1, 0], [[0, 1], [1, 1], [0, 0], [1, 0]]), phys({ map: tex, roughness: 0.5, metalness: 0 }), 'counter', false);
    const cg = mesh(q4([[CT.x0, yD - 0.00012, CT.z0], [CT.x1, yD - 0.00012, CT.z0], [CT.x0, yD - 0.00012, CT.z1], [CT.x1, yD - 0.00012, CT.z1]], [0, 1, 0]), mGlass, 'counter_glass', false); cg.raycast = () => {}; cg.renderOrder = 3; cg.receiveShadow = false;
    mesh(sideGeo(THREE, { hw: (CT.x1 - CT.x0) / 2, hd: (CT.z1 - CT.z0) / 2, r: 0.0006, cx: (CT.x0 + CT.x1) / 2, cz: (CT.z0 + CT.z1) / 2, seg: 4, inward: true, profile: [[0, y], [0, yD]] }), mWell, 'counter_well', false);
    mesh(chipGeo(THREE, { hw: 0.0012, hd: 0.0012, r: 0.0012, cx: CT.reset.x, cz: CT.reset.z, y0: yD, h: 0.0005, bevel: 0.0002, seg: KSEG, uv: o.pbr ? fUV : null }), o.pbr ? mFront : mPod, 'counter_reset');
  }
  { // лампочка батареи: маленькая тёмно-красная линза
    const rc = 1.6 * MM, br = 1.05 * MM, th = Math.asin(br / rc), dome = new THREE.SphereGeometry(rc, 20, 6, 0, Math.PI * 2, 0, th); dome.translate(D.led.x, T - rc * Math.cos(th) - 0.00003, D.led.z);
    mLamp = phys({ color: new THREE.Color(0.22, 0.02, 0.02), roughness: 0.1, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.7, emissive: new THREE.Color(1.0, 0.07, 0.03), emissiveIntensity: 0 });
    mesh(dome, mLamp, 'batt_lamp', false);
    // свечение вокруг лампочки на краске (без постобработки): мягкое пятно, складывается с картинкой
    const hc2 = mkCanvas(64, 64), hx = hc2.getContext('2d'), hg = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
    hg.addColorStop(0, 'rgba(255,70,40,1)'); hg.addColorStop(0.25, 'rgba(255,40,20,0.55)'); hg.addColorStop(1, 'rgba(255,20,10,0)'); hx.fillStyle = hg; hx.fillRect(0, 0, 64, 64);
    mHalo = new THREE.MeshBasicMaterial({ map: canvasTex(hc2, true), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }); disposables.push(mHalo);
    const hr = 3.4 * MM, hy = T + 0.00008, hm = mesh(q4([[D.led.x - hr, hy, D.led.z - hr], [D.led.x + hr, hy, D.led.z - hr], [D.led.x - hr, hy, D.led.z + hr], [D.led.x + hr, hy, D.led.z + hr]], [0, 1, 0]), mHalo, 'batt_lamp_glow', false);
    hm.raycast = () => {}; hm.receiveShadow = false; hm.renderOrder = 5;
  }

  // лампочка: горит, пока лента идёт (воспроизведение и перемотка) — как лампа работы у диктофонов этого класса
  let lampOn = false;
  const setLamp = (on) => { lampOn = !!on; mLamp.emissiveIntensity = lampOn ? 2.6 : 0; mLamp.opacity = lampOn ? 0.95 : 0.7; mHalo.opacity = lampOn ? 0.5 : 0; if (o.onChange) o.onChange(); };
  // ---------- клавиши на правой грани ----------
  // С картами все детали грани одеты в её фото (проекция в лоб): гнездо, запись, пуск, стоп, ползунок, ушко ремешка.
  // Значки клавиш лежат в карте (слой печати); без карт — отдельные значки поверх одноцветных клавиш.
  const keys = {}, K = D.keys, PH = !!M.right;
  const keyGroup = (name, x, y, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); group.add(g); return g; };
  const icons = PH ? null : canvasTex(drawIcons(), true);
  const mIcon = PH ? null : new THREE.MeshBasicMaterial({ map: icons, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }); if (mIcon) disposables.push(mIcon);
  const icon = (k, parent, x, yc, zc, s, along) => {
    if (PH) return;
    const u0 = k / 5, u1 = (k + 1) / 5;
    const pts = along ? [[x, yc + s, zc + s], [x, yc + s, zc - s], [x, yc - s, zc + s], [x, yc - s, zc - s]]
      : [[x, yc + s, zc - s], [x, yc - s, zc - s], [x, yc + s, zc + s], [x, yc - s, zc + s]];
    const m = mesh(q4(pts, [1, 0, 0], [[u0, 1], [u1, 1], [u0, 0], [u1, 0]]), mIcon, 'key_icon', false, parent);
    m.raycast = () => {}; m.receiveShadow = false; m.renderOrder = 4; return m;
  };
  {
    const podC = (K.pod[0] + K.pod[1]) / 2, podH = (K.pod[1] - K.pod[0]) / 2, POD = 0.0011;
    if (PH) {   // гнездо клавиш: верх — фото, стенка — гладкий чёрный пластик (на отвесной стенке проекция фото дала бы штрихи)
      const wall = sideGeo(THREE, { hw: 0.0064, hd: podH, r: 0.003, profile: bevelProf(0, POD, 0.0005), seg: KSEG }); wall.rotateZ(-Math.PI / 2); wall.translate(hw, K.y, podC); mesh(wall, mPod, 'key_pod_wall');
      // прорезь ползунка — настоящее углубление: отверстие в гнезде, стенки и тёмное дно
      const sz = K.slider - podC, SW2 = 0.0031, SL2 = 0.0083, SD = 0.0009;
      const cap = capGeo(THREE, { hw: 0.0059, hd: podH - 0.0005, r: 0.0025, y: POD, up: true, seg: KSEG, uv: (x, z) => rUV(K.y - x, podC + z), holes: [{ x0: -SW2, z0: sz - SL2, x1: SW2, z1: sz + SL2, r: 0.001 }] }); cap.rotateZ(-Math.PI / 2); cap.translate(hw, K.y, podC); mesh(cap, mRight, 'key_pod');
      const sw = sideGeo(THREE, { hw: SW2, hd: SL2, r: 0.001, cz: sz, seg: 6, inward: true, profile: [[0, POD - SD], [0, POD]] }); sw.rotateZ(-Math.PI / 2); sw.translate(hw, K.y, podC); mesh(sw, mPod, 'wind_slot_wall', false);
      const xf = hw + POD - SD; mesh(q4([[xf, K.y + SW2, K.slider - SL2], [xf, K.y + SW2, K.slider + SL2], [xf, K.y - SW2, K.slider - SL2], [xf, K.y - SW2, K.slider + SL2]], [1, 0, 0]), mDark, 'wind_slot', false).raycast = () => {};
    } else { const pod = sideChip(1, { hw: 0.0064, hd: podH, r: 0.003, h: POD, bevel: 0.0005 }); pod.translate(hw, K.y, podC); mesh(pod, mPod, 'key_pod'); }
    const xP = hw + POD;
    { const g = sideChip(1, { hw: 0.0042, hd: 0.0031, r: 0.002, h: 0.0019, bevel: 0.0008 }, [K.y, K.post]); g.translate(hw, K.y, K.post); mesh(g, mRight || mGrey, 'strap_post'); }
    const key = (name, zc, hdK, mat, h, travel, ic, ribs) => {
      const g = keyGroup(name, xP, K.y, zc);
      const cap = sideChip(1, { hw: 0.0043, hd: hdK, r: 0.0012, h, bevel: 0.00055 }, [K.y, zc]); mesh(cap, mRight || mat, name + '_cap', true, g);
      if (!PH && mat === mClear) { const core = sideChip(1, { hw: 0.0031, hd: hdK - 0.0012, r: 0.0006, h: h * 0.45, bevel: 0.0001 }); mesh(core, mClearCore, name + '_core', false, g).raycast = () => {};
        if (ribs) { const rb = []; for (let k = 0; k < ribs; k++) { const b = new THREE.BoxGeometry(0.00035, 0.0062, 0.00045); b.translate(h * 0.62, 0, (k - (ribs - 1) / 2) * 0.0013 + hdK * 0.42); rb.push(b); }
          mesh(mergeGeos(THREE, rb), mClearCore, name + '_ribs', false, g).raycast = () => {}; } }
      icon(ic, g, h + 0.00003, 0, mat === mClear && ribs ? -hdK * 0.38 : 0, 0.0021);
      keys[name] = { obj: g, axis: [-1, 0, 0], travel };
    };
    key('btn_rec', K.rec, 0.0045, mRed, 0.0016, 0.0009, 0, 0);        // красная клавиша: в игре возвращает запись в начало (решение автора 27.11); значок «в начало» — в карте грани
    key('btn_play', K.play, 0.0065, mClear, 0.0019, 0.0009, 1, 5);
    key('btn_stop', K.stop, 0.0045, mClear, 0.0019, 0.0009, 2, 0);
    // ползунок перемотки: к верху вещи — вперёд, к низу — назад; сам возвращается в середину
    const zS = K.slider, SL = 0.0085;
    if (!PH) mesh(q4([[xP + 0.00002, K.y + 0.0033, zS - SL], [xP + 0.00002, K.y + 0.0033, zS + SL], [xP + 0.00002, K.y - 0.0033, zS - SL], [xP + 0.00002, K.y - 0.0033, zS + SL]], [1, 0, 0]), mDark, 'wind_slot', false).raycast = () => {};
    const sl = keyGroup('wind_slider', xP, K.y, zS);
    mesh(sideChip(1, { hw: 0.0031, hd: 0.0042, r: 0.0011, h: 0.0015, bevel: 0.0005 }, [K.y, zS]), mRight || mGrey, 'wind_slider_cap', true, sl);
    { const rb = []; for (let k = 0; k < 5; k++) { const b = new THREE.BoxGeometry(0.0005, 0.0052, 0.00045); b.translate(0.0016, 0, (k - 2) * 0.0014); rb.push(b); }
      const rg = mergeGeos(THREE, rb); if (PH) setUV(rg, (x, y, z) => rUV(K.y + y, zS + z)); mesh(rg, mRight || mGrey, 'wind_slider_ribs', true, sl); }
    keys.btn_ff = { obj: sl, axis: [0, 0, -1], travel: 0.003 }; keys.btn_rew = { obj: sl, axis: [0, 0, 1], travel: 0.003 };
    sl.userData.keyFn = (p) => (p.z < 0 ? 'btn_ff' : 'btn_rew');
    // площадка над прорезью и стрелками: пустое место у стрелки нажимается как перемотка в её сторону (ничего не рисует, только ловит луч)
    const mZone = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); disposables.push(mZone);
    const xz = xP + 0.0002, zone = mesh(q4([[xz, K.y + 0.0062, zS - 0.0096], [xz, K.y + 0.0062, zS + 0.0096], [xz, K.y - 0.0062, zS - 0.0096], [xz, K.y - 0.0062, zS + 0.0096]], [1, 0, 0]), mZone, 'wind_zone', false);
    zone.receiveShadow = false; zone.userData.keyFn = (p) => (p.z < zS ? 'btn_ff' : 'btn_rew');
    icon(3, group, xP + 0.00004, K.y + 0.0049, zS - 0.0052, 0.0013, true); icon(4, group, xP + 0.00004, K.y + 0.0049, zS + 0.0052, 0.0013, true);
  }

  // левая грань: колесо громкости (выступает из прорези) и переключатель скорости ленты
  {
    const L = D.left, wy = K.y, wx = -hw + (L.wheel.r - L.wheel.out), PL = !!M.left;
    const wheel = new THREE.CylinderGeometry(L.wheel.r, L.wheel.r, 0.0032, LSEG); wheel.translate(wx, wy, L.wheel.z); if (PL) setUV(wheel, (x, y, z) => lUV(y, z)); mesh(wheel, mLeft || mGrey, 'volume_wheel');
    const kn = []; for (let k = 0; k < 56; k++) { const b = new THREE.BoxGeometry(0.00042, 0.003, 0.0005); b.translate(0, 0, L.wheel.r); b.rotateY(k / 56 * Math.PI * 2); b.translate(wx, wy, L.wheel.z); kn.push(b); }
    { const kg = mergeGeos(THREE, kn); if (PL) setUV(kg, (x, y, z) => lUV(y, z)); mesh(kg, mLeft || mGrey, 'volume_knurl', false); }
    const half = Math.sqrt(L.wheel.r * L.wheel.r - (L.wheel.r - L.wheel.out) ** 2) + 0.0008, xs = -hw - 0.00002;
    if (!PL) {
      mesh(q4([[xs, wy + 0.0021, L.wheel.z + half], [xs, wy + 0.0021, L.wheel.z - half], [xs, wy - 0.0021, L.wheel.z + half], [xs, wy - 0.0021, L.wheel.z - half]], [-1, 0, 0]), mDark, 'volume_slot', false);
      mesh(q4([[xs, wy + 0.0016, L.speed + 0.0042], [xs, wy + 0.0016, L.speed - 0.0042], [xs, wy - 0.0016, L.speed + 0.0042], [xs, wy - 0.0016, L.speed - 0.0042]], [-1, 0, 0]), mDark, 'speed_slot', false);
    }
    const sw = sideChip(-1, { hw: 0.0013, hd: 0.0018, r: 0.0005, h: 0.0008, bevel: 0.0003 }, [wy, L.speed - 0.0018]); sw.translate(-hw, wy, L.speed - 0.0018); mesh(sw, mLeft || mGrey, 'speed_switch');
  }
  // верхняя грань: щели микрофона, гнездо наушника, ползунок паузы (с картами — на фото грани; ползунок — деталь)
  {
    const Tp = D.top, zT = -hd - 0.00002, yM = 12.5 * MM;
    if (!M.top) {
      for (let k = 0; k < 3; k++) { const g = new THREE.PlaneGeometry(0.0062, 0.0007); g.rotateY(Math.PI); g.translate(Tp.mic, yM + (k - 1) * 0.0019, zT); mesh(g, mDark, 'mic_slot', false); }
      const ring = new THREE.RingGeometry(0.00175, 0.0027, 32); ring.rotateY(Math.PI); ring.translate(Tp.ear, yM, zT - 0.00002); mesh(ring, mChrome, 'ear_ring', false);
      const hole = new THREE.CircleGeometry(0.00175, 32); hole.rotateY(Math.PI); hole.translate(Tp.ear, yM, zT); mesh(hole, mDark, 'ear_hole', false);
      const slot = new THREE.PlaneGeometry(0.0085, 0.0034); slot.rotateY(Math.PI); slot.translate(Tp.pause, yM, zT); mesh(slot, mDark, 'pause_slot', false);
    }
    const ps = sideChip('top', { hw: 0.0022, hd: 0.0014, r: 0.0005, h: 0.0009, bevel: 0.0003 }, [Tp.pause - 0.0018, yM]); ps.translate(Tp.pause - 0.0018, yM, -hd); mesh(ps, mTop || mGrey, 'pause_switch');
  }

  // ---------- наклейка бюро на спинке: инвентарная, казённая (вёрстка tools/label_make.html) ----------
  if (M.label) {
    const LB = D.back.label, lw = LB.x1 - LB.x0, lh = lw * 660 / 1540, lz0 = LB.zc - lh / 2;
    // на спинке зритель видит X зеркально: u = 0 — у +X. Угол (со стороны зрителя правый нижний) чуть отошёл.
    const lift = (u, v) => { const t = (u - 0.80) / 0.20 + (0.30 - v) / 0.30 - 1; return (t > 0 ? LB.lift * Math.pow(Math.min(t, 1), 1.5) : 0) + 0.00003 * (0.5 + 0.5 * Math.sin(5.1 * u + 0.4) * Math.cos(3.7 * v + 1.1)); };
    const NU = 40, NV = 18, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) { const u = i / NU, v = 1 - j / NV; pos.push(LB.x1 - u * lw, -0.00006 - lift(u, v), lz0 + (1 - v) * lh); uv.push(u, v); }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    mesh(g, phys({ map: M.label.a, normalMap: M.label.n, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: M.label.r, roughness: 1, metalness: 0 }), 'label_inv', true);
    const mg = 1.4 * MM, fw = lw + 2 * mg, fh = lh + 2 * mg, cw = 320, ch = Math.round(cw * fh / fw);
    const cv = mkCanvas(cw, ch), c2 = cv.getContext('2d'), img = c2.createImageData(cw, ch), cl = (t) => Math.min(1, Math.max(0, t));
    for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
      const u = ((px + 0.5) / cw * fw - mg) / lw, v = 1 - ((py + 0.5) / ch * fh - mg) / lh;
      const out = Math.hypot(Math.max(0, -u, u - 1) * lw, Math.max(0, -v, v - 1) * lh);
      const lf = lift(cl(u - 0.03), cl(v + 0.05)) - 0.00004;
      let a = Math.min(0.55, Math.max(0, lf) / (0.8 * MM)) * cl(1 - out / (Math.max(0, lf) * 1.1 + 1e-6));
      a = Math.max(a, 0.28 * cl(1 - out / 0.00026));
      const k = (py * cw + px) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; img.data[k + 3] = a * 255;
    }
    c2.putImageData(img, 0, 0);
    const st = new THREE.CanvasTexture(cv); disposables.push(st);
    const y = -0.00003, sx0 = LB.x1 + mg, sx1 = LB.x0 - mg, sz0 = lz0 - mg, sz1 = lz0 + lh + mg;
    const ms = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, toneMapped: false }); disposables.push(ms);
    const sh = mesh(q4([[sx0, y, sz0], [sx1, y, sz0], [sx0, y, sz1], [sx1, y, sz1]], [0, -1, 0]), ms, 'label_shadow', false); sh.receiveShadow = false; sh.raycast = () => {};
  }

  // ---------- нажатие ----------
  const kst = {}; for (const n in keys) kst[n] = { t: 0, want: false, hold: 0, latch: false, fix: null };   // fix — деталь держат рукой в этом положении
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const raf = typeof requestAnimationFrame !== 'undefined' ? (f) => requestAnimationFrame(f) : null;
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (t) => t * t * (3 - 2 * t);
  const home0 = new Map(); for (const n in keys) if (!home0.has(keys[n].obj)) home0.set(keys[n].obj, keys[n].obj.position.clone());
  const applyKeys = () => {
    for (const [obj, p0] of home0) obj.position.copy(p0);
    for (const n in keys) { const k = keys[n], e = kst[n].fix != null ? kst[n].fix : ease(kst[n].t); if (!e) continue; k.obj.position.x += k.axis[0] * k.travel * e; k.obj.position.y += k.axis[1] * k.travel * e; k.obj.position.z += k.axis[2] * k.travel * e; }
  };
  let keyAnim = false, keyLast = 0;
  function keyStep() {
    const t = nowMs(), dt = Math.min(50, Math.max(1, t - keyLast)); keyLast = t; let busy = false;
    for (const n in kst) {
      const k = kst[n]; if (k.fix != null) continue;
      const down = k.want || k.latch || t < k.hold, target = down ? 1 : 0, speed = calm ? 1 : (down ? dt / 55 : dt / 100);
      if (k.t !== target) { k.t = target > k.t ? Math.min(1, k.t + speed) : Math.max(0, k.t - speed); busy = true; }
      else if (down && !k.want && !k.latch) busy = true;
    }
    applyKeys(); if (o.onChange) o.onChange();
    if (busy && raf) raf(keyStep); else keyAnim = false;
  }
  const kick = () => { if (!raf) { for (const n in kst) kst[n].t = (kst[n].want || kst[n].latch) ? 1 : 0; applyKeys(); if (o.onChange) o.onChange(); return; } if (!keyAnim) { keyAnim = true; keyLast = nowMs(); raf(keyStep); } };
  const setKeyPressed = (name, down) => { const k = kst[name]; if (!k) return false; k.want = !!down; if (down) k.hold = nowMs() + 90; kick(); return true; };
  const pressKey = (name, ms = 120) => { const k = kst[name]; if (!k) return false; k.want = false; k.hold = nowMs() + Math.max(90, ms); kick(); return true; };
  const setKeyLatched = (name, on) => { const k = kst[name]; if (!k) return false; k.latch = !!on; kick(); return true; };
  // ползунок перемотки под пальцем: v от −1 (назад) до +1 (вперёд); 0 — отпустили, пружина возвращает в середину
  const setSlider = (v) => {
    v = Math.max(-1, Math.min(1, v || 0)); const f = kst.btn_ff, r = kst.btn_rew;
    if (v === 0) { f.fix = r.fix = null; f.want = r.want = false; kick(); return; }
    f.fix = Math.max(0, v); r.fix = Math.max(0, -v); f.t = f.fix; r.t = r.fix; applyKeys(); if (o.onChange) o.onChange();
  };
  const sliderFromHit = (hit) => { for (let ob = hit && hit.object; ob && ob !== root; ob = ob.parent) if (ob.name === 'wind_slider') return true; return false; };
  const keyFromHit = (hit) => {
    for (let ob = hit && hit.object; ob && ob !== root; ob = ob.parent) {
      if (ob.userData.keyFn) return ob.userData.keyFn(ob.worldToLocal(hit.point.clone()));
      if (keys[ob.name]) return ob.name;
    }
    return null;
  };

  // ---------- лента: катушки, намотка, счётчик ----------
  // Толщина намотки и углы катушек — из места ленты: r² растёт линейно, угол = длина / радиус (интеграл в замкнутом виде).
  const Aq = TP.r1 * TP.r1 - TP.r0 * TP.r0;
  const turnsTake = (p) => (2 * TP.length / Aq) * (Math.sqrt(TP.r0 * TP.r0 + p * Aq) - TP.r0);
  let tapeSec = 0, counterZero = 0, counterShown = -1;
  const counterOf = (sec) => Math.floor((turnsTake(Math.min(1, Math.max(0, sec / TP.total))) - turnsTake(Math.min(1, Math.max(0, counterZero / TP.total)))) / (Math.PI * 2) / 2.2);
  const setTapeTime = (sec) => {
    tapeSec = Math.min(TP.total, Math.max(0, sec)); const p = tapeSec / TP.total;
    const rT = Math.sqrt(TP.r0 * TP.r0 + p * Aq), rS = Math.sqrt(TP.r1 * TP.r1 - p * Aq);
    if (reels.reel_takeup.pack) { reels.reel_takeup.pack.scale.set(rT, 1, rT); reels.reel_supply.pack.scale.set(rS, 1, rS); }
    reels.reel_takeup.g.rotation.y = -turnsTake(p);
    reels.reel_supply.g.rotation.y = -(2 * TP.length / Aq) * (TP.r1 - rS);
    const n = counterOf(tapeSec); if (counterDraw && n !== counterShown) { counterShown = n; counterDraw(n); }
    if (o.onChange) o.onChange();
  };
  const setCounterZero = (sec) => { counterZero = sec; counterShown = -1; setTapeTime(tapeSec); };
  setTapeTime(o.tapeTime !== undefined ? o.tapeTime : 300); counterZero = tapeSec; counterShown = -1; setTapeTime(tapeSec);

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
  Object.assign(root.userData, { ready, loadMapSet, mapSet, stats, dims: D, drawFrontPrint, drawRightPrint,
    keys: Object.keys(keys), setKeyPressed, pressKey, setKeyLatched, keyFromHit, sliderFromHit, setSlider, keyDepth: (n) => (kst[n] ? kst[n].t : 0),
    setTapeTime, setCounterZero, tapeTime: () => tapeSec, counterValue: () => counterOf(tapeSec), setLamp, lampOn: () => lampOn,
    dispose() { for (const d of disposables) d.dispose(); } });
  return root;
}
