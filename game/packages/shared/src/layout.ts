import {
  type Arrival,
  type Camera,
  type Material,
  type PlayerState,
  PlayerStateSchema,
  STATE_VERSION,
} from './schemas.ts';

/**
 * Стена (WALL-C, решение автора 08.11): вверху — колонки «как пришло», листы приколоты
 * лесенкой внахлёст (HANG-A), видна шапка каждого; ниже — поле для своей версии. У материала
 * одно место: в своей колонке (по умолчанию, положение вычисляется) или в поле (wall.items).
 * Предметы со стола (устройства, пакеты вещдоков) висят карточками (ITEM-A).
 */

/** Размер листа на стене в мировых координатах (совпадает с --card-width/--card-height). */
export const CARD_W = 160;
export const CARD_H = 220;
/** Ширина колонки с промежутком. */
export const COL_W = 210;
/** Высота шапки колонки (ярлык с номерами описи) вместе с отступом до первого листа. */
export const COL_HEADER_H = 52;
/** Шаг лесенки: столько видно от каждого листа, кроме последнего. */
export const SHINGLE_STEP = 58;
/** Колонок в ряду; следующие поступления начинают новый ряд ниже. */
export const BAND_COLS = 10;
export const BAND_ROW_GAP = 70;
/** Отступ поля для своей версии от колонок. */
export const FIELD_GAP = 140;

/**
 * Стартовые колонки — подряд идущие номера описи (файл 04). Подпись — только номера:
 * названия групп — решение автора (P-1: не подсказывать, что важно).
 */
export const STARTING_COLUMNS: readonly [number, number][] = [
  [1, 5],
  [6, 12],
  [13, 17],
  [18, 21],
  [22, 29],
  [30, 36],
  [37, 39],
  [40, 46],
  [47, 51],
];

export const DEFAULT_WALL_CAMERA: Camera = { x: 40, y: 40, zoom: 0.62 };

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Column {
  key: string;
  title: string;
  ids: string[];
}

export interface ColumnBox extends Column {
  x: number;
  y: number;
  /** Высота колонки вместе с шапкой. */
  h: number;
}

export interface Slot {
  x: number;
  y: number;
  rot: number;
  /** Порядок в колонке: нижний лист лесенки лежит поверх верхнего. */
  z: number;
  col: string;
}

export interface WallLayout {
  columns: ColumnBox[];
  slots: Map<string, Slot>;
  /** Нижний край колонок. */
  bandBottom: number;
  /** Верх поля для своей версии. */
  fieldTop: number;
  /** Край пробковой доски: камера за него не уезжает. */
  bounds: Bounds;
}

/** Закрытый материал, открытый игроком по ходу дела (L…), а не стартовый (01…51). */
export const isReleased = (m: Pick<Material, 'id'>) => m.id.startsWith('L');

/** Псевдослучайное число 0…1 по номеру и «оси» — без состояния, всегда одинаковое. */
function noise(k: number, axis: number): number {
  let t = (k * 2654435761 + axis * 40503 + 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const num = (id: string) => Number(id.replace(/\D/g, ''));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Лист на одной кнопке висит чуть косо — у каждого свой наклон, всегда одинаковый. */
export const hangTilt = (id: string): number => round1((noise(num(id), 5) * 2 - 1) * 2.5);

/** Колонки «как пришло»: стартовые по описи, затем по одной на каждое поступление (IN-B). */
export function wallColumns(materials: Material[], arrivals: Arrival[]): Column[] {
  const starting = materials.filter((m) => !isReleased(m)).map((m) => m.id);
  const used = new Set<string>();
  const columns: Column[] = STARTING_COLUMNS.map(([from, to]) => {
    const ids = starting.filter((id) => num(id) >= from && num(id) <= to).sort();
    for (const id of ids) used.add(id);
    return { key: `s${from}`, title: `Опись № ${from}–${to}`, ids };
  }).filter((c) => c.ids.length > 0);
  const rest = starting.filter((id) => !used.has(id)).sort();
  if (rest.length) columns.push({ key: 'rest', title: 'Опись', ids: rest });
  const known = new Set(materials.map((m) => m.id));
  arrivals.forEach((a, k) => {
    const ids = a.ids.filter((id) => known.has(id));
    if (ids.length) columns.push({ key: `a${k + 1}`, title: `Поступление № ${k + 1}`, ids });
  });
  return columns;
}

export const columnHeight = (n: number): number =>
  COL_HEADER_H + Math.max(0, n - 1) * SHINGLE_STEP + CARD_H;

/** Где висит каждая колонка и каждый лист в ней. */
export function wallLayout(columns: Column[]): WallLayout {
  const boxes: ColumnBox[] = [];
  const slots = new Map<string, Slot>();
  let rowTop = 0;
  let rowH = 0;
  columns.forEach((c, i) => {
    const k = i % BAND_COLS;
    if (k === 0 && i > 0) {
      rowTop += rowH + BAND_ROW_GAP;
      rowH = 0;
    }
    const box: ColumnBox = { ...c, x: k * COL_W, y: rowTop, h: columnHeight(c.ids.length) };
    rowH = Math.max(rowH, box.h);
    boxes.push(box);
    c.ids.forEach((id, j) => {
      slots.set(id, {
        x: box.x,
        y: box.y + COL_HEADER_H + j * SHINGLE_STEP,
        rot: hangTilt(id),
        z: j + 1,
        col: c.key,
      });
    });
  });
  const bandBottom = rowTop + rowH;
  const fieldTop = bandBottom + FIELD_GAP;
  const bandRight = Math.min(columns.length, BAND_COLS) * COL_W;
  return {
    columns: boxes,
    slots,
    bandBottom,
    fieldTop,
    bounds: {
      left: -260,
      top: -220,
      right: Math.max(bandRight, 2200) + 1000,
      bottom: fieldTop + 1700,
    },
  };
}

/** Лист отпустили у его колонки — он возвращается на своё место в лесенке. */
export function isOverOwnColumn(layout: WallLayout, id: string, x: number, y: number): boolean {
  const slot = layout.slots.get(id);
  const col = slot && layout.columns.find((c) => c.key === slot.col);
  if (!col) return false;
  return Math.abs(x - col.x) < COL_W / 2 && y > col.y - CARD_H / 2 && y < col.y + col.h;
}

export function defaultState(materials: Material[]): PlayerState {
  return reconcile(
    {
      version: STATE_VERSION,
      view: 'desk',
      wall: { camera: DEFAULT_WALL_CAMERA, items: [], threads: [], arrivals: [] },
    },
    materials,
  );
}

/**
 * Сохранённое состояние → текущая версия или null. Версии 1–3 (стол сверху и доска с
 * копиями) не переводятся: раскладка один раз начинается заново (решение «Стена», 08.11).
 */
export function upgradeState(raw: unknown, _materials: Material[]): PlayerState | null {
  const current = PlayerStateSchema.safeParse(raw);
  return current.success ? current.data : null;
}

/**
 * Приводит сохранённое состояние к текущему контенту: неизвестное убирает; открытое по ходу
 * дела, но ещё не висящее на стене, вешает новой колонкой-поступлением (IN-B).
 */
export function reconcile(state: PlayerState, materials: Material[]): PlayerState {
  const known = new Set(materials.map((m) => m.id));

  const seenItems = new Set<string>();
  const items = state.wall.items.filter((i) => {
    if (!known.has(i.materialId) || seenItems.has(i.materialId)) return false;
    seenItems.add(i.materialId);
    return true;
  });

  const inArrival = new Set<string>();
  const arrivals: Arrival[] = [];
  for (const a of state.wall.arrivals) {
    const ids = a.ids.filter((id) => known.has(id) && id.startsWith('L') && !inArrival.has(id));
    for (const id of ids) inArrival.add(id);
    if (ids.length) arrivals.push({ ids });
  }
  const fresh = materials
    .filter((m) => isReleased(m) && !inArrival.has(m.id))
    .map((m) => m.id)
    .sort();
  if (fresh.length) arrivals.push({ ids: fresh });

  const threads = state.wall.threads.filter(
    (t) => known.has(t.from) && known.has(t.to) && t.from !== t.to,
  );

  return { ...state, wall: { ...state.wall, items, threads, arrivals } };
}
