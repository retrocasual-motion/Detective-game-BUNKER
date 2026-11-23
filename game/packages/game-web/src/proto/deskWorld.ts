/**
 * Прототип 3D-стола (автор 23.11): раскладка бумаг на столе — без физического движка
 * («физичность без физики»: стопка — порядок и высота, не столкновения). Метры стола: x — от
 * центра доски вправо, z — от стены к игроку; поворот `rot` — вокруг вертикали (как `yaw` в
 * `room/decor.ts`: + — передом вправо).
 */

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
}

export interface Piece extends Rect {
  id: string;
  kind: string;
  /** Толщина, м. */
  t: number;
  /** Порядок укладки: больше — положен позже, лежит выше. */
  layer: number;
  /** Стопка: листы, положенные друг на друга, — общий id. */
  stack: string;
}

/** Размеры по виду материала, м: ширина, глубина, толщина (толщина утрирована — край виден). */
const SIZE: Record<string, [number, number, number]> = {
  // Толщина — настоящая (автор 23.11: лесенка из листов «бам и вместе упали»): лист — 0,15 мм,
  // вынули нижний — остальные сдвигаются на долю пикселя, незаметно. Точности глубины сцены хватает
  // (у камеры near = 5 px: на расстоянии стола различает сотые доли пикселя).
  sheet: [0.21, 0.297, 0.00015],
  folded: [0.21, 0.297, 0.0004],
  stapled: [0.21, 0.297, 0.0006],
  pack: [0.21, 0.297, 0.0015],
  half: [0.21, 0.15, 0.00015],
  photos: [0.15, 0.1, 0.0003],
  notebook: [0.148, 0.21, 0.008],
  disc: [0.125, 0.125, 0.0015],
  // Изъятые устройства (без экранов в прототипе): телефон, ручка-диктофон, камера.
  mobile: [0.065, 0.12, 0.012],
  pen: [0.14, 0.014, 0.014],
  camera: [0.1, 0.06, 0.03],
};
export const sizeOf = (kind: string): [number, number, number] =>
  SIZE[kind] ?? (SIZE.sheet as [number, number, number]);

/** Четыре угла прямоугольника на столе. */
export function cornersOf(r: Rect): [number, number][] {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  const hw = r.w / 2;
  const hd = r.d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([u = 0, v = 0]) => [r.x + u * c + v * s, r.z - u * s + v * c]);
}

const axes = (r: Rect): [number, number][] => {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  return [
    [c, -s],
    [s, c],
  ];
};

/** Пересекаются ли два прямоугольника (разделяющие оси); касание — не пересечение. */
export function overlap(a: Rect, b: Rect, eps = 0.002): boolean {
  // Далеко друг от друга — сразу нет (поиск пути проверяет тысячи мест).
  const ra = Math.hypot(a.w, a.d) / 2;
  const rb = Math.hypot(b.w, b.d) / 2;
  if (Math.hypot(a.x - b.x, a.z - b.z) > ra + rb) return false;
  const ca = cornersOf(a);
  const cb = cornersOf(b);
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    const pa = ca.map(([x, z]) => x * ax + z * az);
    const pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps)
      return false;
  }
  return true;
}

/** Точка (x, z) внутри прямоугольника. */
export function contains(r: Rect, x: number, z: number): boolean {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  const dx = x - r.x;
  const dz = z - r.z;
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return Math.abs(u) <= r.w / 2 && Math.abs(v) <= r.d / 2;
}

/**
 * Высота низа каждого листа над столом, м: лежит на самом высоком из тех, что положены раньше и
 * под ним (хоть краем). Так и стопка, и листы внахлёст.
 */
export function heights(
  pieces: readonly Piece[],
  /** Что под вещью не поднимает её (лист над устройством — прогибается, DV-H). */
  ignore?: (upper: Piece, lower: Piece) => boolean,
): Map<string, number> {
  const sorted = [...pieces].sort((a, b) => a.layer - b.layer);
  const h = new Map<string, number>();
  sorted.forEach((p, i) => {
    let base = 0;
    for (let j = 0; j < i; j++) {
      const q = sorted[j] as Piece;
      if (ignore?.(p, q)) continue;
      if (overlap(p, q)) base = Math.max(base, (h.get(q.id) ?? 0) + q.t);
    }
    h.set(p.id, base);
  });
  return h;
}

/** Верхний лист под точкой (кроме `skip`): на него ляжет брошенный. */
export function topAt(
  pieces: readonly Piece[],
  x: number,
  z: number,
  skip: ReadonlySet<string> = new Set(),
): Piece | null {
  let best: Piece | null = null;
  for (const p of pieces)
    if (!skip.has(p.id) && contains(p, x, z) && (!best || p.layer > best.layer)) best = p;
  return best;
}

/** Листы одной стопки — снизу вверх. */
export const stackOf = (pieces: readonly Piece[], stack: string): Piece[] =>
  pieces.filter((p) => p.stack === stack).sort((a, b) => a.layer - b.layer);

/**
 * Где класть можно: точка стола видна (на столе и в кадре) и прямоугольник не заходит на вещи
 * следователя (компьютер, телефон, лампа, лоток, короб) — невидимая зона улик.
 */
export interface Zone {
  inside: (x: number, z: number) => boolean;
  blocked: readonly Rect[];
}

export function allowed(r: Rect, zone: Zone): boolean {
  for (const [x, z] of cornersOf(r)) if (!zone.inside(x, z)) return false;
  return !zone.blocked.some((b) => overlap(r, b));
}

/** Псевдослучайность с зерном: раскладка одна и та же при каждом запуске. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Высыпать содержимое конверта на стол: вещи ложатся вокруг `at` внахлёст, как брошенные, но у
 * каждой видна заметная часть (центры не ближе `gap`); все — в зоне улик. Кому места нет — ложится
 * на ближайший лист (стопкой).
 */
export function scatter(
  items: readonly { id: string; kind: string }[],
  zone: Zone,
  at: { x: number; z: number },
  seed = 7,
  gap = 0.12,
): Piece[] {
  const rand = rng(seed);
  const out: Piece[] = [];
  items.forEach((it, k) => {
    const [w, d, t] = sizeOf(it.kind);
    let placed: Piece | null = null;
    // Спираль от центра наружу.
    for (let step = 0; step < 400 && !placed; step++) {
      const a = step * 0.9 + rand() * 0.4;
      const rad = 0.02 + step * 0.006;
      const cand: Piece = {
        id: it.id,
        kind: it.kind,
        w,
        d,
        t,
        x: at.x + Math.cos(a) * rad * 1.5,
        z: at.z + Math.sin(a) * rad,
        rot: (rand() - 0.5) * 0.35,
        layer: k,
        stack: it.id,
      };
      if (!allowed(cand, zone)) continue;
      if (out.some((o) => Math.hypot(o.x - cand.x, o.z - cand.z) < gap)) continue;
      placed = cand;
    }
    if (!placed) {
      const under = out[out.length - 1];
      placed = {
        id: it.id,
        kind: it.kind,
        w,
        d,
        t,
        x: under ? under.x + 0.01 : at.x,
        z: under ? under.z + 0.01 : at.z,
        rot: under ? under.rot + 0.03 : 0,
        layer: k,
        stack: under ? under.stack : it.id,
      };
    }
    out.push(placed);
  });
  return out;
}

/**
 * Сдвинуть вещи (лист или несколько) к цели, не выходя из зоны: шагами, а упёрлись — скользят
 * вдоль края или вещи следователя (сначала по x, потом по z). Сквозь телефон не проскочить: шаг
 * мелкий. Возвращает сдвиг, который удалось сделать.
 */
export function slide(
  rects: readonly Rect[],
  dx: number,
  dz: number,
  zone: Zone,
  step = 0.006,
): { dx: number; dz: number } {
  const ok = (ox: number, oz: number) =>
    rects.every((r) => allowed({ ...r, x: r.x + ox, z: r.z + oz }, zone));
  let cx = 0;
  let cz = 0;
  const clip = (v: number) => Math.max(-step, Math.min(step, v));
  const n = Math.ceil((Math.abs(dx) + Math.abs(dz)) / step) + 4;
  for (let i = 0; i < n; i++) {
    let sx = dx - cx;
    let sz = dz - cz;
    const len = Math.hypot(sx, sz);
    if (len < 1e-5) break;
    if (len > step) {
      sx = (sx / len) * step;
      sz = (sz / len) * step;
    }
    // Вдоль препятствия — полным шагом по свободной оси.
    const ax = clip(dx - cx);
    const az = clip(dz - cz);
    if (ok(cx + sx, cz + sz)) {
      cx += sx;
      cz += sz;
    } else if (ax && ok(cx + ax, cz)) cx += ax;
    else if (az && ok(cx, cz + az)) cz += az;
    else break;
  }
  return { dx: cx, dz: cz };
}

/**
 * Вещь и то, что лежит прямо на ней (середина — над её серединной частью; по цепочке): берётся
 * вместе. Листы внахлёст «лесенкой» стопкой не считаются (автор 23.11: «все вверх полетели»).
 */
export function pileOf(pieces: readonly Piece[], id: string): Piece[] {
  const base = pieces.find((p) => p.id === id);
  if (!base) return [];
  const pile = [base];
  const rest = pieces.filter((p) => p.layer > base.layer).sort((a, b) => a.layer - b.layer);
  const onTop = (p: Piece, q: Piece) => contains({ ...q, w: q.w * 0.5, d: q.d * 0.5 }, p.x, p.z);
  for (const p of rest) if (pile.some((q) => onTop(p, q))) pile.push(p);
  return pile;
}

/**
 * Ближайшее к месту место, где вещи (лист, стопка) можно положить: само место, если можно, иначе —
 * по кольцам вокруг (шаг 1 см). Отпустили на телефон — встаёт рядом с той стороны, к которой ближе.
 */
export function nearestFree(
  rects: readonly Rect[],
  zone: Zone,
  maxR = 0.5,
  step = 0.008,
): { dx: number; dz: number } | null {
  const ok = (ox: number, oz: number) =>
    rects.every((r) => allowed({ ...r, x: r.x + ox, z: r.z + oz }, zone));
  if (ok(0, 0)) return { dx: 0, dz: 0 };
  for (let r = step; r <= maxR; r += step) {
    const n = Math.max(16, Math.ceil((2 * Math.PI * r) / step));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const dx = Math.cos(a) * r;
      const dz = Math.sin(a) * r;
      if (ok(dx, dz)) return { dx, dz };
    }
  }
  return null;
}

/**
 * Куда вести вещь в руке (автор 23.11: «сверху он не может быть… плавно оказывается справа»;
 * «вибрирует туда-сюда, когда справа места нет»). `ok(ox, oz)` — можно ли вещи стоять со сдвигом.
 *
 * Путь к мыши свободен — прямо к ней. Нет — поиск по сетке (шаг `cell`) от того места, где вещь
 * сейчас: из достижимых мест — ближайшее к мыши; путь к нему — кратчайший, в обход устройств и вещей
 * следователя; по пути — к дальней точке, видной напрямую. Ближе к мыши подойти нельзя — вещь стоит
 * (не дрожит). За раз — не дальше `maxPath` по обходу.
 */
export function plan(
  ok: (ox: number, oz: number) => boolean,
  cur: { x: number; z: number },
  want: { x: number; z: number },
  {
    maxPath = 0.03,
    cell = 0.012,
    radius = 0.36,
    maxNodes = 2600,
  }: { maxPath?: number; cell?: number; radius?: number; maxNodes?: number } = {},
): { x: number; z: number } {
  const clear = (ax: number, az: number, bx: number, bz: number) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.004);
    for (let i = 1; i <= n; i++)
      if (!ok(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
    return true;
  };
  if (ok(want.x, want.z) && clear(cur.x, cur.z, want.x, want.z)) return { x: want.x, z: want.z };
  // Поиск в ширину по сетке вокруг вещи.
  const R = Math.round(radius / cell);
  const key = (i: number, j: number) => (i + R) * (2 * R + 1) + (j + R);
  const pt = (i: number, j: number) => ({ x: cur.x + i * cell, z: cur.z + j * cell });
  const parent = new Map<number, number>();
  const queue: [number, number][] = [[0, 0]];
  parent.set(key(0, 0), -1);
  const d0 = Math.hypot(cur.x - want.x, cur.z - want.z);
  let best: [number, number] = [0, 0];
  let bestD = d0;
  for (let q = 0; q < queue.length && parent.size < maxNodes; q++) {
    const [i, j] = queue[q] as [number, number];
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (Math.abs(ni) > R || Math.abs(nj) > R) continue;
      const kk = key(ni, nj);
      if (parent.has(kk)) continue;
      const p = pt(ni, nj);
      // Диагональ — только если обе соседние клетки свободны (не срезать угол устройства).
      if (
        !ok(p.x, p.z) ||
        (di &&
          dj &&
          (!ok(cur.x + ni * cell, cur.z + j * cell) || !ok(cur.x + i * cell, cur.z + nj * cell)))
      ) {
        parent.set(kk, -2);
        continue;
      }
      parent.set(kk, key(i, j));
      queue.push([ni, nj]);
      const d = Math.hypot(p.x - want.x, p.z - want.z);
      if (d < bestD - 1e-6) {
        bestD = d;
        best = [ni, nj];
      }
    }
  }
  // Ближе к мыши не подойти — стоит на месте.
  if (bestD > d0 - 0.005) return { x: cur.x, z: cur.z };
  // Путь от лучшего места назад к началу.
  const path: { x: number; z: number }[] = [];
  let kk = key(best[0], best[1]);
  while (kk >= 0) {
    const i = Math.floor(kk / (2 * R + 1)) - R;
    const j = (kk % (2 * R + 1)) - R;
    path.push(pt(i, j));
    kk = parent.get(kk) ?? -1;
  }
  path.reverse();
  // К дальней точке пути, видной напрямую.
  let tgt = path[1] ?? path[0] ?? cur;
  for (let n = path.length - 1; n >= 1; n--) {
    const p = path[n] as { x: number; z: number };
    if (clear(cur.x, cur.z, p.x, p.z)) {
      tgt = p;
      break;
    }
  }
  const dx = tgt.x - cur.x;
  const dz = tgt.z - cur.z;
  const l = Math.hypot(dx, dz);
  if (l <= maxPath) return { x: tgt.x, z: tgt.z };
  return { x: cur.x + (dx / l) * maxPath, z: cur.z + (dz / l) * maxPath };
}

/** Сетка прогиба листа: столько делений по ширине и глубине. */
export const DRAPE_NX = 10;
export const DRAPE_NY = 14;
/** Зазор бумаги над устройством, м. */
const GAP = 0.001;
/** Поле вокруг устройства, где бумага держит полную высоту, м (больше шага сетки листа). */
const MARGIN = 0.025;

/**
 * Прогиб листов (DV-H, автор 23.11: «положить сверху — немного огибает, легонько»): лист лежит на
 * своей высоте (по бумагам под ним), а там, где под ним устройство или горбик нижнего листа, —
 * приподнят до их верха; подъём расходится полого на `radius` вокруг (широкий горбик, без излома).
 * Возвращает подъём каждой вершины сетки, м: ряды от дальнего края листа к ближнему, в ряду —
 * слева направо; ровный лист — нет записи.
 */
export function drapes(
  pieces: readonly Piece[],
  base: ReadonlyMap<string, number>,
  bends: (p: Piece) => boolean,
  radius = 0.07,
): Map<string, Float32Array> {
  const out = new Map<string, Float32Array>();
  const sorted = [...pieces].sort((a, b) => a.layer - b.layer);
  const nx = DRAPE_NX;
  const ny = DRAPE_NY;
  const vert = (p: Piece, ix: number, iy: number) => {
    const u = -p.w / 2 + (ix * p.w) / nx;
    const v = -p.d / 2 + (iy * p.d) / ny;
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    return { x: p.x + u * c + v * s, z: p.z - u * s + v * c };
  };
  const sample = (o: Piece, lift: Float32Array, x: number, z: number) => {
    const c = Math.cos(o.rot);
    const s = Math.sin(o.rot);
    const dx = x - o.x;
    const dz = z - o.z;
    const u = dx * c - dz * s;
    const v = dx * s + dz * c;
    const fx = Math.min(nx, Math.max(0, ((u + o.w / 2) / o.w) * nx));
    const fy = Math.min(ny, Math.max(0, ((v + o.d / 2) / o.d) * ny));
    const x0 = Math.min(nx - 1, Math.floor(fx));
    const y0 = Math.min(ny - 1, Math.floor(fy));
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (i: number, j: number) => lift[j * (nx + 1) + i] ?? 0;
    return (
      at(x0, y0) * (1 - tx) * (1 - ty) +
      at(x0 + 1, y0) * tx * (1 - ty) +
      at(x0, y0 + 1) * (1 - tx) * ty +
      at(x0 + 1, y0 + 1) * tx * ty
    );
  };
  // Верх вещи o в точке (x, z): у листа — с его горбиком. Устройство — с полем на шаг сетки листа:
  // между вершинами бумага не проваливается на его край.
  const surface = (o: Piece, x: number, z: number) => {
    const grow = bends(o) ? 0 : MARGIN;
    if (!contains({ ...o, w: o.w + grow * 2, d: o.d + grow * 2 }, x, z))
      return Number.NEGATIVE_INFINITY;
    const top = (base.get(o.id) ?? 0) + o.t;
    const l = out.get(o.id);
    return l ? top + sample(o, l, x, z) : top;
  };
  for (const [i, p] of sorted.entries()) {
    if (!bends(p)) continue;
    const below = sorted
      .slice(0, i)
      .filter((o) => overlap(p, bends(o) ? o : { ...o, w: o.w + MARGIN * 2, d: o.d + MARGIN * 2 }));
    if (!below.length) continue;
    const b0 = base.get(p.id) ?? 0;
    const raw = new Float32Array((nx + 1) * (ny + 1));
    const pts: { x: number; z: number }[] = [];
    let any = false;
    for (let iy = 0; iy <= ny; iy++)
      for (let ix = 0; ix <= nx; ix++) {
        const q = vert(p, ix, iy);
        pts.push(q);
        let req = 0;
        // Над устройством — с зазором в миллиметр: поверхности не совпадают (иначе верх камеры
        // «пробивает» бумагу).
        for (const o of below) {
          const top = surface(o, q.x, q.z) - b0;
          if (top > 1e-5) req = Math.max(req, top + GAP);
        }
        const k = iy * (nx + 1) + ix;
        raw[k] = Math.max(0, req);
        if (raw[k] > 1e-5) any = true;
      }
    if (!any) continue;
    // Полого: подъём расходится косинусом на radius — горбик, а не ступенька.
    const lift = new Float32Array(raw.length);
    for (let a = 0; a < raw.length; a++) {
      const pa = pts[a] as { x: number; z: number };
      let m = raw[a] ?? 0;
      for (let bI = 0; bI < raw.length; bI++) {
        const rb = raw[bI] ?? 0;
        if (rb <= m) continue;
        const pb = pts[bI] as { x: number; z: number };
        const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        if (d >= radius) continue;
        m = Math.max(m, (rb * (1 + Math.cos((Math.PI * d) / radius))) / 2);
      }
      lift[a] = m;
    }
    out.set(p.id, lift);
  }
  return out;
}
