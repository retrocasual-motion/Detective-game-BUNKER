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
  // Толщина — та же, что рисуется: высоты стопки и коробки листов совпадают, края не врезаются.
  sheet: [0.21, 0.297, 0.0025],
  folded: [0.21, 0.297, 0.004],
  stapled: [0.21, 0.297, 0.005],
  pack: [0.21, 0.297, 0.007],
  half: [0.21, 0.15, 0.0025],
  photos: [0.15, 0.1, 0.003],
  notebook: [0.148, 0.21, 0.008],
  disc: [0.125, 0.125, 0.005],
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
export function heights(pieces: readonly Piece[]): Map<string, number> {
  const sorted = [...pieces].sort((a, b) => a.layer - b.layer);
  const h = new Map<string, number>();
  sorted.forEach((p, i) => {
    let base = 0;
    for (let j = 0; j < i; j++) {
      const q = sorted[j] as Piece;
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

/** Вещь и всё, что лежит на ней (выше и хоть краем сверху, по цепочке): берётся вместе. */
export function pileOf(pieces: readonly Piece[], id: string): Piece[] {
  const base = pieces.find((p) => p.id === id);
  if (!base) return [];
  const pile = [base];
  const rest = pieces.filter((p) => p.layer > base.layer).sort((a, b) => a.layer - b.layer);
  for (const p of rest) if (pile.some((q) => overlap(p, q))) pile.push(p);
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
