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
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;
