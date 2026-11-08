import type { View } from '@bunker/shared';

/**
 * Схематичная 3D-комната (решение автора ROOM-B, 07.11.2026) — серая заглушка вместо будущих
 * нарисованных кадров (TECH_PLAN 4.0, R-A). Виды «Стол», «Слева», «Справа» — грани комнаты;
 * камера поворачивает голову, наклоняется к столу или отходит назад.
 *
 * Координаты CSS: x вправо, y вниз, z к зрителю. Единица длины — p (перспектива, px).
 * Камера = translateZ(p) · rotateX(−rx) · rotateY(−ry) · translate(−глаз);
 * грань  = translate(глаз + p·взгляд) · rotateY(ry) · rotateX(rx).
 * В своей позе произведение — единица: грань лежит ровно на экране, и в покое 3D можно
 * снять без скачка (текст остаётся чётким, мышь работает как на плоском экране).
 */

export type Op = ['translate', number, number, number] | ['rotateX', number] | ['rotateY', number];

export interface Pose {
  /** Глаз в долях p. */
  eye: [number, number, number];
  /** Наклон вниз, градусы. */
  rx: number;
  /** Поворот влево, градусы. */
  ry: number;
}

/** Центр крыла углового стола (стол вещдоков) в долях p: левее основного стола, к окну. */
export const WING_X = -1.04;
export const WING_Z = -0.6;
/** Стены комнаты в долях p: левая отодвинута — там крыло стола. */
export const ROOM_LEFT = -1.65;
export const ROOM_RIGHT = 1.2;

/**
 * Стол угловой (буквой Г): основная часть перед игроком, левое крыло — стол вещдоков
 * (решение автора 08.11, PC-A). «Слева» — крыло сверху: голова повёрнута влево и наклонена
 * к столу, дальний край крыла — вверху экрана, ближний к игроку — внизу. Общий вид —
 * с высоты сидящего человека, стол виден крупно.
 */
export const POSES: Record<View, Pose> = {
  desk: { eye: [0, -0.1, -0.35], rx: 90, ry: 0 },
  // Крыло на волосок ниже основного стола: где они сходятся, сверху лежит основной.
  left: { eye: [WING_X, -0.099, WING_Z], rx: 90, ry: 90 },
  right: { eye: [0.2, 0.25, -0.5], rx: 0, ry: -90 },
  room: { eye: [-0.2, 0, 2.05], rx: 17, ry: 0 },
};

/** Длительность перехода в общий вид комнаты и из него, мс. */
export const TRANSITION_MS = 650;
/** Длительность частых переходов между рабочими видами (стол ↔ доска, стол ↔ «Слева»), мс (MOVE-A). */
export const TRANSITION_NEAR_MS = 400;

/** Сколько длится переход: через общий вид — дольше, между рабочими видами — коротко (MOVE-A). */
export const transitionMs = (from: View, to: View): number =>
  from === 'room' || to === 'room' ? TRANSITION_MS : TRANSITION_NEAR_MS;

export const perspectiveFor = (vp: { width: number; height: number }): number =>
  Math.round(Math.max(vp.width, vp.height) * 0.75);

const rad = (d: number) => (d * Math.PI) / 180;

/** Куда смотрит камера (единичный вектор) — тот же поворот, что применяет браузер. */
function look(rx: number, ry: number): [number, number, number] {
  return [
    -Math.sin(rad(ry)) * Math.cos(rad(rx)),
    Math.sin(rad(rx)),
    -Math.cos(rad(ry)) * Math.cos(rad(rx)),
  ];
}

export function cameraOps(view: View, p: number): Op[] {
  return poseOps(POSES[view], p);
}

export function poseOps({ eye, rx, ry }: Pose, p: number): Op[] {
  return [
    ['translate', 0, 0, p],
    ['rotateX', -rx],
    ['rotateY', -ry],
    ['translate', -eye[0] * p, -eye[1] * p, -eye[2] * p],
  ];
}

/** Центр грани вида в мировых координатах, px. */
export function faceCenter(view: View, p: number): [number, number, number] {
  const { eye, rx, ry } = POSES[view];
  const d = look(rx, ry);
  return [(eye[0] + d[0]) * p, (eye[1] + d[1]) * p, (eye[2] + d[2]) * p];
}

export function faceOps(view: View, p: number): Op[] {
  const { rx, ry } = POSES[view];
  const [x, y, z] = faceCenter(view, p);
  return [
    ['translate', x, y, z],
    ['rotateY', ry],
    ['rotateX', rx],
  ];
}

/** Плоскость декора: центр (px), поворот как у грани. */
export const planeOps = (center: [number, number, number], rx: number, ry: number): Op[] => [
  ['translate', ...center],
  ['rotateY', ry],
  ['rotateX', rx],
];

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
  const dx = x - eye[0] * p;
  const dy = y - eye[1] * p;
  const dz = z - eye[2] * p;
  // rotateY(−ry)
  const cy = Math.cos(rad(-ry));
  const sy = Math.sin(rad(-ry));
  const x1 = dx * cy + dz * sy;
  const z1 = -dx * sy + dz * cy;
  // rotateX(−rx)
  const cx = Math.cos(rad(-rx));
  const sx = Math.sin(rad(-rx));
  const y2 = dy * cx - z1 * sx;
  const z2 = dy * sx + z1 * cx;
  return [x1, y2, z2 + p];
}

/** Координаты камеры → экран (перспектива CSS, центр экрана — точка схода). */
export const toScreen = ([x, y, z]: Vec3, p: number, vp: { width: number; height: number }) => {
  const k = p / (p - z);
  return { x: vp.width / 2 + x * k, y: vp.height / 2 + y * k };
};

const n = (v: number) => Number(v.toFixed(3));

export const toCss = (ops: Op[]): string =>
  ops
    .map((op) =>
      op[0] === 'translate'
        ? `translate3d(${n(op[1])}px, ${n(op[2])}px, ${n(op[3])}px)`
        : `${op[0]}(${n(op[1])}deg)`,
    )
    .join(' ');
