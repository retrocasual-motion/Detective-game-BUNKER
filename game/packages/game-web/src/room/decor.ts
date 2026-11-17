import { CONTAINER_IDS, CONTAINERS, type ContainerId, EPILOGUE_ID } from '@bunker/shared';
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
export type Hotspot =
  | { kind: 'computer' }
  | { kind: 'trash' }
  | { kind: 'container'; id: ContainerId }
  | { kind: 'material'; id: string };

interface Box {
  min: Vec3;
  max: Vec3;
  color: string;
  /** Цвет экрана на передней грани (монитор). */
  screen?: string;
}

/** Эпилог на столе: нет, пришёл и не открыт (подсвечен), открыт. */
export type Epilogue = 'none' | 'fresh' | 'read';

export interface DeskObject {
  key: string;
  label: string;
  boxes: Box[];
  hotspot?: Hotspot;
  /** Бумажный ярлык под предметом: «Изъято · 47», «Входящие». */
  tag?: string;
  /** Ярлык — на самом предмете (надпись на конверте), а не под ним. */
  tagInside?: boolean;
  /** Для автотестов. */
  testId?: string;
  /** Только что пришло и ещё не открыто — подсвечено (эпилог). */
  fresh?: boolean;
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

/** Сколько комков видно в корзине (остальные — под ними). */
export const TRASH_SHOWN = 5;

/**
 * Корзина у стола (TR-A, решение автора 09.11): сюда выбрасывают письма-ответы, они лежат
 * скомканными. Стоит на правом углу стола: пол у стола с сидячей камеры не виден.
 */
function trashObject(r: Room, col: Col, trash: number): DeskObject {
  const { p, deskY } = r;
  const X = 0.76;
  const Z = 0.3;
  const W = 0.11;
  const H = 0.12;
  const at = (x: number, z: number, w: number, h: number, color: string, lift: number): Box => ({
    min: [(x - w / 2) * p, deskY - (lift + h) * p, (z - w / 2) * p],
    max: [(x + w / 2) * p, deskY - lift * p, (z + w / 2) * p],
    color,
  });
  // Комки — по кругу у верха корзины, каждый чуть выше края.
  const spots: [number, number][] = [
    [0, 0],
    [-0.03, 0.025],
    [0.03, -0.02],
    [0.028, 0.03],
    [-0.028, -0.028],
  ];
  const crumples = spots
    .slice(0, Math.min(trash, TRASH_SHOWN))
    .map(([dx, dz], k) =>
      at(X + dx, Z + dz, 0.042 - k * 0.003, 0.035, col('--color-crumple'), H - 0.015),
    );
  return {
    key: 'trash',
    label: trash ? `Корзина: выброшено писем — ${trash}` : 'Корзина (пусто)',
    boxes: [
      at(X, Z, W, H, col('--color-bin'), 0),
      at(X, Z, W - 0.016, 0.001, col('--color-bin-inside'), H),
      ...crumples,
    ],
    hotspot: { kind: 'trash' },
    tag: trash ? `Корзина · ${trash}` : 'Корзина',
    testId: 'trash-bin',
  };
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
  const { p, deskY, deskNear, deskLeft, deskRight } = r;
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
  const deskXc = (deskLeft + deskRight) / 2;
  const deskHx = (deskRight - deskLeft) / 2;
  const edge = 0.04 * p;
  return [
    { pts: rect([0, floor, zc], [right, 0, 0], [0, 0, hz]), color: col('--color-room-floor') },
    { pts: rect([0, top, zc], [right, 0, 0], [0, 0, hz]), color: col('--color-room-dark') },
    { pts: rect([left, yc, zc], [0, 0, hz], [0, hy, 0]), color: col('--color-room-wall') },
    { pts: rect([right, yc, zc], [0, 0, hz], [0, hy, 0]), color: col('--color-room-wall') },
    { pts: rect([0, yc, back], [right, 0, 0], [0, hy, 0]), color: col('--color-room-wall-front') },
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
/** Где лежит конверт на столе (доли p): ближний ряд, по порядку. */
const ENVELOPE_AT: Record<Exclude<ContainerId, 'personal'>, [number, number]> = {
  protocols: [-0.2, 0.56],
  scene: [0.04, 0.56],
  bunker: [0.28, 0.56],
};

export function deskObjects(
  r: Room,
  col: Col,
  inbox: string[] = [],
  trash = 0,
  opened: readonly ContainerId[] = CONTAINER_IDS,
  /** Эпилог после заключения: «fresh» — конверт пришёл и не открыт (подсвечен). */
  epilogue: Epilogue = 'none',
): DeskObject[] {
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
  const all: DeskObject[] = [
    ...inboxObjects(r, col, inbox),
    trashObject(r, col, trash),
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
    // Коробка «Личные вещи» (A-260): опечатана — крышка; вскрыта — пакеты сверху.
    opened.includes('personal')
      ? {
          key: 'bags',
          label: 'Коробка: личные вещи членов группы (40–46)',
          boxes: [
            box(-0.3, 0.16, 0.24, 0.18, 0.1, col('--color-box')),
            box(-0.32, 0.15, 0.17, 0.12, 0.02, col('--color-bag'), 0.1),
          ],
          tag: 'Личные вещи · 40–46',
          testId: 'bags-box',
        }
      : {
          key: 'bags',
          label: 'Коробка «Личные вещи», опечатана — вскрыть',
          boxes: [
            box(-0.3, 0.16, 0.24, 0.18, 0.1, col('--color-box')),
            box(-0.3, 0.16, 0.25, 0.19, 0.012, col('--color-box-lid'), 0.1),
            box(-0.3, 0.16, 0.02, 0.19, 0.014, col('--color-seal'), 0.1),
          ],
          hotspot: { kind: 'container' as const, id: 'personal' as const },
          tag: 'Личные вещи',
          testId: 'container-personal',
        },
    // Газета (E44, A-260): свежий номер, сложен; бытовая вещь — без бирки.
    {
      key: 'newspaper',
      label: 'Газета',
      boxes: [
        box(-0.37, 0.33, 0.19, 0.13, 0.01, col('--color-newspaper')),
        box(-0.37, 0.29, 0.17, 0.025, 0.002, col('--color-newspaper-ink'), 0.01),
      ],
      hotspot: { kind: 'material' as const, id: '15' },
      testId: 'newspaper',
    },
    // Конверты архива (A-260): опечатаны, у каждого — название; вскрытый со стола уходит.
    ...CONTAINERS.filter((c) => c.id !== 'personal' && !opened.includes(c.id)).map((c) => {
      const [x, z] = ENVELOPE_AT[c.id as Exclude<ContainerId, 'personal'>];
      return {
        key: `envelope-${c.id}`,
        label: `Конверт «${c.label}», опечатан — вскрыть`,
        boxes: [
          box(x, z, 0.2, 0.12, 0.008, col('--color-archive-envelope')),
          box(x + 0.07, z - 0.035, 0.03, 0.02, 0.003, col('--color-seal'), 0.008),
        ],
        hotspot: { kind: 'container' as const, id: c.id },
        tag: c.label,
        tagInside: true,
        testId: `container-${c.id}`,
      };
    }),
    // Коробка с пачками бумаг из помещений (29, PH-B, BX-A): на месте конверта «Документация объекта»,
    // когда он вскрыт.
    {
      key: 'papers',
      label: 'Коробка: пачки бумаг из помещений (9 пачек)',
      // Архивный короб с крышкой (BX-A): внутри конверты стоят на ребре, как в картотеке.
      boxes: [
        box(0.4, 0.6, 0.16, 0.12, 0.075, col('--color-box')),
        box(0.4, 0.6, 0.168, 0.128, 0.018, col('--color-box'), 0.065),
        box(0.4, 0.6, 0.07, 0.04, 0.003, col('--color-newspaper'), 0.083),
      ],
      hotspot: { kind: 'material' as const, id: '29' },
      tag: 'Изъято · 29',
      testId: 'device-29',
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
      boxes: [box(-0.1, 0.36, 0.28, 0.2, 0.022, device)],
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
      // Камера инженера (A-268): компактная камера — корпус и объектив.
      key: 'card',
      label: 'Камера инженера',
      boxes: [
        // Лежит плашмя, объективом вверх: стоя заслоняла бы ручку-диктофон.
        box(0.12, 0.46, 0.1, 0.06, 0.026, device),
        box(0.137, 0.46, 0.038, 0.038, 0.01, edge, 0.026),
      ],
      hotspot: { kind: 'material', id: '24' },
      tag: 'Изъято · 24',
      testId: 'device-24',
    },
    {
      key: 'mobile',
      label: 'Телефон (владелец не установлен)',
      boxes: [box(0.32, 0.42, 0.07, 0.13, 0.012, col('--color-screen'))],
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
    // Эпилог (автор 17.11): после заключения — конверт посередине стола, ближе к игроку; пока не
    // открыт — подсвечен. Внутри — газетная вырезка (L997, текст автора — A6-D).
    ...(epilogue === 'none'
      ? []
      : [
          {
            key: 'epilogue',
            label: 'Конверт: эпилог дела — открыть',
            boxes: [
              box(0.04, 0.6, 0.24, 0.15, 0.009, col('--color-archive-envelope'), 0.012),
              box(0.04, 0.6, 0.14, 0.03, 0.003, col('--color-newspaper'), 0.021),
            ],
            hotspot: { kind: 'material' as const, id: EPILOGUE_ID },
            tag: 'Эпилог',
            tagInside: true,
            testId: 'epilogue-envelope',
            fresh: epilogue === 'fresh',
          },
        ]),
  ];
  // Устройства лежат на столе, когда вскрыт конверт «Осмотр места происшествия и изъятое» (A-260);
  // коробка с пачками — когда вскрыт «Документация объекта и программы».
  return all.filter(
    (o) =>
      !(DEVICE_KEYS.has(o.key) && !opened.includes('scene')) &&
      !(o.key === 'papers' && !opened.includes('bunker')),
  );
}

/** Изъятые устройства на столе (24, 47–50). */
const DEVICE_KEYS = new Set(['radio', 'laptop', 'pen', 'card', 'mobile']);

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
  trash = 0,
  opened: readonly ContainerId[] = CONTAINER_IDS,
  epilogue: Epilogue = 'none',
): void {
  const ctx = prepare(canvas, r);
  if (!ctx) return;
  const col = colors(canvas);
  for (const o of sortObjects(deskObjects(r, col, inbox, trash, opened, epilogue), pose.eye)) {
    const boxes = [...o.boxes].sort(
      (a, b) => dist(center(b), pose.eye) - dist(center(a), pose.eye),
    );
    for (const b of boxes)
      for (const poly of boxPolys(b, pose.eye, shade)) fill(ctx, poly, pose, r);
  }
}
