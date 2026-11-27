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
  /** Позы камеры: вид «Стол», «Стена» и вплотную к телефону следователя (6a-3). */
  poses: Record<CameraSpot, Pose>;
}

/** Куда смотрит камера: виды комнаты и телефон на столе крупно. */
export type CameraSpot = View | 'phone';

/**
 * Телефон следователя на столе (6a-3, DP-A; RS-A): центр (x, z), ширина, глубина, высота корпуса,
 * доли p (метры). Верх корпуса — плоскость с кнопками (DOM в той же 3D-сцене, что доска).
 */
// Справа от компьютера и ближе к игроку, у края стола (автор 25.11, фото стола и разметка на снимке).
// 25.11, вторая правка: меньше (scale) и правее, к правому краю стола; w, d, h — модели (26 × 16 см).
export const DESK_PHONE = { x: 0.79, z: 0.45, w: 0.26, d: 0.16, h: 0.07, scale: 0.84 };

/**
 * Камера вплотную к телефону (автор 20.11: «камера подлетает к телефону на столе»): взгляд сверху
 * под углом, телефон — около 60 % ширины экрана, чуть выше середины (внизу — что слышно).
 */
function phonePose(vp: Viewport, p: number, deskY: number): Pose {
  const pitch = 58;
  const dist = (DESK_PHONE.w * DESK_PHONE.scale * p) / (0.6 * vp.width);
  const a = rad(pitch);
  // Смотрим в точку чуть ближе к игроку середины телефона — он встаёт выше центра кадра.
  const tx = DESK_PHONE.x * p;
  const ty = deskY - DESK_PHONE.h * DESK_PHONE.scale * p;
  const tz = (DESK_PHONE.z + 0.035 * DESK_PHONE.scale) * p;
  return {
    eye: [tx, ty - Math.sin(a) * dist * p, tz + Math.cos(a) * dist * p],
    rx: pitch,
    ry: 0,
  };
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Поза стола: глаз сидящего — над столом на 50 см, на 45 см позади ближнего края (откинулся на стуле)
 * — виден почти весь стол, ближние вещи не раздуты перспективой (RS-A, автор 19.11). Автор 25.11:
 * камера — как была («стол очень большой, а стена далеко» при камере дальше); места на столе
 * прибавили меньшие вещи (DESK_SCALE в decor.ts). `back` — насколько отъехать назад (доли p).
 * Взгляд вниз ровно настолько, чтобы верх доски был у верхнего края экрана.
 */
function deskPose(vp: Viewport, p: number, deskY: number, boardHalfH: number, back: number): Pose {
  const eye: Pose['eye'] = [0, deskY - 0.5 * p, 0.9 * p + (0.45 + back) * p];
  const halfFov = deg(Math.atan(vp.height / 2 / p));
  const toBoardTop = deg(Math.atan((eye[1] + boardHalfH) / eye[2]));
  return { eye, rx: Math.max(0, halfFov - toBoardTop - 2.5), ry: 0 };
}

/** Где на экране (y, px) точка стола (z — доли p от стены, посередине). */
const deskScreenY = (vp: Viewport, p: number, deskY: number, pose: Pose, z: number) =>
  toScreen(toCamera([0, deskY, z * p], pose, p), p, vp).y;

/**
 * Ближний край стола, видный при окне 16 : 9 (доли p, RS-B, автор 27.11): при любой форме окна он в
 * кадре — окно ниже, камера отъезжает назад; вещи стола не двигаются, когда меняют окно.
 */
let nearRef: number | null = null;
export function nearRefOf(): number {
  if (nearRef !== null) return nearRef;
  const vp = { width: 1600, height: 900 };
  const p = perspectiveFor(vp);
  const boardHalfH = (BOARD_SCALE * vp.height) / 2;
  const deskY = boardHalfH + 0.12 * p;
  const pose = deskPose(vp, p, deskY, boardHalfH, 0);
  let lo = 0.3;
  let hi = 0.9;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (deskScreenY(vp, p, deskY, pose, mid) < vp.height) lo = mid;
    else hi = mid;
  }
  nearRef = lo;
  return lo;
}

export function roomFor(vp: Viewport): Room {
  const p = perspectiveFor(vp);
  const boardHalfW = (BOARD_SCALE * vp.width) / 2;
  const boardHalfH = (BOARD_SCALE * vp.height) / 2;
  const deskY = boardHalfH + 0.12 * p;
  const deskNear = 0.9 * p;
  // Окно ниже 16 : 9 (вышли из полноэкранного, панель браузера) — отъехать назад настолько, чтобы
  // ближний край, видный при 16 : 9, остался в кадре (RS-B).
  let back = 0;
  let pose = deskPose(vp, p, deskY, boardHalfH, back);
  while (back < 1.2 && deskScreenY(vp, p, deskY, pose, nearRefOf()) > vp.height) {
    back += 0.01;
    pose = deskPose(vp, p, deskY, boardHalfH, back);
  }
  const { eye, rx } = pose;
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
      phone: phonePose(vp, p, deskY),
    },
  };
}

/** Длительность перехода стол ↔ стена, мс (MOVE-A; плавнее — правка автора 10.11, было 450). */
export const TRANSITION_MS = 600;

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

/** Промежуточная поза: t = 0 … 1 (на концах — ровно сами позы, без погрешности сложения). */
export const lerpPose = (a: Pose, b: Pose, t: number): Pose =>
  t <= 0
    ? a
    : t >= 1
      ? b
      : {
          eye: [0, 1, 2].map(
            (i) => (a.eye[i] ?? 0) + ((b.eye[i] ?? 0) - (a.eye[i] ?? 0)) * t,
          ) as Pose['eye'],
          rx: a.rx + (b.rx - a.rx) * t,
          ry: a.ry + (b.ry - a.ry) * t,
        };

/**
 * Плавный разгон и торможение камеры — синусом (правка автора 10.11): пиковая скорость в
 * полтора раза выше средней (у прежней кубической — втрое), движение мягче.
 */
export const easeCamera = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

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
