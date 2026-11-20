import { DESK_PHONE } from '../room/camera.ts';

/**
 * Объёмная модель телефона следователя (6a-3, DP-A; автор 20.11: «чтобы ощущался как 3D:
 * трубка объёмная, кнопки ощутимые»). Части — бруски, как остальные вещи на столе (`decor.ts`
 * рисует их с гранями и тенью); поверх — плоские надписи и зоны щелчка (`PhoneFace`): цифры на
 * верхе кнопок, текст экранчика. Размеры — метры (доли p), как у стола (RS-A): корпус 26 × 16 см.
 */

/** Как выглядит телефон сейчас: снята ли трубка, какая кнопка утоплена. */
export interface PhoneLook {
  offHook: boolean;
  pressed: string | null;
}
export const PHONE_IDLE: PhoneLook = { offHook: false, pressed: null };

export type PartColor = 'body' | 'ridge' | 'handset' | 'key' | 'bezel' | 'lcd' | 'cradle';

/** Брусок: центр (x, z), ширина, глубина, высота, высота низа над столом; поворот трубки. */
export interface Part {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  lift: number;
  color: PartColor;
  /** Поворот вокруг вертикали, градусы, вокруг (pivot) — у снятой трубки. */
  yaw?: number;
  pivot?: [number, number];
}

/** Плоская зона на верхе бруска: надпись или место щелчка. */
export interface Spot {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Высота верха над столом. */
  top: number;
}

const { x: CX, z: CZ } = DESK_PHONE;
/** Верх корпуса. */
const BODY = 0.042;
/** Задний выступ корпуса (под экранчиком и наушником) — телефон «с наклоном» к игроку. */
const RIDGE = 0.014;

export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;
const KEY_W = 0.028;
const KEY_D = 0.017;
const KEY_H = 0.008;
const KEY_PRESSED = 0.003;

/** Центр кнопки: 3 столбца × 4 строки справа от трубки. */
function keyCenter(k: string): [number, number] {
  const i = KEYS.indexOf(k as (typeof KEYS)[number]);
  const col = i % 3;
  const row = Math.floor(i / 3);
  return [CX + 0.02 + col * 0.036, CZ + 0.004 + row * 0.022];
}

/** Трубка: наушник, ручка, микрофон — вдоль телефона (от стены к игроку), слева. */
const HS_X = CX - 0.083;
/** Снятая трубка: поднята над рычагом, к игроку и влево, чуть повёрнута. */
const LIFT = { dx: -0.012, dz: 0.012, up: 0.03, yaw: 10 };

function handset(look: PhoneLook): Part[] {
  const up = look.offHook ? LIFT.up : 0;
  const dx = look.offHook ? LIFT.dx : 0;
  const dz = look.offHook ? LIFT.dz : 0;
  const turn = look.offHook
    ? { yaw: LIFT.yaw, pivot: [HS_X + dx, CZ + dz] as [number, number] }
    : {};
  const base = BODY + RIDGE * 0.5; // на упорах рычага
  return [
    {
      x: HS_X + dx,
      z: CZ - 0.05 + dz,
      w: 0.07,
      d: 0.046,
      h: 0.03,
      lift: base + up,
      color: 'handset',
      ...turn,
    },
    {
      x: HS_X + dx,
      z: CZ + dz,
      w: 0.032,
      d: 0.07,
      h: 0.02,
      lift: base + 0.014 + up,
      color: 'handset',
      ...turn,
    },
    {
      x: HS_X + dx,
      z: CZ + 0.05 + dz,
      w: 0.07,
      d: 0.046,
      h: 0.03,
      lift: base + up,
      color: 'handset',
      ...turn,
    },
  ];
}

export function phoneParts(look: PhoneLook = PHONE_IDLE): Part[] {
  const keys: Part[] = KEYS.map((k) => {
    const [x, z] = keyCenter(k);
    const h = look.pressed === k ? KEY_PRESSED : KEY_H;
    return { x, z, w: KEY_W, d: KEY_D, h, lift: BODY, color: 'key' };
  });
  return [
    // Корпус и задний выступ.
    { x: CX, z: CZ, w: DESK_PHONE.w, d: DESK_PHONE.d, h: BODY, lift: 0, color: 'body' },
    { x: CX + 0.0425, z: CZ - 0.05, w: 0.165, d: 0.06, h: RIDGE, lift: BODY, color: 'ridge' },
    // Рычаг под трубкой: два упора.
    { x: HS_X, z: CZ - 0.05, w: 0.05, d: 0.018, h: RIDGE * 0.5, lift: BODY, color: 'cradle' },
    { x: HS_X, z: CZ + 0.05, w: 0.05, d: 0.018, h: RIDGE * 0.5, lift: BODY, color: 'cradle' },
    // Экранчик: рамка на выступе и стекло.
    {
      x: CX + 0.056,
      z: CZ - 0.05,
      w: 0.16,
      d: 0.052,
      h: 0.004,
      lift: BODY + RIDGE,
      color: 'bezel',
    },
    {
      x: CX + 0.056,
      z: CZ - 0.05,
      w: 0.148,
      d: 0.044,
      h: 0.002,
      lift: BODY + RIDGE + 0.004,
      color: 'lcd',
    },
    // Клавиши под экранчиком: «Стереть», «Повтор».
    ...softKeyParts(),
    ...keys,
    ...handset(look),
  ];
}

const SOFT = [
  { id: 'erase', x: CX + 0.012 },
  { id: 'redial', x: CX + 0.1 },
] as const;
const SOFT_Z = CZ - 0.013;
/** Клавиши под экранчиком: 12 мм в глубину — на малом экране не меньше пальца (UX-14, MS-4). */
const SOFT_D = 0.012;

function softKeyParts(): Part[] {
  return SOFT.map((s) => ({
    x: s.x,
    z: SOFT_Z,
    w: 0.032,
    d: SOFT_D,
    h: 0.005,
    lift: BODY,
    color: 'key',
  }));
}

/** Где надписи и зоны щелчка (верх брусков). */
export function phoneSpots(look: PhoneLook = PHONE_IDLE) {
  const keys = Object.fromEntries(
    KEYS.map((k) => {
      const [x, z] = keyCenter(k);
      const h = look.pressed === k ? KEY_PRESSED : KEY_H;
      return [k, { x, z, w: KEY_W, d: KEY_D, top: BODY + h } satisfies Spot];
    }),
  ) as Record<(typeof KEYS)[number], Spot>;
  const soft = Object.fromEntries(
    SOFT.map((s) => [
      s.id,
      { x: s.x, z: SOFT_Z, w: 0.032, d: SOFT_D, top: BODY + 0.005 } satisfies Spot,
    ]),
  ) as Record<'erase' | 'redial', Spot>;
  const hs = handset(look);
  const ear = hs[0] as Part;
  return {
    lcd: {
      x: CX + 0.056,
      z: CZ - 0.05,
      w: 0.148,
      d: 0.044,
      top: BODY + RIDGE + 0.0061,
    } satisfies Spot,
    keys,
    soft,
    // Трубка: вся длина (наушник — микрофон), щелчок — снять / положить.
    handset: {
      x: ear.x,
      z: CZ + (look.offHook ? LIFT.dz : 0),
      w: 0.07,
      d: 0.146,
      top: ear.lift + ear.h + 0.0005,
    } satisfies Spot,
    handsetYaw: look.offHook ? LIFT.yaw : 0,
    // Корпус и задний выступ: щелчок по ним — ничего, не «мимо телефона» (UX-2, UN-3).
    body: { x: CX, z: CZ, w: DESK_PHONE.w, d: DESK_PHONE.d, top: BODY } satisfies Spot,
    ridge: { x: CX + 0.0425, z: CZ - 0.05, w: 0.165, d: 0.06, top: BODY + RIDGE } satisfies Spot,
  };
}
