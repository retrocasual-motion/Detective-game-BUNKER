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
  sheet: [0.21, 0.297, 0.0015],
  folded: [0.21, 0.297, 0.003],
  stapled: [0.21, 0.297, 0.004],
  pack: [0.21, 0.297, 0.006],
  half: [0.21, 0.15, 0.0015],
  photos: [0.15, 0.1, 0.002],
  notebook: [0.148, 0.21, 0.008],
  disc: [0.125, 0.125, 0.004],
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
