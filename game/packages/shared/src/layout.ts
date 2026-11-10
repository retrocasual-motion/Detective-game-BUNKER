import {
  CONTAINERS,
  type ContainerId,
  containerContents,
  OFF_WALL_IDS,
  openedOf,
  sealedIds,
} from './archive.ts';
import { PERSONS } from './persons.ts';
import { joinedParts, pieceItemId } from './pieces.ts';
import {
  type Camera,
  type Material,
  type Note,
  type PlayerState,
  PlayerStateSchema,
  STATE_VERSION,
  type WallItem,
  ZOOM_MIN,
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
/** Шаг начальной сетки: между листами — место для нитей и подписей (правка автора 10.11). */
export const GRID_DX = 220;
export const GRID_DY = 300;
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

/**
 * Край пробковой доски: камера и вещи за него не уходят. WB-C (решение автора 10.11): доска
 * 16:9 — со стола и у стены видна целиком, одна и та же. 4800×2700 (правка автора 10.11:
 * 3600×2025 было тесно): всё дело (61 вещь с ярлыками) занимает не больше ~¾ ширины и
 * ~⅘ высоты при любом порядке вскрытия — справа и снизу остаётся место для своих записок
 * и нитей.
 */
export const WALL_BOUNDS = { left: -300, top: -300, right: 4500, bottom: 2400 } as const;

/** Группы конвертов раскладываются левее этой линии: правая часть доски — свободная пробка. */
const PLACE_RIGHT = 3200;

/** Зазор между группами конвертов (внутри группы — шаг сетки). */
const GROUP_GAP = 90;

/** Поле вокруг доски на экране, px: рама пробки видна целиком. */
export const BOARD_PAD = 24;

/** Колонок в группе вскрытого конверта: группы ложатся вширь, а не друг под другом. */
export const GROUP_COLS = 6;

/** «Разложить»: повешенное сверх стартового — правее сетки, столько в ряд. */
const REST_COLS = 5;

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
      // Новое дело (A-260): конверты на столе ещё опечатаны.
      opened: [],
    },
    materials,
  );
}

/**
 * Разложить стену по порядку (служебная кнопка для проверок, просьба автора 09.11): персонажи и
 * стартовые материалы — на начальные места (01, 02… сеткой по описи), повешенные письма и
 * записки — рядами правее сетки, по номеру. Нити, тексты записок и камера остаются.
 */
export function arrangeWall(state: PlayerState, materials: Material[]): PlayerState {
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
    // Остальное — правее сетки, рядами по REST_COLS (доска 16:9 — WB-C).
    const k = rest.indexOf(id);
    return onWall(
      GRID_COLS * GRID_DX + 100 + (k % REST_COLS) * GRID_DX,
      GRID_TOP + Math.floor(k / REST_COLS) * GRID_DY,
    );
  };
  const ordered = [...state.wall.items].sort((a, b) => {
    const pa = place(a.id);
    const pb = place(b.id);
    return pa.y - pb.y || pa.x - pb.x;
  });
  const items = ordered.map((i, k) => ({ ...i, ...place(i.id), z: k + 1, rot: hangTilt(i.id) }));
  return { ...state, wall: { ...state.wall, items } };
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
    // Папки, вынутые из пачек (RD-A): висят на стене папкой — «F:П-02/18».
    ...(state.taken ?? []).map(folderItemId),
    // Обрывки, вынутые из материалов (SRC-A): «S:42/1».
    ...(state.pieces ?? []).map(pieceItemId),
  ]);
  // Половины, сложенные в один лист (MG-A), на стене не висят — висит совмещённый.
  const parts = joinedParts(state.joined);

  // Корзина — только свои письма-ответы, без повторов; выброшенное на стене не висит.
  const trash = [...new Set(state.trash ?? [])].filter((id) => /^M/.test(id) && known.has(id));
  const binned = new Set(trash);
  const seen = new Set<string>();
  const items: WallItem[] = state.wall.items
    .filter((i) => {
      if (!known.has(i.id) || seen.has(i.id) || binned.has(i.id) || parts.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    // Доска стала меньше (WB-C): висевшее за новым краем — у края, на пробке.
    .map((i) => ({ ...i, ...onWall(i.x, i.y) }));
  // Записка без места на стене не нужна.
  const kept = notes.filter((n) => seen.has(n.id));

  let z = items.reduce((max, i) => Math.max(max, i.z), 0);
  // Стартовое — на стену, кроме невскрытого (A-260) и того, что лежит на столе или в браузере.
  // Сохранение до конвертов (нет `opened`) — как раньше: всё на стене.
  const sealed = sealedIds(state);
  const legacy = state.opened === undefined;
  for (const id of [...PERSONS.map((p) => p.id), ...startingIds(materials)]) {
    if (seen.has(id) || sealed.has(id) || parts.has(id) || (!legacy && OFF_WALL_IDS.has(id)))
      continue;
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

/** Папка, вынутая из пачки, на стене: «F:П-02/18» (taken «П-02/18»). */
export const folderItemId = (taken: string) => `F:${taken}`;

/** Ярлык группы конверта на стене. */
export const containerLabelId = (id: ContainerId) => `n:archive-${id}`;

const LABEL_H = 80;

/**
 * Свободное место на стене под блок w × h: самое верхнее, в нём — самое левое (WB-C: группы
 * ложатся вширь по доске, а не колонкой под стартовыми материалами).
 */
function freeBlock(
  items: WallItem[],
  widthOf: (id: string) => number,
  w: number,
  h: number,
): { x: number; y: number } | null {
  const gap = GROUP_GAP;
  const busy = (x: number, y: number) =>
    items.some(
      (i) =>
        i.x < x + w + gap &&
        i.x + widthOf(i.id) + gap > x &&
        i.y < y + h + gap &&
        i.y + CARD_H + gap > y,
    );
  for (let y = GRID_TOP; y + h <= BOARD_INNER.bottom; y += 30)
    for (let x = 0; x + w <= PLACE_RIGHT; x += 50) if (!busy(x, y)) return { x, y };
  return null;
}

/** Где на доске можно вешать группы: с отступом от рамы. */
const BOARD_INNER = { bottom: WALL_BOUNDS.bottom - 40 };

/** Сколько колонок пробовать для группы: шире — короче; берётся та, что ляжет выше. */
const GROUP_COL_CHOICES = [GRID_COLS, 8, GROUP_COLS, 4];

/**
 * Вскрыть конверт архива (A-260): содержимое — на стену группой под ярлыком с названием
 * конверта, на свободное место (со стола доска видна целиком — boardCamera).
 * Уже вскрытый — без изменений.
 */
export function openContainer(
  state: PlayerState,
  materials: Material[],
  id: ContainerId,
): PlayerState {
  const c = CONTAINERS.find((x) => x.id === id);
  if (!c || openedOf(state).includes(id)) return state;
  const opened = [...(state.opened ?? []), id];
  const have = new Set(materials.map((m) => m.id));
  const onWallNow = new Set(state.wall.items.map((i) => i.id));
  const ids = containerContents(c).filter((m) => have.has(m) && !onWallNow.has(m));
  if (!ids.length) return { ...state, opened };
  const labelW = Math.min(NOTE_STYLE.maxWidth, 60 + c.label.length * 15);
  const noteW = new Map(state.wall.notes.map((n) => [n.id, n.width ?? NOTE_STYLE[n.kind].width]));
  const widthOf = (x: string) => noteW.get(x) ?? CARD_W;
  // Форма группы — та, что ляжет выше всех (потом левее): доска заполняется вширь.
  const size = (cols: number) => {
    const rows = Math.ceil(ids.length / cols);
    return {
      w: Math.max(labelW, (cols - 1) * GRID_DX + CARD_W),
      h: LABEL_H + (rows - 1) * GRID_DY + CARD_H,
    };
  };
  let best: { cols: number; at: { x: number; y: number } } | null = null;
  for (const cols of new Set(GROUP_COL_CHOICES.map((k) => Math.min(k, ids.length)))) {
    const { w, h } = size(cols);
    const at = freeBlock(state.wall.items, widthOf, w, h);
    if (at && (!best || at.y < best.at.y || (at.y === best.at.y && at.x < best.at.x)))
      best = { cols, at };
  }
  // Места нет (игрок завесил доску) — у нижнего края слева; дальше разложит сам.
  const cols = best?.cols ?? Math.min(GROUP_COLS, ids.length);
  const at = best?.at ?? onWall(0, BOARD_INNER.bottom - size(cols).h);
  let z = state.wall.items.reduce((m, i) => Math.max(m, i.z), 0);
  const labelId = containerLabelId(id);
  // Ярлык — в одну строку, по длине названия.
  const label: Note = { id: labelId, kind: 'label', text: c.label, width: labelW };
  const placed: WallItem[] = [
    { id: labelId, x: at.x, y: at.y, z: ++z, rot: 0 },
    ...ids.map((m, k) => ({
      id: m,
      x: at.x + (k % cols) * GRID_DX,
      y: at.y + LABEL_H + Math.floor(k / cols) * GRID_DY,
      z: ++z,
      rot: hangTilt(m),
    })),
  ];
  const keepNotes = state.wall.notes.filter((n) => n.id !== labelId);
  return {
    ...state,
    opened,
    wall: {
      ...state.wall,
      items: [...state.wall.items.filter((i) => i.id !== labelId), ...placed],
      notes: [...keepNotes, label],
    },
  };
}

/** Вскрыть всё сразу (служебная кнопка «Подготовка», автотесты): стартовая сетка, как до конвертов. */
export function openAll(state: PlayerState, materials: Material[]): PlayerState {
  return reconcile({ ...state, opened: CONTAINERS.map((c) => c.id) }, materials);
}

/**
 * Камера «вся доска» (WB-C, ZM-B; решения автора 10.11): пробка целиком, по центру экрана, с
 * полем BOARD_PAD. Со стола доска видна так, к стене подходят в этот же вид, и дальше него
 * не отдалить — со стола и у стены одна и та же доска.
 */
export function boardCamera(vp: { width: number; height: number }): Camera {
  const w = WALL_BOUNDS.right - WALL_BOUNDS.left;
  const h = WALL_BOUNDS.bottom - WALL_BOUNDS.top;
  const zoom = Math.max(
    ZOOM_MIN,
    Math.min((vp.width - 2 * BOARD_PAD) / w, (vp.height - 2 * BOARD_PAD) / h),
  );
  const round = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    x: round((vp.width - w * zoom) / 2 - WALL_BOUNDS.left * zoom),
    y: round((vp.height - h * zoom) / 2 - WALL_BOUNDS.top * zoom),
    zoom: round(zoom),
  };
}

/** Камера стены обычного масштаба, подведённая к точке стены (левый верхний угол с полями). */
export function focusCamera(x: number, y: number): Camera {
  const { zoom } = DEFAULT_WALL_CAMERA;
  return {
    x: Math.round(Math.min(DEFAULT_WALL_CAMERA.x - x * zoom, -WALL_BOUNDS.left * zoom)),
    y: Math.round(Math.min(DEFAULT_WALL_CAMERA.y - y * zoom, -WALL_BOUNDS.top * zoom)),
    zoom,
  };
}
