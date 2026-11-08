import { z } from 'zod';
import {
  BoardItemSchema,
  BoardThreadSchema,
  CameraSchema,
  type DeskItem,
  type Material,
  type PlayerState,
  PlayerStateSchema,
  STATE_VERSION,
  ViewSchema,
} from './schemas.ts';

/**
 * Начальная раскладка стола — свободная россыпь (LAY-A, 07.11; UX-B1, 08.11): у каждого ряда
 * свой сдвиг, заметный разброс и поворот; ряды заходят друг на друга низом листов, шапки видны —
 * издалека это не сетка. Одинаковая у всех игроков (разброс зависит только от номера места).
 * Ни одна бумага не закрыта целиком.
 */
export const SCATTER_COLS = 10;
export const SCATTER_DX = 210;
export const SCATTER_DY = 205;
export const SCATTER_JITTER_X = 45;
export const SCATTER_JITTER_Y = 25;
export const SCATTER_ROT_MAX = 9;

/**
 * Столешница в мировых координатах (UX-B1): у стола есть край, камера за него не уезжает.
 * Россыпь (10 столбцов × 5 рядов) лежит внутри с запасом места для своей раскладки.
 */
export const DESK_BOUNDS = { left: -420, top: -360, right: 2560, bottom: 1660 } as const;

/** Псевдослучайное число 0…1 по номеру места и «оси» — без состояния, всегда одинаковое. */
function noise(k: number, axis: number): number {
  let t = (k * 2654435761 + axis * 40503 + 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Место № k россыпи: координаты и поворот. */
export function scatterSlot(k: number): { x: number; y: number; rot: number } {
  const row = Math.floor(k / SCATTER_COLS);
  const col = k % SCATTER_COLS;
  // Сдвиг ряда — свой у каждого ряда, а не «через один»: иначе издалека видна сетка.
  const shift = Math.round(noise(row, 4) * SCATTER_DX * 0.6);
  return {
    x: Math.round(col * SCATTER_DX + shift + (noise(k, 1) * 2 - 1) * SCATTER_JITTER_X),
    y: Math.round(row * SCATTER_DY + (noise(k, 2) * 2 - 1) * SCATTER_JITTER_Y),
    rot: round1((noise(k, 3) * 2 - 1) * SCATTER_ROT_MAX),
  };
}

/** Закрытый материал, открытый игроком по ходу дела (L…), а не стартовый (01…51). */
export const isReleased = (m: Pick<Material, 'id'>) => m.id.startsWith('L');

const deskMaterials = (materials: Material[]) =>
  materials.filter((m) => m.placement === 'desk').sort((a, b) => a.id.localeCompare(b.id));

const defaultDesk = (materials: Material[]): PlayerState['desk'] => ({
  camera: { x: 0, y: 0, zoom: 1 },
  items: deskMaterials(materials.filter((m) => !isReleased(m))).map(
    (m, k): DeskItem => ({ materialId: m.id, ...scatterSlot(k), z: k + 1 }),
  ),
});

export function defaultState(materials: Material[]): PlayerState {
  return {
    version: STATE_VERSION,
    view: 'desk',
    desk: defaultDesk(materials),
    board: { camera: { x: 0, y: 0, zoom: 1 }, items: [], threads: [] },
  };
}

/** Сохранение версии 2 (этап 1b): стол лежал россыпью «через ряд» (до UX-B1). */
const StateV2Schema = PlayerStateSchema.extend({ version: z.literal(2) });

/** Сохранение версии 1 (этап 1): у бумаг не было поворота, стол лежал сеткой. */
const StateV1Schema = z.object({
  version: z.literal(1),
  view: ViewSchema,
  board: z.object({
    camera: CameraSchema,
    items: z.array(BoardItemSchema),
    threads: z.array(BoardThreadSchema),
  }),
});

/**
 * Сохранённое состояние любой известной версии → текущая версия (или null, если не разобрать).
 * Версии 1 и 2: стол раскладывается заново россыпью, доска и вид остаются.
 */
export function upgradeState(raw: unknown, materials: Material[]): PlayerState | null {
  const current = PlayerStateSchema.safeParse(raw);
  if (current.success) return current.data;
  const v2 = StateV2Schema.safeParse(raw);
  if (v2.success) {
    return { ...v2.data, version: STATE_VERSION, desk: defaultDesk(materials) };
  }
  const v1 = StateV1Schema.safeParse(raw);
  if (v1.success) {
    return {
      version: STATE_VERSION,
      view: v1.data.view,
      desk: defaultDesk(materials),
      board: v1.data.board,
    };
  }
  return null;
}

/** Приводит сохранённое состояние к текущему контенту: неизвестное убирает, недостающее кладёт в свободное место россыпи. */
export function reconcile(state: PlayerState, materials: Material[]): PlayerState {
  const deskIds = new Set(deskMaterials(materials).map((m) => m.id));
  const allIds = new Set(materials.map((m) => m.id));

  const seen = new Set<string>();
  const items = state.desk.items.filter((i) => {
    if (!deskIds.has(i.materialId) || seen.has(i.materialId)) return false;
    seen.add(i.materialId);
    return true;
  });

  const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
  const occupied = new Set(items.map(key));
  let z = items.reduce((max, i) => Math.max(max, i.z), 0);
  let k = 0;
  for (const m of deskMaterials(materials)) {
    if (seen.has(m.id)) continue;
    // Открытое по ходу дела ложится в лоток «Входящие», свежее — сверху (E2-INBOX-A).
    if (isReleased(m)) {
      items.push({ materialId: m.id, x: 0, y: 0, rot: 0, z: ++z, tray: true });
      continue;
    }
    while (occupied.has(key(scatterSlot(k)))) k++;
    const slot = scatterSlot(k);
    occupied.add(key(slot));
    items.push({ materialId: m.id, ...slot, z: ++z });
  }

  const boardItems = state.board.items.filter((i) => allIds.has(i.materialId));
  const boardIds = new Set(boardItems.map((i) => i.id));
  const threads = state.board.threads.filter((t) => boardIds.has(t.from) && boardIds.has(t.to));

  return {
    ...state,
    desk: { ...state.desk, items },
    board: { ...state.board, items: boardItems, threads },
  };
}
