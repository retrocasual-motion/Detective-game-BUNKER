import { z } from 'zod';
import { CONTAINER_IDS } from './archive.ts';

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 3;

/**
 * Каким предметом материал лежит на столе (TECH_PLAN 4.2, UX-A1): форма по типу, не по значимости.
 * sheet — лист на бланке; stapled — скреплённые листы; half — половина листа; photos — отпечатки;
 * pack — пачка сканов; notebook — тетрадь; disc — диск в конверте; bag — пакет вещдоков;
 * letter — ответ на ходатайство (письмо в конверте, этап 3).
 */
export const MaterialKindSchema = z.enum([
  'sheet',
  'stapled',
  'half',
  'photos',
  'pack',
  'notebook',
  'disc',
  'bag',
  'letter',
]);
export type MaterialKind = z.infer<typeof MaterialKindSchema>;

export const MaterialSchema = z.object({
  /**
   * 01…51 — стартовые; L101…L999 — закрытые (открываются действиями игрока); M001… — ответы
   * на ходатайства (письма, этап 3).
   */
  id: z.string().regex(/^(\d{2}|L\d{3}|M\d{3})$/),
  title: z.string().min(1),
  placement: z.enum(['desk', 'evidence']),
  kind: MaterialKindSchema,
  body: z.string(),
  sourceFile: z.string(),
});
export type Material = z.infer<typeof MaterialSchema>;

export const CameraSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().min(ZOOM_MIN).max(ZOOM_MAX),
});
export type Camera = z.infer<typeof CameraSchema>;

/**
 * Что висит на стене: материал дела (01…51, L…), карточка персонажа («p:…») или записка
 * игрока («n:…»). Место, наклон на одной кнопке, порядок наложения.
 */
export const WallItemSchema = z.object({
  id: z.string().min(1).max(80),
  x: z.number(),
  y: z.number(),
  z: z.number().int(),
  rot: z.number().min(-180).max(180),
});
export type WallItem = z.infer<typeof WallItemSchema>;

/** Нить между двумя вещами на стене; игра её не читает и не проверяет (T-5-A). */
export const ThreadSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string(),
  to: z.string(),
  label: z.string().max(200),
});
export type Thread = z.infer<typeof ThreadSchema>;

/** Записка игрока (карточка) или ярлык (полоска — заголовок своей группы); игра их не читает. */
export const NoteSchema = z.object({
  id: z.string().regex(/^n:[\w-]{1,64}$/),
  kind: z.enum(['note', 'label']),
  text: z.string().max(500),
  /** Размер шрифта, px (по умолчанию — NOTE_STYLE). */
  size: z.number().int().min(10).max(64).optional(),
  /** Ширина, мировые px (по умолчанию — NOTE_STYLE). */
  width: z.number().min(80).max(900).optional(),
});
export type Note = z.infer<typeof NoteSchema>;

/**
 * Карточка ходатайства (K-A): выделенная строка материала или материал целиком (тогда
 * цитата — его название). У карточки нет типов, меток и подсветки (P-1).
 */
export const CardSchema = z.object({
  file: z.string().regex(/^(\d{2}|L\d{3}|M\d{3})$/),
  quote: z.string().min(1).max(2000),
});
export type Card = z.infer<typeof CardSchema>;

/** Черновик ходатайства (4.11): Кому, Прошу, На основании. Номер дела ставится сам. */
export const DraftSchema = z.object({
  id: z.string().min(1).max(64),
  to: z.string().max(200).nullable(),
  ask: CardSchema.nullable(),
  basis: CardSchema.nullable(),
});
export type Draft = z.infer<typeof DraftSchema>;
export type DraftField = 'to' | 'ask' | 'basis';

/** Сколько черновиков сразу (уголков папки рядом). */
export const MAX_DRAFTS = 4;

/** Виды: стол (от первого лица) и стена (рабочая поверхность) — решение автора 08.11. */
export const ViewSchema = z.enum(['desk', 'wall']);
export type View = z.infer<typeof ViewSchema>;

/** Окно на рабочем столе ноутбука: что в нём (вид и путь или адрес), где, какого размера. */
export const LapWindowSchema = z.object({
  id: z.string().min(1).max(240),
  kind: z.enum(['folder', 'file', 'props', 'browser', 'printer']),
  /** Папка или файл: путь от рабочего стола («Тревога/vneshnee_take1.wav»). */
  path: z.string().max(240).optional(),
  /** Браузер: открытый адрес. */
  url: z.string().max(400).optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  z: z.number(),
  min: z.boolean(),
  max: z.boolean(),
});
export type LapWindow = z.infer<typeof LapWindowSchema>;

export const LaptopDeskSchema = z.object({
  /** Значки, которые игрок передвинул: имя → место (px экрана ноутбука). */
  icons: z.record(z.string().max(120), z.object({ x: z.number(), y: z.number() })).optional(),
  windows: z.array(LapWindowSchema).max(30).optional(),
});
export type LaptopDesk = z.infer<typeof LaptopDeskSchema>;

/** Окно компьютера следователя (4c-3): те же поля; path — материал (документ, вкладка терминала). */
export const PcWindowSchema = LapWindowSchema.extend({
  kind: z.enum(['incoming', 'terminal', 'browser', 'doc', 'mbx', 'enc']),
});
export type PcWindow = z.infer<typeof PcWindowSchema>;
export const PcDeskSchema = z.object({
  icons: z.record(z.string().max(120), z.object({ x: z.number(), y: z.number() })).optional(),
  windows: z.array(PcWindowSchema).max(30).optional(),
});

export const STATE_VERSION = 5;

export const PlayerStateSchema = z.object({
  version: z.literal(STATE_VERSION),
  view: ViewSchema,
  wall: z.object({
    camera: CameraSchema,
    items: z.array(WallItemSchema),
    threads: z.array(ThreadSchema),
    notes: z.array(NoteSchema),
  }),
  /** Черновики ходатайств (этап 3); в старом сохранении их нет — пусто. */
  drafts: z.array(DraftSchema).max(MAX_DRAFTS).default([]),
  /**
   * Корзина у стола (TR-A, решение автора 09.11): выброшенные письма-ответы. Письмо остаётся в
   * деле (карточки из него работают), но не стоит во «Входящих» и не висит на стене.
   */
  trash: z
    .array(z.string().regex(/^M\d{3}$/))
    .max(999)
    .default([]),
  /**
   * Вскрытые конверты архива (A-260). Нет поля — сохранение из времени до конвертов: всё уже
   * на стене, конверты считаются вскрытыми (openedOf).
   */
  opened: z.array(z.enum(CONTAINER_IDS)).max(CONTAINER_IDS.length).optional(),
  /**
   * Папки, вынутые из пачек (RD-A, правка автора 10.11): «П-02/18» — папка, что лежала перед
   * листом 18 пачки П-02. Вынутая из пачки пропадает: её листов там больше нет.
   */
  taken: z
    .array(z.string().regex(/^П-0[1-9]\/\d{1,3}$/))
    .max(20)
    .optional(),
  /**
   * Листы, что лежали текстом вниз и перевёрнуты (П-05, листы 19–24): «П-05/19» — блок с листа 19.
   * После переворота они лежат лицом вверх — пачку листают дальше (правка автора 10.11).
   */
  turned: z.array(z.string()).max(20).optional(),
  /**
   * Обрывки, вынутые из материалов (SRC-A, правка автора 10.11): «42/1» — п. 1 личных вещей
   * Н. Харта, обгоревшая половина листа. На стене — своей карточкой «S:42/1».
   */
  pieces: z
    .array(z.string().regex(/^\d{2}\/\d{1,2}$/))
    .max(20)
    .optional(),
  /**
   * Первый день дела у игрока — его настоящая дата (ГГГГ-ММ-ДД). Часы устройств (CL-D, автор
   * 10.11): время — настоящее, дата — 16.11.2009 плюс столько дней, сколько прошло с этого дня.
   */
  started: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Блокнот следователя: записи игрока; игра их не читает (P-1, DV-A — автор 11.11). */
  notebook: z.string().max(20_000).optional(),
  /** Страницы блокнота (правка автора 11.11): прежний `notebook` — первой страницей. */
  notebookPages: z.array(z.string().max(4000)).max(300).optional(),
  /**
   * Рабочий стол ноутбука руководителя (4c-1, правка автора 10.11): где стоят значки и какие
   * окна открыты — как на настоящем ноутбуке, после выхода всё на месте.
   */
  laptop: LaptopDeskSchema.optional(),
  /** Телефон Габриэля (4c-2): какой экран открыт — после выхода телефон там же. */
  phone: z.object({ screen: z.string().max(80) }).optional(),
  /** Компьютер следователя (4c-3): значки и окна рабочего стола — после выхода всё на месте. */
  pc: PcDeskSchema.optional(),
  /** Совмещённые на стене листы (WL-A, MG-A): «L990» — висит вместо своих половин. */
  joined: z
    .array(z.string().regex(/^L\d{3}$/))
    .max(20)
    .optional(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;
