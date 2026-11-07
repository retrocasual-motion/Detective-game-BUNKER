import type { DeskItem, Material, PlayerState } from './schemas.ts';

export const GRID_COLS = 10;
export const GRID_DX = 200;
export const GRID_DY = 260;

const cell = (k: number) => ({
  x: (k % GRID_COLS) * GRID_DX,
  y: Math.floor(k / GRID_COLS) * GRID_DY,
});

const deskMaterials = (materials: Material[]) =>
  materials.filter((m) => m.placement === 'desk').sort((a, b) => a.id.localeCompare(b.id));

export function defaultState(materials: Material[]): PlayerState {
  const items: DeskItem[] = deskMaterials(materials).map((m, k) => ({
    materialId: m.id,
    ...cell(k),
    z: k + 1,
  }));
  return {
    version: 1,
    view: 'desk',
    desk: { camera: { x: 0, y: 0, zoom: 1 }, items },
    board: { camera: { x: 0, y: 0, zoom: 1 }, items: [], threads: [] },
  };
}

/** Приводит сохранённое состояние к текущему контенту: неизвестное убирает, недостающее кладёт в сетку. */
export function reconcile(state: PlayerState, materials: Material[]): PlayerState {
  const deskIds = new Set(deskMaterials(materials).map((m) => m.id));
  const allIds = new Set(materials.map((m) => m.id));

  const seen = new Set<string>();
  const items = state.desk.items.filter((i) => {
    if (!deskIds.has(i.materialId) || seen.has(i.materialId)) return false;
    seen.add(i.materialId);
    return true;
  });

  const occupied = new Set(items.map((i) => `${i.x},${i.y}`));
  let z = items.reduce((max, i) => Math.max(max, i.z), 0);
  let k = 0;
  for (const m of deskMaterials(materials)) {
    if (seen.has(m.id)) continue;
    while (occupied.has(`${cell(k).x},${cell(k).y}`)) k++;
    const c = cell(k);
    occupied.add(`${c.x},${c.y}`);
    items.push({ materialId: m.id, ...c, z: ++z });
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
