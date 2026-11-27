// pen49.js — ручка-диктофон Мики (материал дела № 49), построенная кодом three.js.
// Без файлов-моделей: форма — геометрией (корпус — тело вращения), поверхности — фото-карты PBR.
// Вид — выбор автора 27.11: тонкая форма (PN-A), чёрный лак и хром (PN-B). Только звук: камеры нет, микрофон — три отверстия.
// Дисплея нет (решение ID-A: номер записи показывает интерфейс игры), на ручке — три кнопки и лампочка.
// Модуль не зависит от страницы: buildPen49(THREE, opts) -> THREE.Group.
//
// Оси вещи: X — вдоль ручки (остриё на −X, торец с гнездом наушника на +X), Y — вверх (клип сверху), +Z — к зрителю (кнопки).
// Центр — в середине длины, на оси. Единицы — метры. Длина 140 мм, толщина 11 мм.
// Узлы: barrel_lower, barrel_upper (лак), tip_cone, ring, cap (хром), nib, jack, clip, mic_holes, lamp, lamp_glow,
//   нажимаемые — группы btn_prev, btn_play, btn_next; flag_49 (бумажный флажок вещдока), flag_loop.
//
// opts: pbr (true), pbrBase, mapSet: 'full' | 'low', lowPower, anisotropy, onChange; label — false: без флажка;
//   chromeEnv (1), lacquerEnv (1) — во сколько раз хром и лак берут окружение: зеркальному хрому в тёмной комнате нечего
//   отражать, а чёрный лак в светлой студии сереет. Подбирается под свет сцены, вида вещи не меняет.
// root.userData: ready (Promise), loadMapSet(set), stats, dims, dispose(),
//   keys — btn_prev, btn_play, btn_next; setKeyPressed(name, down), pressKey(name, ms), keyDepth(name), keyFromHit(hit);
//   setEnv(texture | null, k) — своё окружение (PMREM) для хрома и лака: в тёмной сцене зеркальному металлу нечего отражать;
//   setLamp(on) — лампочка горит; blinkLamp(n) — коротко мигнуть n раз (потом вернуться к прежнему состоянию); lampOn().
//   Движение кнопок и мигание — здесь, по времени (ART-91); что кнопка делает в игре, решает игра.

const MM = 0.001;
export const PEN49 = {
  L: 140 * MM, R: 5.5 * MM,
  ring: [79.0 * MM, 81.4 * MM], cap: 129.3 * MM, coneTop: 21.5 * MM,
  buttons: { prev: 88.2 * MM, play: 93.9 * MM, next: 99.5 * MM, r: 1.6 * MM, travel: 0.35 * MM },
  mic: 105.2 * MM, lamp: 108.0 * MM,
  clip: { y0: 90.6 * MM, y1: 130.4 * MM, w: 3.6 * MM },
  flag: { y0: 58 * MM, y1: 66 * MM, len: 24 * MM },
};
const PERIM = 2 * Math.PI * 5.5 * MM;   // длина окружности корпуса — ширина развёртки (u)

function rngFactory(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Тело вращения вокруг оси Y по профилю [[радиус, высота], ...] (мм). Нормали: у плавного перегиба — общие, у излома
// (больше 35°) — свои у каждой стороны. UV — развёртка: u по окружности (шов сзади, u = 0,5 — сторона кнопок),
// v — по длине ручки (0 — остриё, 1 — торец). Отрицательный радиус не бывает; профиль идёт подряд, наружу — «вправо» по ходу.
function revolve(THREE, prof, seg, L) {
  const P = prof.map((p) => [p[0] * MM, p[1] * MM]), n = P.length, sn = [];
  for (let i = 0; i < n - 1; i++) { const dr = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dr, dy) || 1; sn.push([dy / l, -dr / l]); }
  const rings = [];   // { r, y, nr, ny }
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? sn[i - 1] : null, b = i < n - 1 ? sn[i] : null;
    if (a && b && a[0] * b[0] + a[1] * b[1] > 0.82) { const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; rings.push({ r: P[i][0], y: P[i][1], nr: x / l, ny: y / l, seg: i }); }
    else { if (a) rings.push({ r: P[i][0], y: P[i][1], nr: a[0], ny: a[1], seg: i, end: true }); if (b) rings.push({ r: P[i][0], y: P[i][1], nr: b[0], ny: b[1], seg: i, start: true }); }
  }
  const pos = [], nor = [], uv = [], idx = [], nc = seg + 1;
  for (const q of rings) for (let j = 0; j <= seg; j++) {
    const u = j / seg, ph = -Math.PI + u * Math.PI * 2, sx = Math.sin(ph), cz = Math.cos(ph);
    pos.push(q.r * sx, q.y, q.r * cz); nor.push(q.nr * sx, q.ny, q.nr * cz); uv.push(u, q.y / L);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    if (rings[k].end && rings[k + 1].start && rings[k].seg === rings[k + 1].seg) continue;   // две копии одной точки излома
    for (let j = 0; j < seg; j++) { const a = k * nc + j, b = (k + 1) * nc + j, c = a + 1, d = b + 1; idx.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

// =====================================================================================
export function buildPen49(THREE, opts = {}) {
  const D = PEN49, { L, R } = D;
  const rel = (p) => { try { return new URL(p, import.meta.url).href; } catch (e) { return p; } };
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const smallWin = typeof innerWidth !== 'undefined' && Math.min(innerWidth, innerHeight) < 700;
  const o = Object.assign({ pbr: true, pbrBase: rel('./textures/pbr/'), anisotropy: 8, lowPower: coarse || smallWin, chromeEnv: 1, lacquerEnv: 1 }, opts);
  let mapSet = o.mapSet || (o.lowPower ? 'low' : 'full');
  const SEG = o.lowPower ? 48 : 96, KSEG = o.lowPower ? 20 : 32;
  const rng = rngFactory(4949);
  const disposables = [];
  const root = new THREE.Group(); root.name = 'pen49';
  // внутри ручка «стоит»: ось Y от острия (y = 0) к торцу (y = L); +Z — сторона кнопок, −X — сторона клипа.
  // Наружу она лежит: остриё на −X, клип сверху.
  const group = new THREE.Group(); group.name = 'pen49_body'; group.rotation.z = -Math.PI / 2; group.position.x = -L / 2; root.add(group);

  // ---------- карты ----------
  const loads = [], texReg = [];
  const packUrl = (file, set) => o.pbrBase + (set === 'full' ? 'pack/' : 'pack_' + set + '/') + file;
  function loadInto(t, url) {
    return new Promise((res) => {
      if (typeof Image === 'undefined') { res(false); return; }
      const img = new Image();
      img.onload = () => { if (t.image) t.dispose(); t.image = img; t.needsUpdate = true; res(true); };
      img.onerror = () => { console.warn('[pen49] нет карты ' + url); res(false); };
      img.src = url;
    });
  }
  function loadTex(file, srgb, repS, repT) {
    const t = new THREE.Texture();
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = o.anisotropy;
    if (repS) t.wrapS = THREE.RepeatWrapping; if (repT) t.wrapT = THREE.RepeatWrapping;
    disposables.push(t); texReg.push({ t, file }); loads.push(loadInto(t, packUrl(file, mapSet))); return t;
  }
  function canvasTex(c, srgb, rep) {
    const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = o.anisotropy;
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; disposables.push(t); return t;
  }
  // запасной рисунок (без карт): волосяные царапины в шероховатости
  function drawScratch(base) {
    const n = 512, c = mkCanvas(n, n), q = c.getContext('2d'); q.fillStyle = `rgb(255,${Math.round(base * 255)},0)`; q.fillRect(0, 0, n, n);
    for (let i = 0; i < 220; i++) { const x = rng() * n, y = rng() * n, a = rng() * 7, l = 8 + rng() * 60; q.strokeStyle = `rgba(255,${Math.round(110 + rng() * 80)},0,${0.2 + rng() * 0.4})`; q.lineWidth = 0.7; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); q.stroke(); }
    return c;
  }
  let M;
  if (o.pbr) {
    M = { body: { a: loadTex('body_a.jpg', true, true), n: loadTex('body_n.png', false, true), o: loadTex('body_orm.jpg', false, true) },
      chrome: { n: loadTex('chrome_n.png', false, true, true), o: loadTex('chrome_orm.jpg', false, true, true) },
      flag: o.label !== false ? { a: loadTex('flag_a.jpg', true) } : null };
  } else {
    M = { body: null, chrome: { n: null, o: canvasTex(drawScratch(0.10), false, true) }, flag: null };
  }
  const phys = (p) => { const m = new THREE.MeshPhysicalMaterial(p); disposables.push(m); return m; };
  // Лак: чёрная глянцевая эмаль по латуни (одна блестящая поверхность: царапины лежат прямо на ней). Хром: зеркальный металл с волосяными царапинами.
  const mLacq = M.body
    ? phys({ map: M.body.a, normalMap: M.body.n, normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: M.body.o, roughness: 1, metalness: 0, aoMap: M.body.o, aoMapIntensity: 0.6, ior: 1.5, envMapIntensity: o.lacquerEnv })
    : phys({ color: new THREE.Color(0.012, 0.012, 0.013), roughness: 0.06, metalness: 0, ior: 1.5, envMapIntensity: o.lacquerEnv });
  const mChromeBody = M.body
    ? phys({ map: M.body.a, normalMap: M.body.n, normalScale: new THREE.Vector2(0.15, 0.15), roughnessMap: M.body.o, roughness: 1, metalness: 1, envMapIntensity: o.chromeEnv })
    : phys({ color: new THREE.Color(0.82, 0.82, 0.83), roughness: 0.09, metalness: 1, envMapIntensity: o.chromeEnv });
  const mChrome = phys({ color: new THREE.Color(0.82, 0.82, 0.83), roughness: M.chrome.n ? 1 : 0.9, roughnessMap: M.chrome.o, normalMap: M.chrome.n, normalScale: new THREE.Vector2(0.15, 0.15), metalness: 1, envMapIntensity: o.chromeEnv });
  const mBrass = phys({ color: new THREE.Color(0.62, 0.50, 0.27), roughness: 0.28, metalness: 1 });
  const mDark = phys({ color: 0x040404, roughness: 0.8, metalness: 0 });
  const mHole = new THREE.MeshBasicMaterial({ color: 0x030303 }); disposables.push(mHole);   // отверстия: свет в них не попадает

  // ---------- сборка ----------
  let tris = 0, meshes = 0;
  const mesh = (geo, mat, name, cast = true, parent = group) => {
    const m = new THREE.Mesh(geo, mat); if (name) m.name = name; m.castShadow = cast; m.receiveShadow = true;
    parent.add(m); tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; meshes++; disposables.push(geo); return m;
  };
  const Lm = L / MM;
  // корпус по частям (мм): шарик и носик, хромовый конус, нижний ствол (лак), кольцо, верхний ствол (лак), колпачок с гнездом
  mesh(revolve(THREE, [[0, 0], [0.28, 0.06], [0.38, 0.3], [0.38, 0.7], [0.62, 0.75], [1.15, 3.2], [1.15, 3.45]], KSEG, L), mBrass, 'nib');
  mesh(revolve(THREE, [[1.15, 3.4], [1.5, 3.45], [1.62, 3.9], [2.35, 8.0], [3.2, 13.0], [3.95, 18.0], [4.38, 20.9], [4.5, 21.15], [4.5, 21.5]], SEG, L), mChromeBody, 'tip_cone');
  mesh(revolve(THREE, [[4.42, 21.45], [4.42, 21.6], [4.5, 21.68], [4.95, 35.0], [5.25, 50.0], [5.42, 65.0], [5.5, 78.92], [5.42, 79.0]], SEG, L), mLacq, 'barrel_lower');
  mesh(revolve(THREE, [[5.36, 78.98], [5.36, 79.22], [5.6, 79.3], [5.66, 79.48], [5.66, 80.92], [5.6, 81.1], [5.36, 81.18], [5.36, 81.42]], SEG, L), mChromeBody, 'ring');
  mesh(revolve(THREE, [[5.42, 81.4], [5.5, 81.48], [5.5, 129.22], [5.42, 129.3]], SEG, L), mLacq, 'barrel_upper');
  mesh(revolve(THREE, [[5.38, 129.28], [5.38, 129.5], [5.68, 129.58], [5.76, 129.8], [5.76, 131.6], [5.7, 131.85], [5.22, 138.1], [5.0, 139.3], [4.6, 139.85], [4.2, 140.0], [1.95, 140.0], [1.72, 139.86]], SEG, L), mChromeBody, 'cap');
  mesh(revolve(THREE, [[1.72, 139.9], [1.72, 138.6], [1.45, 138.5], [1.45, 134.0], [0, 134.0]], KSEG, L), mHole, 'jack', false);
  mesh(revolve(THREE, [[1.72, 139.2], [1.56, 139.15], [1.56, 138.7]], KSEG, L), mDark, 'jack_sleeve', false);

  // клип: хромовая полоса от колпачка вниз, конец с шариком касается ствола. Профиль — в плоскости (наружу от оси, вдоль ручки).
  {
    const C = D.clip, y0 = C.y0 / MM, y1 = C.y1 / MM, sh = new THREE.Shape(), X = (d) => -d * MM, Y = (y) => y * MM;
    // d — расстояние от оси в сторону клипа (локальная −X)
    sh.moveTo(X(5.3), Y(y1));                       // основание у колпачка
    sh.lineTo(X(7.3), Y(y1));
    sh.quadraticCurveTo(X(8.5), Y(y1), X(8.6), Y(y1 - 1.6));
    sh.lineTo(X(8.15), Y(y0 + 9));                  // внешняя сторона полосы — к концу чуть ниже
    sh.quadraticCurveTo(X(7.9), Y(y0 + 1.2), X(7.2), Y(y0 + 0.4));
    sh.quadraticCurveTo(X(6.2), Y(y0 - 0.5), X(5.62), Y(y0 + 0.9));   // шарик на конце, касается ствола
    sh.quadraticCurveTo(X(5.75), Y(y0 + 2.6), X(6.8), Y(y0 + 3.0));
    sh.quadraticCurveTo(X(7.05), Y(y0 + 3.4), X(7.15), Y(y0 + 9));    // внутренняя сторона полосы
    sh.lineTo(X(7.55), Y(y1 - 3.2));
    sh.quadraticCurveTo(X(7.5), Y(y1 - 2.2), X(6.6), Y(y1 - 2.2));
    sh.lineTo(X(5.3), Y(y1 - 2.2));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: C.w - 0.0007, bevelEnabled: true, bevelThickness: 0.00035, bevelSize: 0.00035, bevelSegments: 4, curveSegments: 16, steps: 1 });
    g.translate(0, 0, -(C.w - 0.0007) / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.02, uv.getY(i) / 0.02);   // плитка хрома 20 мм
    mesh(g, mChrome, 'clip');
  }

  // ---------- кнопки: три хромовых колпачка в ряд на стороне +Z ----------
  const keys = {}, B = D.buttons;
  {
    const prof = [[1.6, -0.5], [1.6, 0.2]]; for (let i = 1; i <= 12; i++) { const t = i / 12 * Math.PI / 2; prof.push([1.6 * Math.cos(t), 0.2 + 0.58 * Math.sin(t)]); }   // стенка и плавный купол
    const zB = Math.sqrt(R * R - B.r * B.r) + 0.00012;   // основание колпачка — у поверхности ствола
    for (const [name, y] of [['btn_prev', B.prev], ['btn_play', B.play], ['btn_next', B.next]]) {
      const g = new THREE.Group(); g.name = name; g.position.set(0, y, zB); group.add(g);
      const dome = revolve(THREE, prof, KSEG, L); dome.rotateX(Math.PI / 2);
      { const uv = dome.attributes.uv, pos = dome.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.02 + 0.37, pos.getY(i) / 0.02 + y / 0.02); }
      mesh(dome, mChrome, name + '_cap', true, g);
      const well = new THREE.CylinderGeometry(B.r + 0.00009, B.r + 0.00009, 0.0009, KSEG); well.rotateX(Math.PI / 2); well.translate(0, y, R + 0.00003 - 0.00045);
      mesh(well, mHole, name + '_well', false);
      keys[name] = { obj: g, axis: [0, 0, -1], travel: B.travel };
    }
  }
  // микрофон: три отверстия; лампочка: маленькая красная линза и пятно света на лаке
  let mLamp, mHalo;
  {
    const onBarrel = (geo, y, ph, lift) => { geo.rotateY(ph); geo.translate(Math.sin(ph) * (R + lift), y, Math.cos(ph) * (R + lift)); return geo; };
    const holes = [[D.mic - 0.00055, 0], [D.mic + 0.00045, 0.105], [D.mic + 0.00045, -0.105]];
    for (const [y, ph] of holes) mesh(onBarrel(new THREE.CircleGeometry(0.00028, 16), y, ph, 0.00002), mHole, 'mic_holes', false).raycast = () => {};
    mLamp = phys({ color: new THREE.Color(0.055, 0.004, 0.004), roughness: 0.12, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.85, emissive: new THREE.Color(1.0, 0.07, 0.03), emissiveIntensity: 0 });
    const rc = 0.0009, br = 0.00062, th = Math.asin(br / rc), dome = new THREE.SphereGeometry(rc, 18, 6, 0, Math.PI * 2, 0, th); dome.rotateX(Math.PI / 2); dome.translate(0, D.lamp, R - rc * Math.cos(th) + 0.00003);
    mesh(dome, mLamp, 'lamp', false).raycast = () => {};
    const hc = mkCanvas(64, 64), hx = hc.getContext('2d'), hg = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
    hg.addColorStop(0, 'rgba(255,70,40,1)'); hg.addColorStop(0.25, 'rgba(255,40,20,0.5)'); hg.addColorStop(1, 'rgba(255,20,10,0)'); hx.fillStyle = hg; hx.fillRect(0, 0, 64, 64);
    mHalo = new THREE.MeshBasicMaterial({ map: canvasTex(hc, true), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }); disposables.push(mHalo);
    const halo = mesh(new THREE.PlaneGeometry(0.0052, 0.0052), mHalo, 'lamp_glow', false); halo.position.set(0, D.lamp, R + 0.0004); halo.raycast = () => {}; halo.receiveShadow = false; halo.renderOrder = 5;
  }

  // ---------- флажок вещдока (LB-A): узкая бумажная полоска обёрнута вокруг нижнего ствола, концы склеены в флажок ----------
  if (M.flag) {
    const F = D.flag, w = F.y1 - F.y0, yc = (F.y0 + F.y1) / 2, rB = 5.36 * MM + 0.00012;   // радиус ствола в этом месте + бумага
    const mPaperF = phys({ map: M.flag.a, color: 0xd2d2d2, roughness: 0.88, metalness: 0, side: THREE.FrontSide });
    // петля вокруг ствола: чистая бумага (участок карты без печати: u 0…0,06)
    const loop = new THREE.CylinderGeometry(rB, rB, w, 40, 1, true);
    { const uv = loop.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01 + 0.04 * uv.getX(i), 0.52 + 0.4 * uv.getY(i)); }
    loop.translate(0, yc, 0); mesh(loop, mPaperF, 'flag_loop', false);
    // сам флажок: два слоя бумаги, склеенные; уходит от ствола в сторону клипа (локальная −X), чуть выгнут и скручен
    const NU = 24, NV = 6, mk2 = (side) => {
      const pos = [], uv = [], idx = [];
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const s = i / NU, t = j / NV, d = rB * 0.92 + s * F.len;                // d — от оси наружу
        const curl = 0.0016 * s * s + 0.0004 * Math.sin(s * 5.2) * (t - 0.5);   // лёгкий изгиб к зрителю и скрутка
        pos.push(-d, F.y0 + t * w + 0.0005 * s * s * (0.5 - t), curl + side * 0.00006);
        // карта флажка: верхняя половина — лицо (к зрителю), нижняя — оборот; u вдоль флажка от ствола
        uv.push(0.03 + s * 0.94, side > 0 ? 0.5 + 0.5 * (1 - t) : 0.5 * t);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d2 = c + 1; if (side > 0) idx.push(a, c, b, b, c, d2); else idx.push(a, b, c, b, d2, c); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    mesh(mk2(1), mPaperF, 'flag_49', true); mesh(mk2(-1), mPaperF, 'flag_49_back', true);
  }

  // ---------- нажатие кнопок (движение — в модуле, по времени) ----------
  const kst = {}; for (const n in keys) kst[n] = { t: 0, want: false, hold: 0 };
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const raf = typeof requestAnimationFrame !== 'undefined' ? (f) => requestAnimationFrame(f) : null;
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (t) => t * t * (3 - 2 * t);
  const home0 = new Map(); for (const n in keys) home0.set(keys[n].obj, keys[n].obj.position.clone());
  const applyKeys = () => { for (const n in keys) { const k = keys[n], e = ease(kst[n].t), p0 = home0.get(k.obj); k.obj.position.set(p0.x + k.axis[0] * k.travel * e, p0.y + k.axis[1] * k.travel * e, p0.z + k.axis[2] * k.travel * e); } };
  let keyAnim = false, keyLast = 0;
  function keyStep() {
    const t = nowMs(), dt = Math.min(50, Math.max(1, t - keyLast)); keyLast = t; let busy = false;
    for (const n in kst) { const k = kst[n], down = k.want || t < k.hold, target = down ? 1 : 0, sp = calm ? 1 : (down ? dt / 45 : dt / 80);
      if (k.t !== target) { k.t = target > k.t ? Math.min(1, k.t + sp) : Math.max(0, k.t - sp); busy = true; } else if (down && !k.want) busy = true; }
    applyKeys(); if (o.onChange) o.onChange();
    if (busy && raf) raf(keyStep); else keyAnim = false;
  }
  const kick = () => { if (!raf) { for (const n in kst) kst[n].t = kst[n].want ? 1 : 0; applyKeys(); if (o.onChange) o.onChange(); return; } if (!keyAnim) { keyAnim = true; keyLast = nowMs(); raf(keyStep); } };
  const setKeyPressed = (name, down) => { const k = kst[name]; if (!k) return false; k.want = !!down; if (down) k.hold = nowMs() + 90; kick(); return true; };
  const pressKey = (name, ms = 120) => { const k = kst[name]; if (!k) return false; k.want = false; k.hold = nowMs() + Math.max(90, ms); kick(); return true; };
  const keyFromHit = (hit) => { for (let ob = hit && hit.object; ob && ob !== root; ob = ob.parent) if (keys[ob.name]) return ob.name; return null; };

  // ---------- лампочка ----------
  let lampOn = false, blink = null;
  const lampShow = (v) => { mLamp.emissiveIntensity = 1.5 * v; mLamp.opacity = 0.85 + 0.12 * v; mHalo.opacity = 0.5 * v; if (o.onChange) o.onChange(); };
  const setLamp = (on) => { lampOn = !!on; if (!blink) lampShow(lampOn ? 1 : 0); };
  function blinkStep() {
    if (!blink) return;
    const t = nowMs() - blink.t0, per = 260, k = Math.floor(t / per);
    if (k >= blink.n) { blink = null; lampShow(lampOn ? 1 : 0); return; }
    const ph = (t % per) / per, v = ph < 0.5 ? 1 : 0;         // полпериода горит, полпериода нет
    lampShow(lampOn ? 1 - v : v);                              // если лампочка горит — мигание «провалом»
    raf(blinkStep);
  }
  const blinkLamp = (n = 1) => { if (!raf || calm) return; blink = { t0: nowMs(), n: Math.max(1, n) }; raf(blinkStep); };

  // своё окружение для зеркальных материалов (null — вернуть окружение сцены)
  const setEnv = (tex, k) => { for (const [m, base] of [[mChrome, o.chromeEnv], [mChromeBody, o.chromeEnv], [mLacq, o.lacquerEnv]]) { m.envMap = tex || null; m.envMapIntensity = tex && k != null ? k * base : base; m.needsUpdate = true; } if (o.onChange) o.onChange(); };

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
  Object.assign(root.userData, { ready, loadMapSet, mapSet, stats, dims: D, perim: PERIM,
    keys: Object.keys(keys), setKeyPressed, pressKey, keyFromHit, keyDepth: (n) => (kst[n] ? kst[n].t : 0),
    setEnv, setLamp, blinkLamp, lampOn: () => lampOn, lampBlinking: () => !!blink,
    dispose() { for (const d of disposables) d.dispose(); } });
  return root;
}
