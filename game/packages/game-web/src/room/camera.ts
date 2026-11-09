import type { View } from '@bunker/shared';

/**
 * Комната следователя — серая заглушка вместо будущих нарисованных кадров (R-A). Решение
 * автора 08.11 («Стена»): два вида. «Стол» — от первого лица, сидя за столом: стол в
 * перспективе, за ним на стене пробковая доска. «Стена» — доска во весь экран (рабочая
 * поверхность). Переход — камера поднимает взгляд и подъезжает к доске.
 *
 * Координаты CSS: x вправо, y вниз, z к зрителю, px. Центр доски — начало координат,
 * доска смотрит на +z. Камера = translateZ(p) · rotateX(−rx) · rotateY(−ry) · translate(−глаз).
 * Доска — DOM размером с экран, уменьшенная в s раз (scale). В позе «Стена» глаз стоит
 * в s·p от неё: камера × доска проецируется ровно на экран, и в покое 3D снимается без
 * скачка (текст чёткий, мышь работает как на плоском экране).
 */

export type Op =
  | ['translate', number, number, number]
  | ['rotateX', number]
  | ['rotateY', number]
  | ['scale', number];

export interface Pose {
  /** Глаз, px. */
  eye: [number, number, number];
  /** Наклон вниз, градусы. */
  rx: number;
  /** Поворот влево, градусы. */
  ry: number;
}

export type Viewport = { width: number; height: number };

/** Перспектива в долях большей стороны экрана: меньше — шире угол зрения (стол ближе). */
export const PERSPECTIVE_K = 0.5;
/** Доска в мире — экран, уменьшенный в столько раз. */
export const BOARD_SCALE = 0.55;

export const perspectiveFor = (vp: Viewport): number =>
  Math.round(Math.max(vp.width, vp.height) * PERSPECTIVE_K);

/** Стол и комната, px (вычисляются от экрана: доска — его копия). */
export interface Room {
  p: number;
  vp: Viewport;
  /** Половины доски. */
  boardHalfW: number;
  boardHalfH: number;
  /** Верх столешницы (y). */
  deskY: number;
  /** Ближний к игроку край стола (z); дальний — у стены, z = 0. */
  deskNear: number;
  deskLeft: number;
  deskRight: number;
  poses: Record<View, Pose>;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function roomFor(vp: Viewport): Room {
  const p = perspectiveFor(vp);
  const boardHalfW = (BOARD_SCALE * vp.width) / 2;
  const boardHalfH = (BOARD_SCALE * vp.height) / 2;
  const deskY = boardHalfH + 0.12 * p;
  const deskNear = 0.9 * p;
  // Глаз сидящего: над столом, чуть позади ближнего края.
  const eye: Pose['eye'] = [0, deskY - 0.48 * p, deskNear + 0.3 * p];
  // Взгляд вниз ровно настолько, чтобы верх доски был у верхнего края экрана.
  const halfFov = deg(Math.atan(vp.height / 2 / p));
  const toBoardTop = deg(Math.atan((eye[1] + boardHalfH) / eye[2]));
  const rx = Math.max(0, halfFov - toBoardTop - 2.5);
  return {
    p,
    vp,
    boardHalfW,
    boardHalfH,
    deskY,
    deskNear,
    deskLeft: -1.15 * p,
    deskRight: 1.05 * p,
    poses: {
      desk: { eye, rx, ry: 0 },
      wall: { eye: [0, 0, BOARD_SCALE * p], rx: 0, ry: 0 },
    },
  };
}

/** Длительность перехода стол ↔ стена, мс (MOVE-A: частый переход — коротко). */
export const TRANSITION_MS = 450;

/** Доска: центр в начале координат, уменьшена в s раз. */
export const boardOps = (): Op[] => [['scale', BOARD_SCALE]];

export function poseOps({ eye, rx, ry }: Pose, p: number): Op[] {
  return [
    ['translate', 0, 0, p],
    ['rotateX', -rx],
    ['rotateY', -ry],
    ['translate', -eye[0], -eye[1], -eye[2]],
  ];
}

/** Промежуточная поза: t = 0 … 1. */
export const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  eye: [0, 1, 2].map(
    (i) => (a.eye[i] ?? 0) + ((b.eye[i] ?? 0) - (a.eye[i] ?? 0)) * t,
  ) as Pose['eye'],
  rx: a.rx + (b.rx - a.rx) * t,
  ry: a.ry + (b.ry - a.ry) * t,
});

/** Плавный разгон и торможение камеры. */
export const easeCamera = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export type Vec3 = [number, number, number];

/** Точка мира → координаты камеры CSS (зритель в z = p), та же цепочка, что poseOps. */
export function toCamera([x, y, z]: Vec3, { eye, rx, ry }: Pose, p: number): Vec3 {
  const dx = x - eye[0];
  const dy = y - eye[1];
  const dz = z - eye[2];
  const cy = Math.cos(rad(-ry));
  const sy = Math.sin(rad(-ry));
  const x1 = dx * cy + dz * sy;
  const z1 = -dx * sy + dz * cy;
  const cx = Math.cos(rad(-rx));
  const sx = Math.sin(rad(-rx));
  const y2 = dy * cx - z1 * sx;
  const z2 = dy * sx + z1 * cx;
  return [x1, y2, z2 + p];
}

/** Координаты камеры → экран (перспектива CSS, центр экрана — точка схода). */
export const toScreen = ([x, y, z]: Vec3, p: number, vp: Viewport) => {
  const k = p / (p - z);
  return { x: vp.width / 2 + x * k, y: vp.height / 2 + y * k };
};

const n = (v: number) => Number(v.toFixed(4));

export const toCss = (ops: Op[]): string =>
  ops
    .map((op) => {
      if (op[0] === 'translate') return `translate3d(${n(op[1])}px, ${n(op[2])}px, ${n(op[3])}px)`;
      if (op[0] === 'scale') return `scale(${n(op[1])})`;
      return `${op[0]}(${n(op[1])}deg)`;
    })
    .join(' ');

/** Координаты камеры → мир: обратное к toCamera. */
function fromCamera([a, b, c]: Vec3, { eye, rx, ry }: Pose, p: number): Vec3 {
  const cx = Math.cos(rad(-rx));
  const sx = Math.sin(rad(-rx));
  const y2 = b;
  const z2 = c - p;
  const dy = y2 * cx + z2 * sx;
  const z1 = -y2 * sx + z2 * cx;
  const cy = Math.cos(rad(-ry));
  const sy = Math.sin(rad(-ry));
  const dx = a * cy - z1 * sy;
  const dz = a * sy + z1 * cy;
  return [eye[0] + dx, eye[1] + dy, eye[2] + dz];
}

/**
 * Точка экрана → точка на доске (в пикселях доски-экрана, от её левого верхнего угла) или
 * null, если луч взгляда не попадает в доску. Нужна, чтобы со стола бросить лист на доску.
 */
export function screenToBoard(
  pt: { x: number; y: number },
  pose: Pose,
  room: Room,
): { x: number; y: number } | null {
  const { p, vp } = room;
  const viewer = fromCamera([0, 0, p], pose, p);
  const onScreen = fromCamera([pt.x - vp.width / 2, pt.y - vp.height / 2, 0], pose, p);
  const dz = onScreen[2] - viewer[2];
  if (Math.abs(dz) < 1e-9) return null;
  const t = -viewer[2] / dz;
  if (t <= 0) return null;
  const wx = viewer[0] + (onScreen[0] - viewer[0]) * t;
  const wy = viewer[1] + (onScreen[1] - viewer[1]) * t;
  const x = wx / BOARD_SCALE + vp.width / 2;
  const y = wy / BOARD_SCALE + vp.height / 2;
  if (x < 0 || y < 0 || x > vp.width || y > vp.height) return null;
  return { x, y };
}
