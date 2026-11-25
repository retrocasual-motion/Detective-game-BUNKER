import { CONTAINER_IDS, CONTAINERS, type ContainerId, EPILOGUE_ID } from '@bunker/shared';
import { type PartColor, PHONE_IDLE, type PhoneLook, phoneParts } from '../deskphone/model.ts';
import { type Pose, type Room, toCamera, toScreen, type Vec3 } from './camera.ts';
import { DRIVE_IDLE, type DriveLook } from './drive.ts';

/** Цвета частей телефона на столе (6a-3). */
const PHONE_COLOR: Record<PartColor, string> = {
  body: '--color-dp-body',
  ridge: '--color-dp-body-top',
  handset: '--color-dp-handset',
  key: '--color-dp-key',
  bezel: '--color-dp-bezel',
  lcd: '--color-dp-lcd',
  cradle: '--color-dp-cradle',
};

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
  /** Конверт «Прил. 7 · Сервер VL-31» с диском (A-272): взять в руки. */
  | { kind: 'disc' }
  /** Телефон следователя (6a-3): подойти и позвонить. */
  | { kind: 'deskphone' }
  /** Цепочка лампы (автор 25.11): включить или выключить. */
  | { kind: 'lamp' }
  | { kind: 'container'; id: ContainerId }
  | { kind: 'material'; id: string };

interface Box {
  min: Vec3;
  max: Vec3;
  color: string;
  /** Цвет экрана на передней грани (монитор). */
  screen?: string;
  /** Полоса панели задач внизу экрана. */
  screenBar?: string;
  /** Поворот вокруг вертикали (рад; + — передом вправо, к игроку справа) и его ось (x, z), px. */
  yaw?: number;
  pivot?: [number, number];
}

/** Точка коробки после её поворота вокруг вертикали. */
function turned(b: Box, [x, y, z]: Vec3): Vec3 {
  if (!b.yaw || !b.pivot) return [x, y, z];
  const [cx, cz] = b.pivot;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return [cx + (x - cx) * c + (z - cz) * s, y, cz - (x - cx) * s + (z - cz) * c];
}

/** Восемь углов коробки (с поворотом). */
function corners(b: Box): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]])
      for (const z of [b.min[2], b.max[2]]) out.push(turned(b, [x, y, z]));
  return out;
}

/** Диск сервера на столе (A-272): в конверте, вынут из конверта, вставлен (нет на столе). */
export type DiscOnDesk = 'envelope' | 'out' | 'none';

/** Коробка из банка на столе: нет, пришла (подсвечена), вскрыта. */
export type Bank = 'none' | 'box' | 'open';

/** Лампа на столе (автор 25.11): горит ли и насколько потянута цепочка (0…1). */
export interface LampLook {
  on: boolean;
  pull: number;
}
export const LAMP_IDLE: LampLook = { on: true, pull: 0 };

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
  /** Ярлык в одну строку — на узкой полоске конверта в стопке. */
  tagLine?: boolean;
  /** Для автотестов. */
  testId?: string;
  /** Только что пришло и ещё не открыто — подсвечено (эпилог). */
  fresh?: boolean;
  /** Плоские круги поверх коробок — диск на столе и на лотке дисковода (A-272). */
  discs?: Disc[];
  /** Куда щёлкать, если предмет частью накрыт другим (конверты внахлёст): видимая полоска. */
  hit?: Box[];
  /** Части рисуются в заданном порядке — снизу вверх (телефон: корпус, выступ, кнопки, трубка). */
  ordered?: boolean;
}

/** Плоский круг на высоте lift над столом: диск с тёмной втулкой. */
interface Disc {
  min: Vec3;
  max: Vec3;
  color: string;
  hub: string;
}

/** Сколько писем лотка видно стоящими (остальные — за ними). */
export const INBOX_SHOWN = 6;

/**
 * Лоток «Входящие» на столе: в самом левом заднем углу (автор 25.11, разметка на снимке), доли p.
 * Левый край стола виден до 0,3 м от стены (дальше его срезает край экрана) — лоток в этой полосе.
 */
export const INBOX_AT: [number, number] = [-0.96, 0.19];
/** Лист в лотке — A4 лёжа (29,7 × 21 см); следующий сдвинут к игроку, у прежних видна полоска. */
const LETTER: [number, number] = [0.297, 0.21];
const LETTER_STEP = 0.016;

/**
 * Лоток «Входящие» (автор 25.11, по фото стола): прозрачный пластиковый лоток в один уровень, письма
 * лежат в нём стопкой; свежее — сверху и ближе к игроку, у прежних видна верхняя полоска — по ней и
 * щёлкают (как у конвертов внахлёст). Щелчок по письму — прочитать (и «На стену»).
 */
function inboxObjects(r: Room, col: Col, inbox: string[]): DeskObject[] {
  const { p, deskY } = r;
  const at = (x: number, z: number, w: number, d: number, h: number, color: string, lift = 0) => ({
    min: [(x - w / 2) * p, deskY - (lift + h) * p, (z - d / 2) * p] as Vec3,
    max: [(x + w / 2) * p, deskY - lift * p, (z + d / 2) * p] as Vec3,
    color,
  });
  const [X, Z] = INBOX_AT;
  const W = 0.33;
  const D = LETTER[1] + LETTER_STEP * (INBOX_SHOWN - 1) + 0.02;
  const far = Z - D / 2;
  const near = Z + D / 2;
  const clear = col('--color-tray-clear');
  const rim = col('--color-tray-edge');
  const shown = inbox.slice(0, INBOX_SHOWN);
  const n = shown.length;
  // Старые — первыми (снизу и дальше), свежее — сверху, ближе к игроку.
  const letters: DeskObject[] = shown
    .map((id, k) => {
      const r = n - 1 - k;
      const back = far + 0.01 + r * LETTER_STEP;
      const lift = 0.004 + r * 0.0015;
      const z = back + LETTER[1] / 2;
      const strip = k === 0 ? LETTER[1] : LETTER_STEP;
      return {
        key: `inbox-${id}`,
        label: `Входящие: ${id}`,
        boxes: [at(X, z, LETTER[0], LETTER[1], 0.0015, col('--color-paper-sheet'), lift)],
        hit: [at(X, back + strip / 2, LETTER[0], strip, 0.0015, '', lift)],
        hotspot: { kind: 'material' as const, id },
        testId: `inbox-${id}`,
      };
    })
    .reverse();
  return [
    {
      key: 'inbox-back',
      label: 'Входящие',
      boxes: [
        // Дно, задняя стенка и бока — прозрачный пластик с более светлой кромкой.
        at(X, Z, W, D, 0.004, clear),
        at(X, far, W, 0.004, 0.055, clear, 0.004),
        at(X, far, W, 0.006, 0.004, rim, 0.059),
        at(X - W / 2, Z, 0.004, D, 0.045, clear, 0.004),
        at(X + W / 2, Z, 0.004, D, 0.045, clear, 0.004),
      ],
      tag: inbox.length ? `Входящие · ${inbox.length}` : 'Входящие',
      tagInside: true,
      testId: 'inbox-tray',
    },
    ...letters,
    {
      key: 'inbox-front',
      label: 'Входящие',
      // Передний бортик низкий — письмо берут спереди.
      boxes: [at(X, near, W, 0.004, 0.02, clear, 0.004), at(X, near, W, 0.006, 0.003, rim, 0.024)],
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
 * Доля p — метр (стол 2,2 × 0,9 м, высота 0,75 м): размеры вещей — как в жизни (автор 19.11:
 * «соразмерность, как в реальном мире»; таблица — `game/docs/DECISIONS.md`, RS-A). Видно не
 * весь стол, а трапецию: у стены ±1,28 м, на 0,3 м от стены ±0,99, на 0,6 м ±0,70, ниже 0,7 м
 * — за краем экрана; раскладка подобрана так, чтобы вещи не пересекались и не уходили за край.
 * Устройства — из описи (24, 47–50); пакеты 40–46 лежат в коробке.
 */
/**
 * Папки дела (FM-B, автор 25.11; были конверты архива C4, A-260) — стопкой внахлёст, слева спереди;
 * пакет вещдоков «Изъятое» — правее. Середина стола свободна: туда ложится открытое — стопкой (DC-B).
 */
type EnvelopeId = Exclude<ContainerId, 'personal' | 'bank'>;
const ENVELOPE_AT: Record<EnvelopeId, [number, number]> = {
  // 3D-стол (автор 24.11: «освобождаем середину стола»): стопкой у стены, между коробкой «Личные
  // вещи» и коробом пачек; середина спереди — пустая, туда высыпается вскрытый конверт.
  // Автор 25.11 (фото стола; «ближе к нам»): слева спереди, перед лампой и коробкой.
  bunker: [-0.56, 0.45],
  scene: [-0.55, 0.54],
  protocols: [-0.54, 0.63],
  // Короб вещдоков «Изъятое» (автор 25.11: устройства в тонком конверте — «невозможно физически»)
  // — у стены посередине; вскрыли — устройства ложатся тут же.
  seized: [-0.07, 0.19],
};
/** Папки дела — стопкой внахлёст (FM-B, вместо конвертов A-260). */
const ENVELOPE_ORDER = ['bunker', 'scene', 'protocols'] as const;
/** Папка-скоросшиватель: 30 × 23,5 см, закладка с названием у дальнего края. */
const FOLDER: [number, number] = [0.3, 0.235];
/** Короб вещдоков 42 × 32 × 20 см: в нём ноутбук, радиопост, камера, телефон, ручка. */
const SEIZED_BOX: [number, number, number] = [0.42, 0.32, 0.2];

/** Где лежит конверт на столе (доли p: x, z): отсюда его содержимое высыпается на 3D-стол. */
export function envelopeSpot(id: ContainerId): [number, number] {
  return id in ENVELOPE_AT ? ENVELOPE_AT[id as EnvelopeId] : ENVELOPE_AT.scene;
}
/**
 * Где стоит компьютер следователя (дисковод под монитором), доли p: справа, у стены; правее и ближе
 * к игроку — телефон (автор 25.11, фото стола и разметка на снимке; было слева, −0,69).
 */
const PC_X = 0.65;
const PC_Z = 0.19;
/**
 * Короб с пачками — у стены правее середины; на нём — коробка из банка. Пока меньше настоящего
 * (BX-A — 38 × 30 × 25): 30 × 22 × 15, чтобы не спорил с компьютером (автор 19.11; размеры — на
 * этапе дизайна).
 */
const PAPERS_AT: [number, number] = [0.285, 0.13];
const PAPERS_H = 0.15;
/** Конверт с диском сервера (A-272) — у дисковода, левее телефона. */
const DISC_AT: [number, number] = [0.58, 0.56];
/**
 * Лампа банкира — у стены, сразу правее лотка «Входящие» (автор 25.11): центр основания, доли p.
 * Абажур нависает над лотком; основание ни с чем не пересекается.
 */
export const LAMP_AT: [number, number] = [-0.7, 0.1];

export function deskObjects(
  r: Room,
  col: Col,
  inbox: string[] = [],
  opened: readonly ContainerId[] = CONTAINER_IDS,
  /** Эпилог после заключения: «fresh» — конверт пришёл и не открыт (подсвечен). */
  epilogue: Epilogue = 'none',
  /** Диск сервера на столе: в конверте, вынут (лежит сам), нет — вставлен (A-272). */
  discOn: DiscOnDesk = 'none',
  /** Коробка из банка (A-272, AC-4): нет, пришла и не вскрыта, вскрыта (кассета и проигрыватель). */
  bank: Bank = 'none',
  /** Дисковод под монитором: кадр вставки диска. */
  drive: DriveLook = DRIVE_IDLE,
  /** Телефон на столе: снята ли трубка, какая кнопка утоплена (6a-3). */
  phone: PhoneLook = PHONE_IDLE,
  /** Лампа: горит ли, насколько потянута цепочка (0…1). */
  lamp: LampLook = LAMP_IDLE,
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
  /** Повернуть коробки вокруг вертикали через точку (x, z) стола на угол в градусах. */
  const turn = (bs: Box[], deg: number, x: number, z: number): Box[] =>
    bs.map((b) => ({ ...b, yaw: (deg * Math.PI) / 180, pivot: [x * p, z * p] }));
  const device = col('--color-device');
  const edge = col('--color-device-edge');
  /** Диск — плоский круг диаметром d (рисуется кругом, не коробкой). */
  const disc = (x: number, z: number, d: number, lift: number): Disc => ({
    ...box(x, z, d, d, 0.003, col('--color-disc-hub'), lift),
    hub: col('--color-pc-bay'),
  });
  // Рабочее место бюро (A-272; автор 19.11: «больше и ближе к нам — активный элемент, а не фон»;
  // «монитор развернуть к нам»): слева, ближе к игроку — монитор 22" 16:10 (50 × 33 см, как экран
  // компьютера 1280 × 800), повёрнут на ножке к следователю (25°), на тонком дисководе CD/DVD
  // (28 × 22 × 2,5 см; повёрнут вместе с монитором — смотрят в одну сторону, автор 21.11, R.1;
  // лоток выезжает к следователю); системный
  // блок — под столом, его не видно. Диск дотащили до дисковода (DD-A) — лоток (14 см, выезжает
  // на 15) выходит к игроку и не достаёт до клавиатуры: ни во что не упирается.
  /** Поворот монитора к следователю, градусы (справа — передом влево). */
  const TURN = -25;
  const DRIVE_W = 0.28;
  const DRIVE_D = 0.22;
  const DRIVE_H = 0.025;
  const TRAY_X = PC_X + 0.03;
  const front = PC_Z + DRIVE_D / 2 + 0.002;
  const bay = col('--color-pc-bay');
  const trayD = 0.15 * drive.out;
  /** Ось поворота монитора и дисковода. */
  const PIVOT: [number, number] = [PC_X, PC_Z - 0.02];
  const pcBoxes: Box[] = turn(
    [
      box(PC_X, PC_Z, DRIVE_W, DRIVE_D, DRIVE_H, col('--color-pc-case')),
      // Щель лотка, кнопка выброса, огонёк.
      box(TRAY_X, front, 0.15, 0.004, 0.005, bay, 0.012),
      box(PC_X + 0.12, front, 0.024, 0.005, 0.008, col('--color-pc-button'), 0.007),
      box(
        PC_X - 0.1,
        front,
        0.01,
        0.004,
        0.004,
        col(drive.led ? '--color-pc-led-busy' : '--color-pc-led'),
        0.01,
      ),
      // Выехавший лоток и диск на нём.
      ...(trayD > 0.002 ? [box(TRAY_X, front + trayD / 2, 0.14, trayD, 0.005, bay, 0.011)] : []),
    ],
    TURN,
    ...PIVOT,
  );
  // Диск на лотке — круг: поворачивается только его середина (как точки коробок, `turned`).
  const a = (TURN * Math.PI) / 180;
  const [dx, dz] = [TRAY_X - PIVOT[0], front + trayD / 2 - PIVOT[1]];
  const trayDisc =
    drive.disc && drive.out > 0.6
      ? [
          disc(
            PIVOT[0] + dx * Math.cos(a) + dz * Math.sin(a),
            PIVOT[1] - dx * Math.sin(a) + dz * Math.cos(a),
            0.12,
            0.016,
          ),
        ]
      : [];
  // Подставка (22 × 16 см) и ножка монитора — на дисководе.
  const stand = turn(
    [
      box(PC_X, PC_Z - 0.02, 0.2, 0.15, 0.01, edge, DRIVE_H),
      box(PC_X, PC_Z - 0.04, 0.05, 0.035, 0.07, edge, DRIVE_H + 0.01),
    ],
    TURN,
    ...PIVOT,
  );
  const monitor: Box = {
    ...box(PC_X, PC_Z - 0.04, 0.5, 0.05, 0.33, col('--color-monitor'), DRIVE_H + 0.07),
    yaw: a,
    pivot: [PIVOT[0] * p, PIVOT[1] * p],
  };
  const envelopes = ENVELOPE_ORDER.filter((id) => !opened.includes(id));
  const [LX, LZ] = LAMP_AT;
  const brass = col('--color-lamp-brass');
  const shadeGreen = col('--color-lamp-shade');
  const shadeLit = col('--color-lamp-shade-lit');
  const lampOn = lamp.on;
  // Цепочка: 10 см от абажура вниз; потянули — длиннее на 4 см.
  const chainLen = 0.1 + 0.04 * lamp.pull;
  const [CHAIN_X, CHAIN_Z] = [LX + 0.08, LZ + 0.07];
  // Коробка из банка — на коробе с пачками, если он уже на столе.
  const onPapers = opened.includes('bunker') ? PAPERS_H : 0;
  const [BX, BZ] = PAPERS_AT;
  // Проигрыватель с кассетой (UX-9): слева, перед лотком «Входящие», ничем не закрыт.
  const [CS_X, CS_Z] = [-0.95, 0.45];
  // Экран включён (автор 19.11): синий рабочий стол бюро и панель задач внизу — видно, что
  // компьютер работает и на него можно нажать.
  monitor.screen = col('--color-pc-screen-on');
  monitor.screenBar = col('--color-pc-screen-bar');
  const all: DeskObject[] = [
    ...inboxObjects(r, col, inbox),
    {
      key: 'lamp',
      label: 'Лампа',
      boxes: [
        // Лампа банкира (автор 25.11, фото стола; вторая правка — меньше): латунное основание
        // 19 × 12 см ступенькой, стойка, зелёный абажур 30 × 12 см на высоте 27 см.
        box(LX, LZ, 0.19, 0.12, 0.016, brass),
        box(LX, LZ, 0.12, 0.075, 0.012, brass, 0.016),
        box(LX, LZ, 0.02, 0.02, 0.242, brass, 0.028),
        box(LX, LZ + 0.025, 0.3, 0.12, 0.045, lampOn ? shadeLit : shadeGreen, 0.27),
        box(LX, LZ + 0.025, 0.27, 0.065, 0.025, lampOn ? shadeLit : shadeGreen, 0.315),
        box(LX - 0.155, LZ + 0.025, 0.01, 0.025, 0.025, brass, 0.28),
        box(LX + 0.155, LZ + 0.025, 0.01, 0.025, 0.025, brass, 0.28),
      ],
    },
    {
      // Цепочка выключателя (автор 25.11): навели — чуть подаётся, потянули или щёлкнули — лампа
      // включается или выключается.
      key: 'lamp-chain',
      label: lampOn
        ? 'Лампа — выключить (потянуть цепочку)'
        : 'Лампа — включить (потянуть цепочку)',
      boxes: [
        box(CHAIN_X, CHAIN_Z, 0.004, 0.004, chainLen, brass, 0.27 - chainLen),
        box(CHAIN_X, CHAIN_Z, 0.012, 0.012, 0.016, brass, 0.27 - chainLen - 0.016),
      ],
      hotspot: { kind: 'lamp' as const },
      testId: 'lamp-chain',
    },
    {
      key: 'radio',
      label: 'Радиопост: стойка и запись регистратора',
      boxes: [box(0.11, 0.12, 0.26, 0.16, 0.1, device)],
      hotspot: { kind: 'material', id: '50' },
      tag: 'Изъято · 50',
      // Бирка — на корпусе: перед радиопостом лежат конверты.
      tagInside: true,
      testId: 'device-50',
    },
    // Коробка «Личные вещи» (A-260): опечатана — крышка; вскрыта — уходит со стола: пакеты 40–46
    // на стене, больше коробке делать нечего (ручная проверка автора 21.11, R.4).
    ...(opened.includes('personal')
      ? []
      : [
          {
            key: 'bags',
            label: 'Коробка «Личные вещи», опечатана — вскрыть',
            boxes: [
              // Коробка 33 × 23 × 16 см (как коробка «В руках»), крышка и лента пломбы.
              // У стены, между лампой и коробом пачек (автор 25.11, фото стола), без пересечений.
              // Меньше (автор 25.11): 28 × 20 × 14 см.
              box(-0.4, 0.13, 0.28, 0.2, 0.14, col('--color-box')),
              box(-0.4, 0.13, 0.29, 0.21, 0.015, col('--color-box-lid'), 0.14),
              box(-0.4, 0.13, 0.03, 0.21, 0.017, col('--color-seal'), 0.14),
            ],
            hotspot: { kind: 'container' as const, id: 'personal' as const },
            tag: 'Личные вещи',
            testId: 'container-personal',
          },
        ]),
    // Газета (E44, A-260) — на 3D-столе: свободный лист, лежит перед игроком (автор 25.11).
    // Папки дела (FM-B, автор 25.11; вместо конвертов A-260): не опечатаны, у каждой — закладка с
    // названием; открытая со стола уходит — листы стопкой на столе. Стопкой внахлёст: у дальних видна
    // полоска с названием — по ней и щёлкают.
    ...envelopes.map((id, k) => {
      const at = ENVELOPE_AT;
      const [x, z] = at[id];
      const c = CONTAINERS.find((cc) => cc.id === id);
      const lift = k * 0.008;
      const next = envelopes[k + 1];
      const nearEdge = next ? at[next][1] - FOLDER[1] / 2 : z + FOLDER[1] / 2;
      const farEdge = z - FOLDER[1] / 2;
      // Закладки — вразбивку, как у настоящих папок (слева, посередине, справа).
      const tabX = x + (((k % 3) - 1) * FOLDER[0]) / 3;
      return {
        key: `envelope-${id}`,
        label: `Папка «${c?.label ?? id}» — открыть`,
        boxes: [
          box(x, z, FOLDER[0], FOLDER[1], 0.006, col('--color-case-folder'), lift),
          box(tabX, farEdge - 0.008, 0.09, 0.018, 0.006, col('--color-case-folder'), lift),
          // Обрез стопки листов внутри — чуть светлее картона.
          box(
            x,
            z + 0.004,
            FOLDER[0] - 0.01,
            FOLDER[1] - 0.012,
            0.002,
            col('--color-case-folder-edge'),
            lift + 0.006,
          ),
        ],
        hit: [box(x, (farEdge + nearEdge) / 2, FOLDER[0], nearEdge - farEdge, 0.008, '', lift)],
        hotspot: { kind: 'container' as const, id },
        tag: c?.label ?? id,
        tagInside: true,
        tagLine: true,
        testId: `container-${id}`,
      };
    }),
    // Короб вещдоков «Изъятое при осмотре места» (автор 25.11; вместо пакета FM-B): картон, крышка,
    // красная лента вещдоков поперёк, белая бирка; вскрыли — устройства на столе, короб уходит.
    ...(opened.includes('seized')
      ? []
      : [
          {
            key: 'envelope-seized',
            label: 'Короб вещдоков «Изъятое при осмотре места», опечатан — вскрыть',
            boxes: [
              box(
                ...ENVELOPE_AT.seized,
                SEIZED_BOX[0],
                SEIZED_BOX[1],
                SEIZED_BOX[2],
                col('--color-box'),
              ),
              box(
                ...ENVELOPE_AT.seized,
                SEIZED_BOX[0] + 0.01,
                SEIZED_BOX[1] + 0.01,
                0.015,
                col('--color-box-lid'),
                SEIZED_BOX[2],
              ),
              box(
                ...ENVELOPE_AT.seized,
                SEIZED_BOX[0] + 0.012,
                0.04,
                0.017,
                col('--color-seal'),
                SEIZED_BOX[2],
              ),
              box(
                ENVELOPE_AT.seized[0] + 0.1,
                ENVELOPE_AT.seized[1] + 0.07,
                0.12,
                0.07,
                0.003,
                col('--color-paper-sheet'),
                SEIZED_BOX[2] + 0.015,
              ),
            ],
            hotspot: { kind: 'container' as const, id: 'seized' as const },
            tag: 'Изъятое при осмотре места',
            testId: 'container-seized',
          },
        ]),
    // Конверт с диском сервера (A-272, AC-2): у компьютера, правее дисковода; подсвечен, пока диск не
    // вставлен; вставили — пустой конверт уходит, диск остаётся в компьютере.
    ...(discOn === 'envelope'
      ? [
          {
            key: 'server-disc',
            label: 'Конверт «Прил. 7 · Сервер VL-31» — взять',
            boxes: [
              // Конверт C6 (162 × 114 мм), в нём диск 12 см.
              box(DISC_AT[0], DISC_AT[1], 0.162, 0.114, 0.006, col('--color-archive-envelope')),
              box(DISC_AT[0], DISC_AT[1], 0.1, 0.07, 0.002, col('--color-newspaper'), 0.006),
            ],
            hotspot: { kind: 'disc' as const },
            tag: 'Прил. 7 · Сервер VL-31',
            tagInside: true,
            testId: 'server-disc',
            fresh: true,
          },
        ]
      : discOn === 'out'
        ? [
            {
              // Диск, вынутый из конверта (DD-A): лежит на столе — взять или дотащить до дисковода.
              key: 'server-disc',
              label: 'Диск «Прил. 7 · Сервер VL-31»',
              boxes: [],
              discs: [disc(DISC_AT[0], DISC_AT[1], 0.12, 0)],
              hotspot: { kind: 'disc' as const },
              tag: 'Диск «Прил. 7»',
              tagInside: true,
              testId: 'server-disc-out',
              // Не мигает: подсветка «новое» — подсказка «ещё не доделано» (UX-8, Z-2).
            },
          ]
        : []),
    // Коробка из банка (A-272, AC-4): справа, у лампы; пока не вскрыта — подсвечена, как новое.
    ...(bank === 'box'
      ? [
          {
            key: 'bank-box',
            label: 'Коробка «Aspen Bank · ячейка № 845» — вскрыть',
            boxes: [
              // 20 × 14 × 10 см: внутри проигрыватель микрокассет и кассета.
              box(BX, BZ, 0.2, 0.14, 0.1, col('--color-box'), onPapers),
              box(BX, BZ, 0.205, 0.145, 0.012, col('--color-box-lid'), onPapers + 0.1),
              box(BX, BZ, 0.02, 0.145, 0.014, col('--color-seal'), onPapers + 0.1),
            ],
            hotspot: { kind: 'container' as const, id: 'bank' as const },
            tag: 'Ячейка № 845',
            testId: 'container-bank',
            fresh: true,
          },
        ]
      : []),
    // Кассета и проигрыватель микрокассет бюро (L462) — из коробки банка; на столе справа, у лампы:
    // на коробе 29 их было не видно — одна бирка (UX-9, HI-1).
    ...(bank === 'open'
      ? [
          {
            key: 'cassette',
            label: 'Проигрыватель микрокассет бюро с кассетой «06.10.08»',
            boxes: [
              // Проигрыватель микрокассет 11 × 6 × 2,2 см; кассета уже в нём — видна в окошке
              // (ручная проверка автора 21.11, 6.4).
              box(CS_X, CS_Z, 0.11, 0.06, 0.022, col('--color-device')),
              box(CS_X - 0.02, CS_Z, 0.04, 0.03, 0.003, col('--color-newspaper'), 0.022),
            ],
            hotspot: { kind: 'material' as const, id: 'L462' },
            tag: 'Кассета · L462',
            testId: 'device-L462',
          },
        ]
      : []),
    // Коробка с пачками бумаг из помещений (29, PH-B, BX-A): у стены, когда вскрыт конверт
    // «Документация объекта».
    {
      key: 'papers',
      label: 'Коробка: пачки бумаг из помещений (9 пачек)',
      // Архивный короб с крышкой (BX-A): внутри конверты стоят на ребре, как в картотеке.
      // 30 × 22 × 15 см (пока меньше BX-A, см. PAPERS_AT).
      boxes: [
        box(BX, BZ, 0.3, 0.22, 0.13, col('--color-box')),
        box(BX, BZ, 0.31, 0.23, 0.03, col('--color-box'), 0.12),
        box(BX, BZ + 0.045, 0.1, 0.05, 0.003, col('--color-newspaper'), PAPERS_H),
      ],
      hotspot: { kind: 'material' as const, id: '29' },
      tagInside: true,
      tag: 'Изъято · 29',
      testId: 'device-29',
    },
    {
      key: 'monitor',
      label: 'Компьютер следователя',
      boxes: [...stand, monitor],
      hotspot: { kind: 'computer' },
    },
    {
      // Дисковод CD/DVD под монитором (A-272): щелчок — компьютер; сюда дотаскивают диск.
      key: 'drive',
      label: 'Дисковод компьютера',
      boxes: pcBoxes,
      discs: trayDisc,
      hotspot: { kind: 'computer' },
      testId: 'disc-drive',
    },
    {
      key: 'laptop',
      label: 'Ноутбук руководителя',
      boxes: [box(0.12, 0.7, 0.34, 0.24, 0.032, device)],
      hotspot: { kind: 'material', id: '47' },
      tag: 'Изъято · 47',
      testId: 'device-47',
    },
    {
      key: 'pen',
      label: 'Ручка-диктофон',
      boxes: [box(-0.25, 0.82, 0.14, 0.014, 0.014, edge)],
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
        box(0.38, 0.73, 0.1, 0.06, 0.025, device),
        box(0.395, 0.73, 0.035, 0.035, 0.012, edge, 0.025),
      ],
      hotspot: { kind: 'material', id: '24' },
      tag: 'Изъято · 24',
      testId: 'device-24',
    },
    {
      key: 'mobile',
      label: 'Телефон (владелец не установлен)',
      boxes: [box(0.4, 0.59, 0.065, 0.12, 0.012, col('--color-screen'))],
      hotspot: { kind: 'material', id: '48' },
      tag: 'Изъято · 48',
      testId: 'device-48',
    },
    // Клавиатуры нет (автор 25.11: «пока уберём клавиатуру»).
    {
      key: 'phone',
      label: 'Телефон следователя — позвонить',
      hotspot: { kind: 'deskphone' },
      testId: 'desk-phone',
      ordered: true,
      boxes: [
        // Справа, ближе к игроку (автор 19.11): корпус 26 × 16 см, объёмный (DP-A, автор 20.11) —
        // корпус, выступ под экранчиком, рычаг, трубка, кнопки (`deskphone/model.ts`); цифры и
        // текст экранчика — плоско поверх (`PhoneFace`).
        ...phoneParts(phone).map((pt) => {
          const b = box(pt.x, pt.z, pt.w, pt.d, pt.h, col(PHONE_COLOR[pt.color]), pt.lift);
          return pt.yaw && pt.pivot
            ? {
                ...b,
                yaw: (pt.yaw * Math.PI) / 180,
                pivot: [pt.pivot[0] * p, pt.pivot[1] * p] as [number, number],
              }
            : b;
        }),
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
              // C5 (229 × 162 мм) — поверх стопки, если конверты ещё на столе.
              box(0.16, 0.4, 0.229, 0.162, 0.006, col('--color-archive-envelope'), 0.03),
              box(0.16, 0.4, 0.14, 0.03, 0.003, col('--color-newspaper'), 0.036),
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
  // Камера, ручка и телефон — на 3D-столе свободно (или карточкой на стене), не нарисованы.
  return all
    .filter(
      (o) =>
        !FREE_KEYS.has(o.key) &&
        !(DEVICE_KEYS.has(o.key) && !opened.includes('scene')) &&
        !(o.key === 'papers' && !opened.includes('bunker')),
    )
    .map((o) => shrink(o, r));
}

/**
 * Вещи на столе меньше настоящих (автор 25.11: «всё великовато… меняй только размеры вещей»,
 * камера — как была): каждая — в DESK_SCALE раз вокруг своей середины на столе, места не сдвигаются.
 * Части одной вещи — вокруг общей точки (монитор с дисководом, лампа с цепочкой, лоток с письмами).
 * Телефон уменьшен своей моделью (DESK_PHONE.scale): цифры на кнопках — по ней.
 */
export const DESK_SCALE = 0.89;

function shrink(o: DeskObject, r: Room): DeskObject {
  if (o.key === 'phone') return o;
  const { p, deskY } = r;
  const all = [...o.boxes, ...(o.hit ?? []), ...(o.discs ?? [])];
  if (!all.length) return o;
  const origin = (): [number, number] => {
    if (o.key === 'monitor' || o.key === 'drive') return [PC_X * p, PC_Z * p];
    if (o.key === 'lamp' || o.key === 'lamp-chain') return [LAMP_AT[0] * p, LAMP_AT[1] * p];
    if (o.key.startsWith('inbox')) return [INBOX_AT[0] * p, INBOX_AT[1] * p];
    const xs = all.flatMap((b) => [b.min[0], b.max[0]]);
    const zs = all.flatMap((b) => [b.min[2], b.max[2]]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  };
  const [ox, oz] = origin();
  const S = DESK_SCALE;
  const pt = (v: Vec3): Vec3 => [
    ox + (v[0] - ox) * S,
    deskY + (v[1] - deskY) * S,
    oz + (v[2] - oz) * S,
  ];
  const one = <T extends { min: Vec3; max: Vec3; pivot?: [number, number] }>(b: T): T => ({
    ...b,
    min: pt(b.min),
    max: pt(b.max),
    ...(b.pivot ? { pivot: [ox + (b.pivot[0] - ox) * S, oz + (b.pivot[1] - oz) * S] } : {}),
  });
  return {
    ...o,
    boxes: o.boxes.map(one),
    ...(o.hit ? { hit: o.hit.map(one) } : {}),
    ...(o.discs ? { discs: o.discs.map(one) } : {}),
  };
}

/** Изъятые устройства на столе (24, 47–50). */
const DEVICE_KEYS = new Set(['radio', 'laptop', 'pen', 'card', 'mobile']);
/** Изъятые вещи, что лежат на 3D-столе свободно (DESK_DEVICES: 49, 24, 48, 47, 50). */
const FREE_KEYS = new Set(['pen', 'card', 'mobile', 'laptop', 'radio']);

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
  // Грани в своих осях коробки; видна та, к которой глаз с её внешней стороны (нормаль — после
  // поворота). Без поворота — те же правила, что прежде: перед, бока, верх.
  const faces: { pts: Vec3[]; n: [number, number]; k: number; front?: boolean }[] = [
    {
      pts: [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      n: [0, 1],
      k: 0.9,
      front: true,
    },
    {
      pts: [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      n: [-1, 0],
      k: 0.75,
    },
    {
      pts: [
        [x1, y0, z0],
        [x1, y0, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
      n: [1, 0],
      k: 0.75,
    },
    {
      pts: [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
      n: [0, -1],
      k: 0.7,
    },
  ];
  const c = Math.cos(b.yaw ?? 0);
  const sn = Math.sin(b.yaw ?? 0);
  const out: Poly[] = [];
  if (eye[1] < y0)
    out.push({
      pts: (
        [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
        ] as Vec3[]
      ).map((pt) => turned(b, pt)),
      color: shade(b.color, 1.15),
    });
  for (const f of faces) {
    const pts = f.pts.map((pt) => turned(b, pt));
    const nx = f.n[0] * c + f.n[1] * sn;
    const nz = -f.n[0] * sn + f.n[1] * c;
    const p0 = pts[0] as Vec3;
    if ((eye[0] - p0[0]) * nx + (eye[2] - p0[2]) * nz <= 0) continue;
    out.push({ pts, color: shade(b.color, f.k) });
    if (f.front && b.screen) {
      // Рамка ЖК-монитора: по бокам и сверху ~2 см, снизу ~3.
      const ix = (x1 - x0) * 0.045;
      const iy = (y1 - y0) * 0.07;
      out.push({
        pts: (
          [
            [x0 + ix, y0 + iy, z1 + 0.5],
            [x1 - ix, y0 + iy, z1 + 0.5],
            [x1 - ix, y1 - iy * 1.6, z1 + 0.5],
            [x0 + ix, y1 - iy * 1.6, z1 + 0.5],
          ] as Vec3[]
        ).map((pt) => turned(b, pt)),
        color: b.screen,
      });
      if (b.screenBar) {
        const yb = y1 - iy * 1.6;
        const bar = (y1 - y0) * 0.05;
        out.push({
          pts: (
            [
              [x0 + ix, yb - bar, z1 + 0.8],
              [x1 - ix, yb - bar, z1 + 0.8],
              [x1 - ix, yb, z1 + 0.8],
              [x0 + ix, yb, z1 + 0.8],
            ] as Vec3[]
          ).map((pt) => turned(b, pt)),
          color: b.screenBar,
        });
      }
    }
  }
  return out;
}

/** Светлее или темнее цвета #rrggbb (или #rrggbbaa — прозрачный пластик) в k раз. */
export function shade(color: string, k: number): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color.trim());
  if (!m?.[1]) return color;
  const v = Number.parseInt(m[1], 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * k)));
  const alpha = m[2] ? ` / ${Math.round((Number.parseInt(m[2], 16) / 255) * 100)}%` : '';
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)}${alpha})`;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const center = (b: Box): Vec3 =>
  turned(b, [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);

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
  for (const b of o.hit ?? [...o.boxes, ...(o.discs ?? [])])
    for (const pt of corners(b)) {
      const s = toScreen(toCamera(pt, pose, r.p), r.p, r.vp);
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
export function drawRoom(canvas: HTMLCanvasElement, pose: Pose, r: Room, lampOn = true): void {
  const ctx = prepare(canvas, r);
  if (!ctx) return;
  const col = colors(canvas);
  ctx.fillStyle = col('--color-room-dark');
  ctx.fillRect(0, 0, r.vp.width, r.vp.height);
  for (const poly of roomPolys(r, col)) fill(ctx, poly, pose, r);
  // Свет лампы на столе — мягкое пятно под абажуром (лампа выключена — пятна нет).
  const c = toCamera([LAMP_AT[0] * r.p, r.deskY, (LAMP_AT[1] + 0.24) * r.p], pose, r.p);
  if (lampOn && c[2] < r.p - 1) {
    const s = toScreen(c, r.p, r.vp);
    const rad = (0.55 * r.p * r.p) / (r.p - c[2]);
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
    g.addColorStop(0, col('--color-lamp-light'));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.vp.width, r.vp.height);
  }
  // Отсвет включённого экрана на столе перед монитором — слабое голубое пятно.
  const m = toCamera([(PC_X - 0.08) * r.p, r.deskY, (PC_Z + 0.1) * r.p], pose, r.p);
  if (m[2] < r.p - 1) {
    const s = toScreen(m, r.p, r.vp);
    const rad = (0.32 * r.p * r.p) / (r.p - m[2]);
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
    g.addColorStop(0, col('--color-pc-screen-glow'));
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
  opened: readonly ContainerId[] = CONTAINER_IDS,
  epilogue: Epilogue = 'none',
  disc: DiscOnDesk = 'none',
  bank: Bank = 'none',
  drive: DriveLook = DRIVE_IDLE,
  phone: PhoneLook = PHONE_IDLE,
  lamp: LampLook = LAMP_IDLE,
): void {
  const ctx = prepare(canvas, r);
  if (!ctx) return;
  const col = colors(canvas);
  for (const o of sortObjects(
    deskObjects(r, col, inbox, opened, epilogue, disc, bank, drive, phone, lamp),
    pose.eye,
  )) {
    const boxes = o.ordered
      ? o.boxes
      : [...o.boxes].sort((a, b) => dist(center(b), pose.eye) - dist(center(a), pose.eye));
    for (const b of boxes)
      for (const poly of boxPolys(b, pose.eye, shade)) fill(ctx, poly, pose, r);
    for (const d of o.discs ?? []) for (const poly of discPolys(d)) fill(ctx, poly, pose, r);
  }
}

/** Круг диска и втулка — многоугольники на верхней грани (лицом к камере сверху). */
function discPolys(d: Disc): Poly[] {
  const cx = (d.min[0] + d.max[0]) / 2;
  const cz = (d.min[2] + d.max[2]) / 2;
  const R = (d.max[0] - d.min[0]) / 2;
  const y = d.min[1];
  const ring = (rad: number) =>
    Array.from({ length: 28 }, (_, k): Vec3 => {
      const a = (k / 28) * Math.PI * 2;
      return [cx + rad * Math.cos(a), y, cz + rad * Math.sin(a)];
    });
  return [
    { pts: ring(R), color: d.color },
    { pts: ring(R * 0.42), color: shade(d.color, 0.9) },
    { pts: ring(R * 0.16), color: d.hub },
  ];
}
