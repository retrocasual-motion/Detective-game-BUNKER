import {
  BOX_KEEPS,
  CONTAINERS,
  type ContainerId,
  containerContents,
  DESK_DEVICES,
  DEVICES_ON_WALL,
  INVENTORY_ID,
  NEVER_ON_WALL,
  NEWSPAPER_AT,
  NEWSPAPER_ID,
  OFF_WALL_IDS,
  openedOf,
  SPILL_CONTAINERS,
  START_STACK,
  sealedIds,
} from './archive.ts';
import { PERSONS } from './persons.ts';
import { joinedParts, pieceItemId } from './pieces.ts';
import { salvage } from './salvage.ts';
import {
  type Camera,
  CameraSchema,
  type DeskItem,
  type Material,
  type Note,
  type PlayerState,
  PlayerStateSchema,
  STATE_VERSION,
  ViewSchema,
  type WallExcerpt,
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

/** Пришло по ходу дела (закрытый материал L…), а не стартовое (01…52). */
export const isReleased = (m: Pick<Material, 'id'>) => /^L/.test(m.id);

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
  const hidden = new Set([
    ...state.wall.items.map((i) => i.id),
    // Вынутая папка висит на стене папкой — её материал не во «Входящих» (DS-A).
    ...(state.taken ?? []).flatMap((t) => FOLDER_DOCS[t] ?? []),
    // Файлы устройств — на устройстве (LW-A).
    ...Object.values(DEVICE_MATERIALS).flat(),
    // Предупреждение и форма заключения — окна «Решить дело», не материалы дела (A-270).
    ...FORM_MATERIALS,
    // Коробка из банка не вскрыта — её содержимое в ней, не в лотке (A-272).
    ...sealedIds(state),
    // Лежит на столе свободно (3D-стол) — не во «Входящих».
    ...(state.desk ?? []).map((d) => d.id),
  ]);
  const released = materials
    // Свойства файла записи — под её плеером, не во «Входящих» (ручная проверка автора 21.11, Q.1).
    .filter((m) => isReleased(m) && !hidden.has(m.id) && !isFileProps(m))
    .map((m) => m.id)
    .reverse();
  // Газета (автор 26.11) — во «Входящих», пока её не повесили на стену и не положили на стол.
  const paper =
    state.opened !== undefined &&
    materials.some((m) => m.id === NEWSPAPER_ID) &&
    !hidden.has(NEWSPAPER_ID)
      ? [NEWSPAPER_ID]
      : [];
  return [...released, ...paper];
}

/** «Свойства файла (файл 13)» и т. п. — табличка у плеера записи (A-251, F3). */
export const isFileProps = (m: Material) => /^Свойства файл/.test(m.title);

export function defaultState(materials: Material[]): PlayerState {
  return reconcile(
    {
      version: STATE_VERSION,
      view: 'desk',
      wall: { camera: { ...DEFAULT_WALL_CAMERA }, items: [], threads: [], notes: [] },
      // Новое дело (A-260): конверты на столе ещё опечатаны.
      opened: [],
      // Стартовые листы — стопкой на столе, письмо бюро сверху (ST-B); опись — отдельно, на
      // планшете (OPS-A). Место решит стол.
      desk: [...START_STACK, INVENTORY_ID]
        .filter((id) => materials.some((m) => m.id === id))
        .map((id, k) => ({ id, layer: k + 1 })),
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
  return readSaved(raw, materials).state;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Прочитать сохранение (RV-49, RV-54, волна 1). Версия 5 и новее читается по частям: неверное значение
 * выпадает одно (`dropped` — что выпало), а не всё дело. 5 → 6: прежняя догадка «вскрыт „Осмотр места“
 * — вскрыт и пакет „Изъятое“» применяется один раз, при переводе; в версии 6 её больше нет. Версия
 * новее текущей (откат сборки) читается так же — понятое остаётся.
 */
export function readSaved(
  raw: unknown,
  materials: Material[],
): { state: PlayerState | null; dropped: string[] } {
  const dropped: string[] = [];
  if (isV4(raw)) return { state: fromV4(raw, materials), dropped };
  if (!isPlainObject(raw) || typeof raw.version !== 'number' || raw.version < 5)
    return { state: null, dropped: ['*'] };
  const from = raw.version;
  // Обязательное, без чего дело не собрать, — по умолчанию; остальное — как есть.
  const wall = isPlainObject(raw.wall) ? raw.wall : {};
  const body = {
    ...raw,
    version: STATE_VERSION,
    view: ViewSchema.safeParse(raw.view).success ? raw.view : 'desk',
    wall: {
      ...wall,
      camera: CameraSchema.safeParse(wall.camera).success
        ? wall.camera
        : { ...DEFAULT_WALL_CAMERA },
      items: Array.isArray(wall.items) ? wall.items : [],
      threads: Array.isArray(wall.threads) ? wall.threads : [],
      notes: Array.isArray(wall.notes) ? wall.notes : [],
    },
  };
  const r = salvage(PlayerStateSchema, body, '', dropped);
  if (!r.ok) return { state: null, dropped: ['*'] };
  const state = r.value as PlayerState;
  return { state: from === 5 ? seizedFromScene(state) : state, dropped };
}

function fromV4(raw: StateV4, materials: Material[]): PlayerState | null {
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
 * Сохранение до FM-B (автор 25.11): устройства лежали в «Осмотре места» и вскрывались вместе с ним.
 * Вскрыт «Осмотр места», а пакета «Изъятое» в `opened` нет, и устройства уже были у игрока (на
 * столе, на стене или сохранение до 3D-стола, без `desk`) — пакет тоже вскрыт.
 */
function seizedFromScene(state: PlayerState): PlayerState {
  const opened = state.opened;
  if (!opened?.includes('scene') || opened.includes('seized')) return state;
  const had =
    state.desk === undefined ||
    state.desk.some((d) => DESK_DEVICES.has(d.id)) ||
    state.wall.items.some((i) => DESK_DEVICES.has(i.id));
  return had ? { ...state, opened: [...opened, 'seized'] } : state;
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
    // Выписки (A-272): только из материалов, что у игрока есть.
    ...excerptsOf(state, materials).map((x) => x.id),
  ]);
  // Половины, сложенные в один лист (MG-A), на стене не висят — висит совмещённый.
  // Совмещённые листы — только те, что у игрока есть (RV-55): иначе чужой номер прятал бы половины.
  const owned = new Set(materials.map((m) => m.id));
  const joined = state.joined?.filter((id) => owned.has(id));
  const parts = joinedParts(joined);
  // Устройства стола на стене не висят (DEVICES_ON_WALL) — они на столе.
  const deskOnly = (id: string) => !DEVICES_ON_WALL && DESK_DEVICES.has(id);

  const seen = new Set<string>();
  const items: WallItem[] = state.wall.items
    .filter((i) => {
      if (
        !known.has(i.id) ||
        seen.has(i.id) ||
        parts.has(i.id) ||
        NEVER_ON_WALL.has(i.id) ||
        deskOnly(i.id)
      )
        return false;
      seen.add(i.id);
      return true;
    })
    // Доска стала меньше (WB-C): висевшее за новым краем — у края, на пробке.
    .map((i) => ({ ...i, ...onWall(i.x, i.y) }));
  // Записка без места на стене не нужна.
  const kept = notes.filter((n) => seen.has(n.id));

  // Стол (3D-стол): только то, что у игрока есть, без повторов; висящее на стене — уже не на столе.
  const have = new Set(materials.map((m) => m.id));
  const onDesk = new Set<string>();
  const desk = (state.desk ?? []).filter((d) => {
    if (!have.has(d.id) || seen.has(d.id) || onDesk.has(d.id) || parts.has(d.id)) return false;
    onDesk.add(d.id);
    return true;
  });
  // Устройство вскрытого конверта, которого нет ни на столе, ни на стене (старое сохранение, «всё
  // вскрыто»), — на стол: место решит стол.
  const sealedNow = sealedIds(state);
  let deskTop = desk.reduce((m, d) => Math.max(m, d.layer), 0);
  for (const id of DESK_DEVICES)
    if (deskOnly(id) && have.has(id) && !sealedNow.has(id) && !onDesk.has(id)) {
      desk.push({ id, layer: ++deskTop });
      onDesk.add(id);
    }

  // Газета (автор 26.11): в новом деле — во «Входящих» на столе, не на столе свободно (освобождает
  // середину стола под папки); лежала на столе в прежнем сохранении — так и лежит.

  let z = items.reduce((max, i) => Math.max(max, i.z), 0);
  // Стартовое — на стену, кроме невскрытого (A-260) и того, что лежит на столе или в браузере.
  // Сохранение до конвертов (нет `opened`) — как раньше: всё на стене.
  const sealed = sealedIds(state);
  const legacy = state.opened === undefined;
  for (const id of [...PERSONS.map((p) => p.id), ...startingIds(materials)]) {
    if (
      seen.has(id) ||
      sealed.has(id) ||
      parts.has(id) ||
      onDesk.has(id) ||
      deskOnly(id) ||
      (!legacy && OFF_WALL_IDS.has(id)) ||
      // Пакеты вскрытой коробки — в коробке (BOX-B): на стену их вешает игрок, не игра.
      (!legacy && BOX_KEEPS.has(id) && !state.wall.items.some((i) => BOX_KEEPS.has(i.id))) ||
      NEVER_ON_WALL.has(id)
    )
      continue;
    const slot = startSlot(id, materials);
    if (!slot) continue;
    items.push({ id, ...slot, z: ++z, rot: hangTilt(id) });
    seen.add(id);
  }

  const threads = state.wall.threads.filter(
    (t) => seen.has(t.from) && seen.has(t.to) && t.from !== t.to,
  );

  const excerpts = excerptsOf(state, materials).filter((x) => seen.has(x.id));
  return {
    ...state,
    wall: { ...state.wall, items, threads, notes: kept },
    ...(state.excerpts ? { excerpts } : {}),
    ...(state.desk || desk.length ? { desk } : {}),
    ...(joined ? { joined } : {}),
  };
}

/** Выписки из материалов, что у игрока есть, без повторов. */
export function excerptsOf(state: PlayerState, materials: Material[]): WallExcerpt[] {
  const have = new Set(materials.map((m) => m.id));
  const seen = new Set<string>();
  return (state.excerpts ?? []).filter((x) => {
    if (!have.has(x.material) || seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/**
 * Выписка — на стену (A-272, DB-B): в поле версии — на свободное место доски, не в ряды «как
 * пришло»; уже есть такая (то же место, тот же текст) — без повтора.
 */
export function addExcerpt(state: PlayerState, x: WallExcerpt): PlayerState {
  const list = state.excerpts ?? [];
  if (list.some((e) => e.id === x.id)) return state;
  // Рядом со своим листом, если он на стене (WALL-A); иначе — свободное место доски.
  const noteW = new Map(state.wall.notes.map((n) => [n.id, n.width ?? NOTE_STYLE[n.kind].width]));
  const widthOf = (id: string) => noteW.get(id) ?? CARD_W;
  const src = state.wall.items.find((i) => i.id === x.material);
  const at =
    (src && freeNear(state.wall.items, widthOf, src)) ??
    freeBlock(state.wall.items, widthOf, CARD_W, CARD_H) ??
    freeNear(state.wall.items, widthOf, src ?? { x: PLACE_RIGHT, y: GRID_TOP }, true) ??
    onWall(0, GRID_TOP);
  const z = state.wall.items.reduce((m, i) => Math.max(m, i.z), 0) + 1;
  return {
    ...state,
    excerpts: [...list, x],
    wall: {
      ...state.wall,
      items: [...state.wall.items, { id: x.id, ...onWall(at.x, at.y), z, rot: hangTilt(x.id) }],
    },
  };
}

/** Снять выписку со стены — вместе с нитями. */
export function removeExcerpt(state: PlayerState, id: string): PlayerState {
  if (!(state.excerpts ?? []).some((x) => x.id === id)) return state;
  return {
    ...state,
    excerpts: (state.excerpts ?? []).filter((x) => x.id !== id),
    wall: {
      ...state.wall,
      items: state.wall.items.filter((i) => i.id !== id),
      threads: state.wall.threads.filter((t) => t.from !== id && t.to !== id),
    },
  };
}

/** Папка, вынутая из пачки, на стене: «F:П-02/18» (taken «П-02/18»). */
export const folderItemId = (taken: string) => `F:${taken}`;

/**
 * Папка из пачки — отдельный материал (DS-A, A-263): «П-02/18» — папка A-24 (L991). На стене она
 * висит папкой (F:), поэтому сам материал во «Входящих» не стоит. Папки П-09 — пока выдержкой.
 */
export const FOLDER_DOCS: Readonly<Record<string, string>> = { 'П-02/18': 'L991' };

/**
 * Что лежит внутри устройства (этап 4c, LW-A — автор 10.11): эти материалы — файлы на самом
 * устройстве; во «Входящих» и на стене их нет, открывают их на устройстве. В деле они есть
 * (поиск, карточки запроса).
 */
/**
 * Предупреждение бюро и форма заключения (L998, L999) — окна «Решить дело»; эпилог (L997) —
 * конвертом на столе. Во «Входящие» не ложатся.
 */
export const FORM_MATERIALS: readonly string[] = ['L998', 'L999', 'L997'];

/** Материалы настоящих сайтов (A-272): страницы и то, что открыто на них. */
export const WEB_MATERIALS: readonly string[] = [
  'L101',
  'L130',
  'L163',
  'L177',
  // Сайты без замков (NF-B, A-273): оператор, производитель, поставщик, бюро.
  'L178',
  'L179',
  'L180',
  'L181',
  'L249',
  'L272',
  'L296',
  'L453',
  'L618',
  'L619',
  'L620',
  'L735',
  'L736',
  'L737',
  'L738',
];
export const isWeb = (id: string) => WEB_MATERIALS.includes(id);

export const DEVICE_MATERIALS: Readonly<Record<string, readonly string[]>> = {
  // L947 — крупный план наклейки на дне ноутбука (A-283).
  '47': ['L560', 'L561', 'L562', 'L563', 'L564', 'L565', 'L947'],
  // Телефон Габриэля: содержимое после разблокировки и крупный план экрана блокировки.
  '48': ['L540', 'L949'],
  // Камера инженера (A-268): время съёмки и крупные детали кадров — на экране самой камеры.
  '24': ['L905', 'L973'],
  // Компьютер следователя (4c-3, DI-A): программа «Сервер объекта VL-31» (диск, A-272) и
  // выпуски газеты из архива номеров.
  pc: ['L214', 'L215', 'L387', 'L388', 'L389', 'L390', 'L831', 'L832', 'L833', 'L834'],
  // Настоящие сайты дела (A-272, AC-3): страницы, кабинет, хранилище, веб-почта — в браузере
  // игрока, не в деле: на стол и стену не ложатся, поиск по делу их не находит (S5-A).
  web: WEB_MATERIALS,
};
export const deviceOf = (materialId: string) =>
  Object.keys(DEVICE_MATERIALS).find((d) => DEVICE_MATERIALS[d]?.includes(materialId)) ?? null;

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
  // Места стартовых листов, пока они на столе, заняты (WALL-A): прочитанные, они повиснут туда.
  const all = [...items, ...reservedStart(items)];
  for (let y = GRID_TOP; y + h <= BOARD_INNER.bottom; y += 30)
    for (let x = 0; x + w <= PLACE_RIGHT; x += 50)
      if (!overlaps(all, widthOf, x, y, w, h, GROUP_GAP)) return { x, y };
  return null;
}

/** Занят ли прямоугольник x, y, w × h (с зазором gap) чем-то на стене. */
function overlaps(
  items: readonly WallItem[],
  widthOf: (id: string) => number,
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
): boolean {
  return items.some(
    (i) =>
      i.x < x + w + gap &&
      i.x + widthOf(i.id) + gap > x &&
      i.y < y + h + gap &&
      i.y + CARD_H + gap > y,
  );
}

/** Начальное место стартового листа (ST-B): по номеру описи (01 — первое), как до конвертов. */
function startSlotOf(id: string): { x: number; y: number } {
  const k = Number(id) - 1;
  return { x: (k % GRID_COLS) * GRID_DX, y: GRID_TOP + Math.floor(k / GRID_COLS) * GRID_DY };
}

/**
 * Ближайшее к точке свободное место под карточку (WALL-A): выписка — рядом со своим листом,
 * стартовый лист — рядом со своим местом, если его заняли. В пределах ~4 карточек (`wide` — по
 * всей доске), иначе null.
 */
function freeNear(
  items: readonly WallItem[],
  widthOf: (id: string) => number,
  near: { x: number; y: number },
  wide = false,
): { x: number; y: number } | null {
  const all = [...items, ...reservedStart(items)];
  const spots: { x: number; y: number; d: number }[] = [];
  const rx = wide ? WALL_BOUNDS.right - WALL_BOUNDS.left : 880;
  const ry = wide ? WALL_BOUNDS.bottom - WALL_BOUNDS.top : 660;
  for (let dy = -ry; dy <= ry; dy += 30)
    for (let dx = -rx; dx <= rx; dx += 40) {
      const x = near.x + dx;
      const y = near.y + dy;
      if (x < WALL_BOUNDS.left + 20 || y < GRID_TOP) continue;
      if (x + CARD_W > WALL_BOUNDS.right - 20 || y + CARD_H > BOARD_INNER.bottom) continue;
      spots.push({ x, y, d: Math.hypot(dx, dy * 1.3) });
    }
  spots.sort((a, b) => a.d - b.d);
  const hit = spots.find((p) => !overlaps(all, widthOf, p.x, p.y, CARD_W, CARD_H, 20));
  return hit ? { x: hit.x, y: hit.y } : null;
}

/** Места стартовых листов, ещё не повешенных: держатся свободными (WALL-A). */
function reservedStart(items: readonly WallItem[]): WallItem[] {
  const on = new Set(items.map((i) => i.id));
  return START_STACK.filter((id) => !on.has(id)).map((id) => ({
    id: `r:${id}`,
    ...startSlotOf(id),
    z: 0,
    rot: 0,
  }));
}

/** Где на доске можно вешать группы: с отступом от рамы. */
const BOARD_INNER = { bottom: WALL_BOUNDS.bottom - 40 };

/** Сколько колонок пробовать для группы: шире — короче; берётся та, что ляжет выше. */
const GROUP_COL_CHOICES = [GRID_COLS, 8, GROUP_COLS, 4];

/**
 * Вскрыть конверт архива (A-260): содержимое — на стену группой под ярлыком с названием
 * конверта, на свободное место (со стола доска видна целиком — boardCamera).
 * 3D-стол (автор 24.11): конверты SPILL_CONTAINERS высыпаются на стол — листы и устройства
 * DESK_DEVICES ложатся свободно (место решит стол), на стену группой — только остальное
 * (устройства на своих местах). Уже вскрытый — без изменений.
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
  const onDeskNow = new Set((state.desk ?? []).map((d) => d.id));
  const fresh = containerContents(c).filter(
    (m) => have.has(m) && !onWallNow.has(m) && !onDeskNow.has(m),
  );
  // Коробка «Личные вещи» (BOX-B): вскрыта — пакеты остаются в ней, ни на стену, ни на стол.
  if (id === 'personal') return { ...state, opened };
  const spill = SPILL_CONTAINERS.has(id);
  const toDesk = spill ? fresh.filter((m) => c.files.includes(m) || DESK_DEVICES.has(m)) : [];
  const ids = fresh.filter((m) => !toDesk.includes(m));
  if (toDesk.length) state = { ...state, desk: spillOnDesk(state.desk ?? [], toDesk) };
  if (!ids.length) return { ...state, opened };
  return hangGroup({ ...state, opened }, ids, { id: containerLabelId(id), text: c.label });
}

/**
 * Повесить вещи группой на свободное место доски (A-260): под ярлыком `label`, если его ещё нет на
 * стене; ярлык уже висит (вторая порция того же конверта) — группа без ярлыка.
 */
function hangGroup(
  state: PlayerState,
  ids: string[],
  label: { id: string; text: string } | null,
): PlayerState {
  if (!ids.length) return state;
  const withLabel = !!label && !state.wall.items.some((i) => i.id === label.id);
  const labelW = label ? Math.min(NOTE_STYLE.maxWidth, 60 + label.text.length * 15) : 0;
  const labelH = withLabel ? LABEL_H : 0;
  const noteW = new Map(state.wall.notes.map((n) => [n.id, n.width ?? NOTE_STYLE[n.kind].width]));
  const widthOf = (x: string) => noteW.get(x) ?? CARD_W;
  // Форма группы — та, что ляжет выше всех (потом левее): доска заполняется вширь.
  const size = (cols: number) => {
    const rows = Math.ceil(ids.length / cols);
    return {
      w: Math.max(withLabel ? labelW : 0, (cols - 1) * GRID_DX + CARD_W),
      h: labelH + (rows - 1) * GRID_DY + CARD_H,
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
  const placed: WallItem[] = [
    ...(withLabel && label ? [{ id: label.id, x: at.x, y: at.y, z: ++z, rot: 0 }] : []),
    ...ids.map((m, k) => ({
      id: m,
      x: at.x + (k % cols) * GRID_DX,
      y: at.y + labelH + Math.floor(k / cols) * GRID_DY,
      z: ++z,
      rot: hangTilt(m),
    })),
  ];
  const gone = new Set(ids);
  const notes =
    withLabel && label
      ? [
          ...state.wall.notes.filter((n) => n.id !== label.id),
          // Ярлык — в одну строку, по длине названия.
          { id: label.id, kind: 'label' as const, text: label.text, width: labelW },
        ]
      : state.wall.notes;
  return {
    ...state,
    desk: state.desk?.filter((d) => !gone.has(d.id)),
    wall: {
      ...state.wall,
      items: [
        ...state.wall.items.filter((i) => !gone.has(i.id) && !(withLabel && i.id === label?.id)),
        ...placed,
      ],
      notes,
    },
  };
}

/**
 * Прочитанное со стола — на стену (DC-B, автор 25.11): листы уходят со стола и висят группами — по
 * конверту, из которого они, под его ярлыком (вторая порция — рядом, без ярлыка); не из конверта —
 * группой без ярлыка. Порядок внутри группы — как в конверте.
 */
export function fileFromDesk(state: PlayerState, ids: readonly string[]): PlayerState {
  const onDesk = new Set((state.desk ?? []).map((d) => d.id));
  // Опись (OPS-A) на стену сама не уходит — остаётся на столе.
  const want = ids.filter(
    (id) => onDesk.has(id) && !START_STACK.includes(id) && id !== INVENTORY_ID,
  );
  // Стартовые листы (ST-B) — на свои начальные места, рядом с карточками людей, как висели прежде.
  let next = hangStart(
    state,
    ids.filter((id) => onDesk.has(id) && START_STACK.includes(id)),
  );
  for (const c of CONTAINERS) {
    const mine = containerContents(c).filter((m) => want.includes(m));
    if (mine.length) next = hangGroup(next, mine, { id: containerLabelId(c.id), text: c.label });
  }
  const rest = want.filter((id) => !CONTAINERS.some((c) => containerContents(c).includes(id)));
  return hangGroup(next, rest, null);
}

/** Отметить, что материал открывали (OP-A): без повторов; тот же объект, если уже отмечен. */
export function markLooked(state: PlayerState, id: string): PlayerState {
  if (!/^(\d{2}|L\d{3})$/.test(id) || state.looked?.includes(id)) return state;
  return { ...state, looked: [...(state.looked ?? []), id].slice(-400) };
}

/**
 * Какие материалы называет строка описи дела (лист 04, OP-A): «файл 01», «файлы 30–36»,
 * «конверт …, файл 52». Строка без файла (не изымалось, у компании) — пусто.
 */
export function inventoryFiles(where: string): string[] {
  const m = /файл(?:ы)?\s+(\d{2})(?:\s*[–-]\s*(\d{2}))?/.exec(where);
  if (!m?.[1]) return [];
  const from = Number(m[1]);
  const to = Number(m[2] ?? m[1]);
  return Array.from({ length: to - from + 1 }, (_, k) => String(from + k).padStart(2, '0'));
}

/** Стартовые листы со стола — на начальные места стены (ST-B). */
function hangStart(state: PlayerState, ids: string[]): PlayerState {
  if (!ids.length) return state;
  const gone = new Set(ids);
  let z = state.wall.items.reduce((m, i) => Math.max(m, i.z), 0);
  const noteW = new Map(state.wall.notes.map((n) => [n.id, n.width ?? NOTE_STYLE[n.kind].width]));
  const widthOf = (x: string) => noteW.get(x) ?? CARD_W;
  const placed: WallItem[] = [];
  for (const id of ids) {
    // Место — по номеру описи; занято (игрок перевесил туда своё) — ближайшее свободное (WALL-A).
    const others = [...state.wall.items.filter((i) => !gone.has(i.id)), ...placed];
    const want = startSlotOf(id);
    const at = overlaps(others, widthOf, want.x, want.y, CARD_W, CARD_H, 10)
      ? (freeNear(others, widthOf, want) ?? want)
      : want;
    placed.push({ id, ...at, z: ++z, rot: hangTilt(id) });
  }
  return {
    ...state,
    desk: state.desk?.filter((d) => !gone.has(d.id)),
    wall: { ...state.wall, items: [...state.wall.items.filter((i) => !gone.has(i.id)), ...placed] },
  };
}

/** Высыпать на стол: порядок — как в конверте, первое — снизу; места ещё нет (решит стол). */
function spillOnDesk(desk: DeskItem[], ids: string[]): DeskItem[] {
  let top = desk.reduce((m, d) => Math.max(m, d.layer), 0);
  return [...desk, ...ids.map((id) => ({ id, layer: ++top }))];
}

/**
 * Повесить на свободное место рядом с точкой (WALL-A): «На стену» из «Входящих» — у середины
 * видимой стены, найденное руками — у вещи-источника. Рядом занято — свободное место доски; доска
 * завешана — в точку (поверх, игрок перевесит сам). Уже висит — без изменений.
 */
export function hangNear(
  state: PlayerState,
  id: string,
  near: { x: number; y: number },
): PlayerState {
  if (state.wall.items.some((i) => i.id === id)) return state;
  const noteW = new Map(state.wall.notes.map((n) => [n.id, n.width ?? NOTE_STYLE[n.kind].width]));
  const widthOf = (x: string) => noteW.get(x) ?? CARD_W;
  const at =
    freeNear(state.wall.items, widthOf, near) ??
    freeBlock(state.wall.items, widthOf, CARD_W, CARD_H) ??
    freeNear(state.wall.items, widthOf, near, true) ??
    near;
  return hangFromDesk(state, id, at.x, at.y);
}

/**
 * Со стола — на стену (3D-стол, WL-A): вещь уходит со стола и висит там, где отпустили (x, y —
 * мир стены, верхний левый угол карточки), поверх остального.
 */
export function hangFromDesk(state: PlayerState, id: string, x: number, y: number): PlayerState {
  // Опись на планшете (OPS-A) — вещь стола, на стену не вешается.
  if (id === INVENTORY_ID) return state;
  const z = state.wall.items.reduce((m, i) => Math.max(m, i.z), 0) + 1;
  const item: WallItem = { id, ...onWall(x, y), z, rot: hangTilt(id) };
  return {
    ...state,
    desk: (state.desk ?? []).filter((d) => d.id !== id),
    wall: { ...state.wall, items: [...state.wall.items.filter((i) => i.id !== id), item] },
  };
}

/** Вскрыть всё сразу (служебная кнопка «Подготовка», автотесты): стартовая сетка, как до конвертов. */
export function openAll(state: PlayerState, materials: Material[]): PlayerState {
  // Стартовая стопка (ST-B) и опись — тоже на стену, на начальные места: «всё вскрыто, как до
  // конвертов» (служебная кнопка и автотесты).
  const desk = state.desk?.filter((d) => !START_STACK.includes(d.id) && d.id !== INVENTORY_ID);
  const r = reconcile({ ...state, desk, opened: CONTAINERS.map((c) => c.id) }, materials);
  // Пакеты личных вещей — тоже на стену, на начальные места (BOX-B у игрока держит их в коробке).
  let z = r.wall.items.reduce((m, i) => Math.max(m, i.z), 0);
  const bags = [...BOX_KEEPS]
    .filter((id) => materials.some((m) => m.id === id) && !r.wall.items.some((i) => i.id === id))
    .flatMap((id) => {
      const slot = startSlot(id, materials);
      return slot ? [{ id, ...slot, z: ++z, rot: hangTilt(id) }] : [];
    });
  const withBags = bags.length
    ? { ...r, wall: { ...r.wall, items: [...r.wall.items, ...bags] } }
    : r;
  // Газета — на столе перед игроком, как до «Входящих» (служебный режим, автотесты).
  const paperFree =
    materials.some((m) => m.id === NEWSPAPER_ID) &&
    !withBags.wall.items.some((i) => i.id === NEWSPAPER_ID) &&
    !(withBags.desk ?? []).some((d) => d.id === NEWSPAPER_ID);
  return paperFree
    ? {
        ...withBags,
        desk: [{ id: NEWSPAPER_ID, ...NEWSPAPER_AT, layer: 0 }, ...(withBags.desk ?? [])],
      }
    : withBags;
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
