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
 * Начальная раскладка стола — свободная россыпь (решение автора LAY-A, 07.11.2026):
 * ряды со сдвигом через один, небольшой разброс и поворот. Одинаковая у всех игроков
 * (разброс зависит только от номера места). Ни одна бумага не закрыта целиком.
 */
export const SCATTER_COLS = 10;
export const SCATTER_DX = 205;
export const SCATTER_DY = 255;
export const SCATTER_JITTER_X = 30;
export const SCATTER_JITTER_Y = 24;
export const SCATTER_ROT_MAX = 7;

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
  const shift = row % 2 === 1 ? SCATTER_DX / 2 : 0;
  return {
    x: Math.round(col * SCATTER_DX + shift + (noise(k, 1) * 2 - 1) * SCATTER_JITTER_X),
    y: Math.round(row * SCATTER_DY + (noise(k, 2) * 2 - 1) * SCATTER_JITTER_Y),
    rot: round1((noise(k, 3) * 2 - 1) * SCATTER_ROT_MAX),
  };
}

const deskMaterials = (materials: Material[]) =>
  materials.filter((m) => m.placement === 'desk').sort((a, b) => a.id.localeCompare(b.id));

const defaultDesk = (materials: Material[]): PlayerState['desk'] => ({
  camera: { x: 0, y: 0, zoom: 1 },
  items: deskMaterials(materials).map(
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
 * Версия 1: стол раскладывается заново россыпью, доска и вид остаются.
 */
export function upgradeState(raw: unknown, materials: Material[]): PlayerState | null {
  const current = PlayerStateSchema.safeParse(raw);
  if (current.success) return current.data;
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
