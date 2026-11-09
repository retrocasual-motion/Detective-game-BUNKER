import { type Pose, type Room, toCamera, toScreen, type Vec3 } from './camera.ts';

/**
 * Серый декор комнаты и предметы на столе (черновик «Стены», 08.11) — на холстах своей
 * проекцией. Задний холст: стены, пол, рама доски, столешница. Передний (поверх доски):
 * предметы на столе — монитор, клавиатура, лампа, телефон, изъятые устройства, коробка
 * с пакетами вещдоков. Этап дизайна заменит всё нарисованным кадром (R-A).
 */

export interface Poly {
  pts: Vec3[];
  color: string;
}

/** Что делает щелчок по предмету: компьютер или материал дела (устройство). */
export type Hotspot = { kind: 'computer' } | { kind: 'material'; id: string };

interface Box {
  min: Vec3;
  max: Vec3;
  color: string;
  /** Цвет экрана на передней грани (монитор). */
  screen?: string;
}

export interface DeskObject {
  key: string;
  label: string;
  boxes: Box[];
  hotspot?: Hotspot;
  /** Бумажный ярлык под предметом: «Изъято · 47», «Входящие». */
  tag?: string;
  /** Для автотестов. */
  testId?: string;
}

/** Сколько писем лотка видно стоящими (остальные — за ними). */
export const INBOX_SHOWN = 6;

/**
 * Лоток «Входящие» (правка автора 09.11): письма стоят вертикально, свежее — впереди; у
 * задних видна верхняя полоска. Щелчок по письму — прочитать (и «На стену»).
 */
function inboxObjects(r: Room, col: Col, inbox: string[]): DeskObject[] {
  const { p, deskY } = r;
  const at = (x: number, z: number, w: number, d: number, h: number, color: string, lift = 0) => ({
    min: [(x - w / 2) * p, deskY - (lift + h) * p, (z - d / 2) * p] as Vec3,
    max: [(x + w / 2) * p, deskY - lift * p, (z + d / 2) * p] as Vec3,
    color,
  });
  // Справа на столе, слева от лампы (правка автора 09.11).
  const X = 0.5;
  const Z = 0.2;
  const tray = col('--color-tray');
  const shown = inbox.slice(0, INBOX_SHOWN);
  // Задние — первыми (художник и порядок щелчков: переднее письмо — поверх).
  const letters: DeskObject[] = shown
    .map((id, k) => ({
      key: `inbox-${id}`,
      label: `Входящие: ${id}`,
      boxes: [
        at(
          X,
          Z + 0.035 - k * 0.022,
          0.2,
          0.004,
          0.15 + k * 0.016,
          col('--color-paper-sheet'),
          0.012,
        ),
      ],
      hotspot: { kind: 'material' as const, id },
      testId: `inbox-${id}`,
    }))
    .reverse();
  return [
    {
      key: 'inbox-back',
      label: 'Входящие',
      boxes: [at(X, Z, 0.26, 0.16, 0.012, tray), at(X, Z - 0.075, 0.26, 0.01, 0.07, tray, 0.012)],
      tag: inbox.length ? `Входящие · ${inbox.length}` : 'Входящие',
      testId: 'inbox-tray',
    },
    ...letters,
    {
      key: 'inbox-front',
      label: 'Входящие',
      boxes: [at(X, Z + 0.075, 0.26, 0.01, 0.045, tray, 0.012)],
    },
  ];
}

const rect = (c: Vec3, u: Vec3, v: Vec3): Vec3[] => [
  [c[0] - u[0] - v[0], c[1] - u[1] - v[1], c[2] - u[2] - v[2]],
  [c[0] + u[0] - v[0], c[1] + u[1] - v[1], c[2] + u[2] - v[2]],
  [c[0] + u[0] + v[0], c[1] + u[1] + v[1], c[2] + u[2] + v[2]],
  [c[0] - u[0] + v[0], c[1] - u[1] + v[1], c[2] - u[2] + v[2]],
];

type Col = (name: string) => string;

/** Стены, пол, рама доски, столешница — от дальнего к ближнему. */
export function roomPolys(r: Room, col: Col): Poly[] {
  const { p, deskY, deskNear, deskLeft, deskRight, boardHalfW, boardHalfH } = r;
  const left = -1.7 * p;
  const right = 1.7 * p;
  const top = -1.4 * p;
  const floor = deskY + 0.75 * p;
  const back = -6;
  const front = deskNear + 1.2 * p;
  const yc = (top + floor) / 2;
  const hy = (floor - top) / 2;
  const zc = (back + front) / 2;
  const hz = (front - back) / 2;
  const frame = 0.035 * p;
  const deskXc = (deskLeft + deskRight) / 2;
  const deskHx = (deskRight - deskLeft) / 2;
  const edge = 0.04 * p;
  return [
    { pts: rect([0, floor, zc], [right, 0, 0], [0, 0, hz]), color: col('--color-room-floor') },
    { pts: rect([0, top, zc], [right, 0, 0], [0, 0, hz]), color: col('--color-room-dark') },
    { pts: rect([left, yc, zc], [0, 0, hz], [0, hy, 0]), color: col('--color-room-wall') },
    { pts: rect([right, yc, zc], [0, 0, hz], [0, hy, 0]), color: col('--color-room-wall') },
    { pts: rect([0, yc, back], [right, 0, 0], [0, hy, 0]), color: col('--color-room-wall-front') },
    // Рама доски — чуть больше самой доски (DOM поверх).
    {
      pts: rect([0, 0, -3], [boardHalfW + frame, 0, 0], [0, boardHalfH + frame, 0]),
      color: col('--color-board-frame'),
    },
    {
      pts: rect([deskXc, deskY, deskNear / 2], [deskHx, 0, 0], [0, 0, deskNear / 2]),
      color: col('--color-desk'),
    },
    {
      pts: rect([deskXc, deskY + edge / 2, deskNear], [deskHx, 0, 0], [0, edge / 2, 0]),
      color: col('--color-desk-edge'),
    },
  ];
}

/**
 * Предметы на столе. Положение — в долях p: x от центра доски, z от стены, h — высота.
 * Устройства — из описи (24, 47–50); пакеты 40–46 лежат в коробке.
 */
export function deskObjects(r: Room, col: Col, inbox: string[] = []): DeskObject[] {
  const { p, deskY } = r;
  const box = (
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: string,
    lift = 0,
  ): Box => ({
    min: [(x - w / 2) * p, deskY - (lift + h) * p, (z - d / 2) * p],
    max: [(x + w / 2) * p, deskY - lift * p, (z + d / 2) * p],
    color,
  });
  const device = col('--color-device');
  const edge = col('--color-device-edge');
  const monitor = box(-0.66, 0.2, 0.32, 0.24, 0.25, col('--color-monitor'), 0.04);
  monitor.screen = col('--color-screen');
  return [
    ...inboxObjects(r, col, inbox),
    {
      key: 'lamp',
      label: 'Лампа',
      boxes: [
        box(0.86, 0.12, 0.11, 0.11, 0.02, edge),
        box(0.86, 0.12, 0.018, 0.018, 0.3, edge, 0.02),
        box(0.8, 0.15, 0.14, 0.12, 0.06, col('--color-lamp'), 0.28),
      ],
    },
    {
      key: 'radio',
      label: 'Радиопост: стойка и запись регистратора',
      boxes: [box(0.12, 0.12, 0.26, 0.16, 0.1, device)],
      hotspot: { kind: 'material', id: '50' },
      tag: 'Изъято · 50',
      testId: 'device-50',
    },
    {
      key: 'bags',
      label: 'Коробка: личные вещи членов группы (40–46)',
      boxes: [
        box(-0.3, 0.16, 0.24, 0.18, 0.1, col('--color-box')),
        box(-0.32, 0.15, 0.17, 0.12, 0.02, col('--color-bag'), 0.1),
      ],
      tag: 'Личные вещи · 40–46',
      testId: 'bags-box',
    },
    {
      key: 'monitor',
      label: 'Компьютер следователя',
      boxes: [box(-0.66, 0.22, 0.12, 0.1, 0.04, edge), monitor],
      hotspot: { kind: 'computer' },
    },
    {
      key: 'laptop',
      label: 'Ноутбук руководителя',
      boxes: [box(-0.1, 0.44, 0.28, 0.2, 0.022, device)],
      hotspot: { kind: 'material', id: '47' },
      tag: 'Изъято · 47',
      testId: 'device-47',
    },
    {
      key: 'pen',
      label: 'Ручка-диктофон',
      boxes: [box(0.17, 0.36, 0.14, 0.016, 0.016, edge)],
      hotspot: { kind: 'material', id: '49' },
      tag: 'Изъято · 49',
      testId: 'device-49',
    },
    {
      key: 'card',
      label: 'Карта памяти камеры инженера',
      boxes: [box(0.12, 0.52, 0.035, 0.045, 0.005, edge)],
      hotspot: { kind: 'material', id: '24' },
      tag: 'Изъято · 24',
      testId: 'device-24',
    },
    {
      key: 'mobile',
      label: 'Телефон (владелец не установлен)',
      boxes: [box(0.3, 0.5, 0.07, 0.13, 0.012, col('--color-screen'))],
      hotspot: { kind: 'material', id: '48' },
      tag: 'Изъято · 48',
      testId: 'device-48',
    },
    {
      key: 'keyboard',
      label: 'Клавиатура',
      boxes: [box(-0.52, 0.48, 0.34, 0.11, 0.02, edge)],
    },
    {
      key: 'phone',
      label: 'Телефон следователя',
      boxes: [
        box(0.56, 0.42, 0.17, 0.15, 0.05, col('--color-phone')),
        box(0.52, 0.42, 0.05, 0.17, 0.025, col('--color-phone'), 0.05),
      ],
    },
  ];
}

/** Отсечь многоугольник плоскостью z = zMax (всё, что за зрителем, выбрасывается). */
export function clipNear(pts: Vec3[], zMax: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Vec3;
    const b = pts[(i + 1) % pts.length] as Vec3;
    const aIn = a[2] <= zMax;
    const bIn = b[2] <= zMax;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (zMax - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, zMax]);
    }
  }
  return out;
}

/** Видимые грани коробки (выпуклой) — те, что смотрят на глаз; экран монитора — на передней. */
export function boxPolys(b: Box, eye: Vec3, shade: (c: string, k: number) => string): Poly[] {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  const faces: { pts: Vec3[]; k: number; visible: boolean; front?: boolean }[] = [
    {
      pts: [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
      k: 1.15,
      visible: eye[1] < y0,
    },
    {
      pts: [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      k: 0.9,
      visible: eye[2] > z1,
      front: true,
    },
    {
      pts: [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      k: 0.75,
      visible: eye[0] < x0,
    },
    {
      pts: [
        [x1, y0, z0],
        [x1, y0, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
      k: 0.75,
      visible: eye[0] > x1,
    },
  ];
  const out: Poly[] = [];
  for (const f of faces) {
    if (!f.visible) continue;
    out.push({ pts: f.pts, color: shade(b.color, f.k) });
    if (f.front && b.screen) {
      const ix = (x1 - x0) * 0.08;
      const iy = (y1 - y0) * 0.1;
      out.push({
        pts: [
          [x0 + ix, y0 + iy, z1 + 0.5],
          [x1 - ix, y0 + iy, z1 + 0.5],
          [x1 - ix, y1 - iy * 1.6, z1 + 0.5],
          [x0 + ix, y1 - iy * 1.6, z1 + 0.5],
        ],
        color: b.screen,
      });
    }
  }
  return out;
}

/** Светлее или темнее цвета #rrggbb в k раз. */
export function shade(color: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m?.[1]) return color;
  const v = Number.parseInt(m[1], 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * k)));
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const center = (b: Box): Vec3 => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
];

/** Предметы от дальнего к ближнему (художник): по центру ближайшей к глазу коробки. */
export function sortObjects(objects: DeskObject[], eye: Vec3): DeskObject[] {
  const d = (o: DeskObject) => Math.min(...o.boxes.map((b) => dist(center(b), eye)));
  return [...objects].sort((a, b) => d(b) - d(a));
}

/** Прямоугольник предмета на экране — для щелчка и бирки. */
export function screenRect(o: DeskObject, pose: Pose, r: Room) {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const b of o.boxes)
    for (const x of [b.min[0], b.max[0]])
      for (const y of [b.min[1], b.max[1]])
        for (const z of [b.min[2], b.max[2]]) {
          const s = toScreen(toCamera([x, y, z], pose, r.p), r.p, r.vp);
          x0 = Math.min(x0, s.x);
          y0 = Math.min(y0, s.y);
          x1 = Math.max(x1, s.x);
          y1 = Math.max(y1, s.y);
        }
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}

function fill(ctx: CanvasRenderingContext2D, poly: Poly, pose: Pose, r: Room) {
  const cam = clipNear(
    poly.pts.map((pt) => toCamera(pt, pose, r.p)),
    r.p - 1,
  );
  if (cam.length < 3) return;
  ctx.beginPath();
  cam.forEach((pt, i) => {
    const s = toScreen(pt, r.p, r.vp);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.fillStyle = poly.color;
  ctx.fill();
}

function prepare(canvas: HTMLCanvasElement, r: Room): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(r.vp.width * dpr);
  const h = Math.round(r.vp.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.vp.width, r.vp.height);
  return ctx;
}

const colors = (el: Element): Col => {
  const css = getComputedStyle(el);
  return (name) => css.getPropertyValue(name).trim() || '#444444';
};

/** Задний холст: комната, рама доски, столешница и пятно света лампы. */
export function drawRoom(canvas: HTMLCanvasElement, pose: Pose, r: Room): void {
  const ctx = prepare(canvas, r);
  if (!ctx) return;
  const col = colors(canvas);
  ctx.fillStyle = col('--color-room-dark');
  ctx.fillRect(0, 0, r.vp.width, r.vp.height);
  for (const poly of roomPolys(r, col)) fill(ctx, poly, pose, r);
  // Свет лампы на столе — мягкое пятно под абажуром.
  const c = toCamera([0.68 * r.p, r.deskY, 0.3 * r.p], pose, r.p);
  if (c[2] < r.p - 1) {
    const s = toScreen(c, r.p, r.vp);
    const rad = (0.55 * r.p * r.p) / (r.p - c[2]);
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
    g.addColorStop(0, col('--color-lamp-light'));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.vp.width, r.vp.height);
  }
}

/** Передний холст: предметы на столе поверх доски (монитор и лампа заходят на неё). */
export function drawObjects(
  canvas: HTMLCanvasElement,
  pose: Pose,
  r: Room,
  inbox: string[] = [],
): void {
  const ctx = prepare(canvas, r);
  if (!ctx) return;
  const col = colors(canvas);
  for (const o of sortObjects(deskObjects(r, col, inbox), pose.eye)) {
    const boxes = [...o.boxes].sort(
      (a, b) => dist(center(b), pose.eye) - dist(center(a), pose.eye),
    );
    for (const b of boxes)
      for (const poly of boxPolys(b, pose.eye, shade)) fill(ctx, poly, pose, r);
  }
}
