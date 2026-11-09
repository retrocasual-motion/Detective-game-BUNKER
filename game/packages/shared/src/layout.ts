import { PERSONS } from './persons.ts';
import {
  type Camera,
  type Material,
  type Note,
  type PlayerState,
  PlayerStateSchema,
  STATE_VERSION,
  type WallItem,
} from './schemas.ts';

/**
 * Стена (WALL-C; правки автора 09.11): всё висит свободно, игрок раскладывает как хочет —
 * групп и колонок нет. С начала: карточки персонажей рядом сверху, ниже стартовые материалы
 * сеткой по номеру описи (нейтральный порядок, без подписей). Открытое по ходу дела ждёт во
 * «Входящих» на столе, пока игрок не повесит его на стену.
 */

/** Размер листа на стене в мировых координатах (совпадает с --card-width/--card-height). */
export const CARD_W = 160;
export const CARD_H = 220;
/** Шаг начальной сетки. */
export const GRID_DX = 200;
export const GRID_DY = 270;
export const GRID_COLS = 10;
/** Начальная сетка материалов — ниже ряда персонажей. */
export const GRID_TOP = 320;

/** Размер шрифта и ширина записки и ярлыка по умолчанию; пределы правки (как в Miro). */
export const NOTE_STYLE = {
  note: { size: 20, width: 190 },
  label: { size: 24, width: 260 },
  minSize: 10,
  maxSize: 64,
  minWidth: 80,
  maxWidth: 900,
} as const;

/** Край пробковой доски: камера и вещи за него не уходят. */
export const WALL_BOUNDS = { left: -300, top: -300, right: 3700, bottom: 2700 } as const;

export const DEFAULT_WALL_CAMERA: Camera = { x: 40, y: 50, zoom: 0.55 };

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Пришло по ходу дела (закрытый материал L… или письмо-ответ M…), а не стартовое (01…51). */
export const isReleased = (m: Pick<Material, 'id'>) => /^[LM]/.test(m.id);

/** Псевдослучайное число 0…1 по номеру и «оси» — без состояния, всегда одинаковое. */
function noise(k: number, axis: number): number {
  let t = (k * 2654435761 + axis * 40503 + 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const hash = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Вещь на одной кнопке висит чуть косо — у каждой свой наклон, всегда одинаковый. */
export const hangTilt = (id: string): number => round1((noise(hash(id), 5) * 2 - 1) * 2.5);

/** Вещь не уходит за край доски: верхний левый угол остаётся на пробке. */
export const onWall = (x: number, y: number) => ({
  x: Math.min(WALL_BOUNDS.right - 80, Math.max(WALL_BOUNDS.left, x)),
  y: Math.min(WALL_BOUNDS.bottom - 80, Math.max(WALL_BOUNDS.top, y)),
});

const startingIds = (materials: Material[]) =>
  materials
    .filter((m) => !isReleased(m))
    .map((m) => m.id)
    .sort();

/** Начальное место: персонажи — ряд сверху, материалы — сетка по описи. */
export function startSlot(id: string, materials: Material[]): { x: number; y: number } | null {
  const p = PERSONS.findIndex((x) => x.id === id);
  if (p >= 0) return { x: p * GRID_DX, y: 0 };
  const k = startingIds(materials).indexOf(id);
  if (k < 0) return null;
  return { x: (k % GRID_COLS) * GRID_DX, y: GRID_TOP + Math.floor(k / GRID_COLS) * GRID_DY };
}

/** «Входящие» на столе: открытое по ходу дела, но ещё не повешенное; свежее — первым. */
export function inboxIds(state: PlayerState, materials: Material[]): string[] {
  const hidden = new Set([...state.wall.items.map((i) => i.id), ...(state.trash ?? [])]);
  return materials
    .filter((m) => isReleased(m) && !hidden.has(m.id))
    .map((m) => m.id)
    .reverse();
}

export function defaultState(materials: Material[]): PlayerState {
  return reconcile(
    {
      version: STATE_VERSION,
      view: 'desk',
      wall: { camera: DEFAULT_WALL_CAMERA, items: [], threads: [], notes: [] },
      drafts: [],
      trash: [],
    },
    materials,
  );
}

/**
 * Разложить стену по порядку (служебная кнопка для проверок, просьба автора 09.11): персонажи и
 * стартовые материалы — на начальные места (01, 02… сеткой по описи), повешенные письма и
 * записки — рядами под сеткой, по номеру. Нити и тексты записок остаются, камера — исходная.
 */
export function arrangeWall(state: PlayerState, materials: Material[]): PlayerState {
  const rows = Math.ceil(startingIds(materials).length / GRID_COLS);
  const restTop = GRID_TOP + rows * GRID_DY;
  const noteOrder = new Map(state.wall.notes.map((n, i) => [n.id, i]));
  const rest = state.wall.items
    .filter((i) => !startSlot(i.id, materials))
    .sort((a, b) => {
      const na = noteOrder.get(a.id);
      const nb = noteOrder.get(b.id);
      if (na !== undefined || nb !== undefined) return (na ?? -1) - (nb ?? -1);
      return a.id.localeCompare(b.id);
    })
    .map((i) => i.id);
  const place = (id: string) => {
    const slot = startSlot(id, materials);
    if (slot) return slot;
    const k = rest.indexOf(id);
    return { x: (k % GRID_COLS) * GRID_DX, y: restTop + Math.floor(k / GRID_COLS) * GRID_DY };
  };
  const ordered = [...state.wall.items].sort((a, b) => {
    const pa = place(a.id);
    const pb = place(b.id);
    return pa.y - pb.y || pa.x - pb.x;
  });
  const items = ordered.map((i, k) => ({ ...i, ...place(i.id), z: k + 1, rot: hangTilt(i.id) }));
  return { ...state, wall: { ...state.wall, camera: DEFAULT_WALL_CAMERA, items } };
}

/** Сохранение версии 4 (колонки «как пришло»): снятое в поле и нити остаются. */
interface StateV4 {
  version: 4;
  view: 'desk' | 'wall';
  wall: {
    camera: Camera;
    items: { materialId: string; x: number; y: number; z: number; rot: number }[];
    threads: PlayerState['wall']['threads'];
  };
}

const isV4 = (raw: unknown): raw is StateV4 => {
  const r = raw as StateV4 | null;
  return (
    !!r &&
    r.version === 4 &&
    Array.isArray(r.wall?.items) &&
    Array.isArray(r.wall?.threads) &&
    r.wall.items.every((i) => typeof i.materialId === 'string' && Number.isFinite(i.x))
  );
};

/**
 * Сохранённое состояние → текущая версия или null. Версия 4: снятое в поле и нити
 * остаются, остальное вешается сеткой. Версии 1–3 не переводятся.
 */
export function upgradeState(raw: unknown, materials: Material[]): PlayerState | null {
  const current = PlayerStateSchema.safeParse(raw);
  if (current.success) return current.data;
  if (!isV4(raw)) return null;
  const next = PlayerStateSchema.safeParse({
    version: STATE_VERSION,
    view: raw.view,
    wall: {
      camera: raw.wall.camera,
      items: raw.wall.items.map(({ materialId, x, y, z, rot }) => ({
        id: materialId,
        x,
        y,
        z,
        rot,
      })),
      threads: raw.wall.threads,
      notes: [],
    },
  });
  return next.success ? reconcile(next.data, materials) : null;
}

/**
 * Приводит сохранённое состояние к текущему контенту: неизвестное убирает; недостающих
 * персонажей и стартовые материалы вешает на их начальные места. Открытое по ходу дела
 * на стену само не вешается — оно во «Входящих».
 */
export function reconcile(state: PlayerState, materials: Material[]): PlayerState {
  const seenNotes = new Set<string>();
  const notes: Note[] = state.wall.notes.filter((n) => {
    if (seenNotes.has(n.id)) return false;
    seenNotes.add(n.id);
    return true;
  });
  const known = new Set([
    ...materials.map((m) => m.id),
    ...PERSONS.map((p) => p.id),
    ...notes.map((n) => n.id),
  ]);

  // Корзина — только свои письма-ответы, без повторов; выброшенное на стене не висит.
  const trash = [...new Set(state.trash ?? [])].filter((id) => /^M/.test(id) && known.has(id));
  const binned = new Set(trash);
  const seen = new Set<string>();
  const items: WallItem[] = state.wall.items.filter((i) => {
    if (!known.has(i.id) || seen.has(i.id) || binned.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  // Записка без места на стене не нужна.
  const kept = notes.filter((n) => seen.has(n.id));

  let z = items.reduce((max, i) => Math.max(max, i.z), 0);
  for (const id of [...PERSONS.map((p) => p.id), ...startingIds(materials)]) {
    if (seen.has(id)) continue;
    const slot = startSlot(id, materials);
    if (!slot) continue;
    items.push({ id, ...slot, z: ++z, rot: hangTilt(id) });
    seen.add(id);
  }

  const threads = state.wall.threads.filter(
    (t) => seen.has(t.from) && seen.has(t.to) && t.from !== t.to,
  );

  // Карточка черновика ссылается только на то, что у игрока есть.
  const ids = new Set(materials.map((m) => m.id));
  const card = <T extends { file: string } | null>(c: T): T | null =>
    c && !ids.has(c.file) ? null : c;
  const drafts = (state.drafts ?? []).map((d) => ({
    ...d,
    ask: card(d.ask),
    basis: card(d.basis),
  }));

  return { ...state, wall: { ...state.wall, items, threads, notes: kept }, drafts, trash };
}
