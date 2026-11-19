import { CONTAINER_IDS, CONTAINERS, type ContainerId, EPILOGUE_ID } from '@bunker/shared';
import { type Pose, type Room, toCamera, toScreen, type Vec3 } from './camera.ts';
import { DRIVE_IDLE, type DriveLook } from './drive.ts';

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
  const X = 0.72;
  const Z = 0.12;
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
      // Бирка — на самом лотке: под ним лежит газета.
      tagInside: true,
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
 * Конверты архива C4 (324 × 229 мм) — стопкой внахлёст, от дальнего к ближнему: в начале дела —
 * посередине перед игроком. Вскрыли «Осмотр места…» — на это место выложено изъятое (устройства),
 * оставшиеся конверты сдвинуты назад, за ноутбук (автор 19.11: «улики ближе к нам, крупно»).
 */
type EnvelopeId = Exclude<ContainerId, 'personal' | 'bank'>;
const ENVELOPE_AT: Record<EnvelopeId, [number, number]> = {
  bunker: [0.08, 0.555],
  scene: [0.1, 0.64],
  protocols: [0.12, 0.725],
};
const ENVELOPE_BACK: Record<EnvelopeId, [number, number]> = {
  bunker: [0.14, 0.36],
  scene: [0.16, 0.4],
  protocols: [0.18, 0.445],
};
const ENVELOPE_ORDER = ['bunker', 'scene', 'protocols'] as const;
/** Где стоит компьютер следователя (дисковод под монитором), доли p. */
const PC_X = -0.62;
const PC_Z = 0.34;
const C4: [number, number] = [0.324, 0.229];
/**
 * Короб с пачками — у стены правее середины; на нём — коробка из банка. Пока меньше настоящего
 * (BX-A — 38 × 30 × 25): 30 × 22 × 15, чтобы не спорил с компьютером (автор 19.11; размеры — на
 * этапе дизайна).
 */
const PAPERS_AT: [number, number] = [0.43, 0.125];
const PAPERS_H = 0.15;

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
  // (28 × 22 × 2,5 см; сам дисковод стоит прямо — лоток выезжает к игроку); системный
  // блок — под столом, его не видно. Диск дотащили до дисковода (DD-A) — лоток (14 см, выезжает
  // на 15) выходит к игроку и не достаёт до клавиатуры: ни во что не упирается.
  /** Поворот монитора к следователю, градусы. */
  const TURN = 25;
  const DRIVE_W = 0.28;
  const DRIVE_D = 0.22;
  const DRIVE_H = 0.025;
  const TRAY_X = PC_X + 0.03;
  const front = PC_Z + DRIVE_D / 2 + 0.002;
  const bay = col('--color-pc-bay');
  const trayD = 0.15 * drive.out;
  const pcBoxes: Box[] = [
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
  ];
  const trayDisc =
    drive.disc && drive.out > 0.6 ? [disc(TRAY_X, front + trayD / 2, 0.12, 0.016)] : [];
  // Подставка (22 × 16 см) и ножка монитора — на дисководе.
  const stand = turn(
    [
      box(PC_X, PC_Z - 0.02, 0.2, 0.15, 0.01, edge, DRIVE_H),
      box(PC_X, PC_Z - 0.04, 0.05, 0.035, 0.07, edge, DRIVE_H + 0.01),
    ],
    TURN,
    PC_X,
    PC_Z - 0.02,
  );
  const monitor: Box = {
    ...box(PC_X, PC_Z - 0.04, 0.5, 0.05, 0.33, col('--color-monitor'), DRIVE_H + 0.07),
    yaw: (TURN * Math.PI) / 180,
    pivot: [PC_X * p, (PC_Z - 0.02) * p],
  };
  const envelopes = ENVELOPE_ORDER.filter((id) => !opened.includes(id));
  // Коробка из банка — на коробе с пачками, если он уже на столе.
  const onPapers = opened.includes('bunker') ? PAPERS_H : 0;
  const [BX, BZ] = PAPERS_AT;
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
        // Настольная лампа: основание 15 см, высота 44 см, абажур 20 × 15.
        box(0.93, 0.1, 0.15, 0.15, 0.025, edge),
        box(0.93, 0.1, 0.02, 0.02, 0.34, edge, 0.025),
        box(0.85, 0.13, 0.2, 0.15, 0.08, col('--color-lamp'), 0.34),
      ],
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
    // Коробка «Личные вещи» (A-260): опечатана — крышка; вскрыта — пакеты сверху.
    opened.includes('personal')
      ? {
          key: 'bags',
          label: 'Коробка: личные вещи членов группы (40–46)',
          boxes: [
            box(-0.19, 0.25, 0.33, 0.23, 0.16, col('--color-box')),
            box(-0.21, 0.245, 0.24, 0.16, 0.03, col('--color-bag'), 0.15),
          ],
          tag: 'Личные вещи · 40–46',
          testId: 'bags-box',
        }
      : {
          key: 'bags',
          label: 'Коробка «Личные вещи», опечатана — вскрыть',
          boxes: [
            // Коробка 33 × 23 × 16 см (как коробка «В руках»), крышка и лента пломбы.
            box(-0.19, 0.25, 0.33, 0.23, 0.16, col('--color-box')),
            box(-0.19, 0.25, 0.34, 0.24, 0.015, col('--color-box-lid'), 0.16),
            box(-0.19, 0.25, 0.03, 0.24, 0.017, col('--color-seal'), 0.16),
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
        // Сложена вчетверо: 29 × 19 см; заголовок газеты — у дальнего края.
        box(0.49, 0.335, 0.29, 0.19, 0.012, col('--color-newspaper')),
        box(0.49, 0.27, 0.26, 0.035, 0.002, col('--color-newspaper-ink'), 0.012),
      ],
      hotspot: { kind: 'material' as const, id: '15' },
      testId: 'newspaper',
    },
    // Конверты архива (A-260): опечатаны, у каждого — название; вскрытый со стола уходит. C4,
    // стопкой внахлёст: у дальних видна полоска с названием — по ней и щёлкают.
    ...envelopes.map((id, k) => {
      const at = opened.includes('scene') ? ENVELOPE_BACK : ENVELOPE_AT;
      const [x, z] = at[id];
      const c = CONTAINERS.find((cc) => cc.id === id);
      const lift = k * 0.008;
      const next = envelopes[k + 1];
      const nearEdge = next ? at[next][1] - C4[1] / 2 : z + C4[1] / 2;
      const farEdge = z - C4[1] / 2;
      return {
        key: `envelope-${id}`,
        label: `Конверт «${c?.label ?? id}», опечатан — вскрыть`,
        boxes: [
          box(x, z, C4[0], C4[1], 0.008, col('--color-archive-envelope'), lift),
          box(x + 0.12, z - 0.08, 0.035, 0.025, 0.003, col('--color-seal'), lift + 0.008),
        ],
        hit: [box(x, (farEdge + nearEdge) / 2, C4[0], nearEdge - farEdge, 0.008, '', lift)],
        hotspot: { kind: 'container' as const, id },
        tag: c?.label ?? id,
        tagInside: true,
        tagLine: true,
        testId: `container-${id}`,
      };
    }),
    // Конверт с диском сервера (A-272, AC-2): у компьютера, правее дисковода; подсвечен, пока диск не
    // вставлен; вставили — пустой конверт уходит, диск остаётся в компьютере.
    ...(discOn === 'envelope'
      ? [
          {
            key: 'server-disc',
            label: 'Конверт «Прил. 7 · Сервер VL-31» — взять',
            boxes: [
              // Конверт C6 (162 × 114 мм), в нём диск 12 см.
              box(-0.38, 0.47, 0.162, 0.114, 0.006, col('--color-archive-envelope')),
              box(-0.38, 0.47, 0.1, 0.07, 0.002, col('--color-newspaper'), 0.006),
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
              discs: [disc(-0.38, 0.47, 0.12, 0)],
              hotspot: { kind: 'disc' as const },
              tag: 'Диск «Прил. 7»',
              tagInside: true,
              testId: 'server-disc-out',
              fresh: true,
            },
          ]
        : []),
    // Коробка из банка (A-272, AC-4): справа, у лампы; пока не вскрыта — подсвечена, как новое.
    ...(bank === 'box'
      ? [
          {
            key: 'bank-box',
            label: 'Коробка «Front Range Savings · ячейка № 845» — вскрыть',
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
    // Кассета и проигрыватель микрокассет бюро (L462) — из коробки банка, за ноутбуком.
    ...(bank === 'open'
      ? [
          {
            key: 'cassette',
            label: 'Проигрыватель микрокассет бюро и кассета «06.10.08»',
            boxes: [
              // Проигрыватель микрокассет 11 × 6 × 2,2 см и микрокассета 5 × 3,3 см.
              box(BX - 0.03, BZ, 0.11, 0.06, 0.022, col('--color-device'), onPapers),
              box(BX - 0.05, BZ, 0.04, 0.03, 0.003, col('--color-device-edge'), onPapers + 0.022),
              box(BX + 0.07, BZ, 0.05, 0.033, 0.007, col('--color-newspaper'), onPapers),
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
    {
      key: 'keyboard',
      label: 'Клавиатура',
      // 44 × 15 см — перед монитором, повёрнута с ним к следователю; лоток выезжает левее.
      boxes: turn([box(-0.34, 0.68, 0.44, 0.15, 0.03, edge)], 18, -0.34, 0.68),
    },
    {
      key: 'phone',
      label: 'Телефон следователя — позвонить',
      hotspot: { kind: 'deskphone' },
      testId: 'desk-phone',
      boxes: [
        // Офисный телефон 20 × 19 см, трубка 21 см.
        // Справа, ближе к игроку (автор 19.11).
        box(0.61, 0.64, 0.2, 0.19, 0.07, col('--color-phone')),
        box(0.555, 0.64, 0.055, 0.21, 0.04, col('--color-phone'), 0.07),
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

/** Светлее или темнее цвета #rrggbb в k раз. */
export function shade(color: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m?.[1]) return color;
  const v = Number.parseInt(m[1], 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * k)));
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
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
export function drawRoom(canvas: HTMLCanvasElement, pose: Pose, r: Room): void {
  const ctx = prepare(canvas, r);
  if (!ctx) return;
  const col = colors(canvas);
  ctx.fillStyle = col('--color-room-dark');
  ctx.fillRect(0, 0, r.vp.width, r.vp.height);
  for (const poly of roomPolys(r, col)) fill(ctx, poly, pose, r);
  // Свет лампы на столе — мягкое пятно под абажуром.
  const c = toCamera([0.8 * r.p, r.deskY, 0.32 * r.p], pose, r.p);
  if (c[2] < r.p - 1) {
    const s = toScreen(c, r.p, r.vp);
    const rad = (0.55 * r.p * r.p) / (r.p - c[2]);
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
    g.addColorStop(0, col('--color-lamp-light'));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.vp.width, r.vp.height);
  }
  // Отсвет включённого экрана на столе перед монитором — слабое голубое пятно.
  const m = toCamera([(PC_X + 0.08) * r.p, r.deskY, (PC_Z + 0.1) * r.p], pose, r.p);
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
): void {
  const ctx = prepare(canvas, r);
  if (!ctx) return;
  const col = colors(canvas);
  for (const o of sortObjects(
    deskObjects(r, col, inbox, opened, epilogue, disc, bank, drive),
    pose.eye,
  )) {
    const boxes = [...o.boxes].sort(
      (a, b) => dist(center(b), pose.eye) - dist(center(a), pose.eye),
    );
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
