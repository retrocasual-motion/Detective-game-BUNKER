import { z } from 'zod';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

/**
 * Каким предметом материал лежит на столе (TECH_PLAN 4.2, UX-A1): форма по типу, не по значимости.
 * sheet — лист на бланке; stapled — скреплённые листы; half — половина листа; photos — отпечатки;
 * pack — пачка сканов; notebook — тетрадь; disc — диск в конверте; bag — пакет вещдоков.
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
]);
export type MaterialKind = z.infer<typeof MaterialKindSchema>;

export const MaterialSchema = z.object({
  /** 01…51 — стартовые; L101…L999 — закрытые (открываются действиями игрока). */
  id: z.string().regex(/^(\d{2}|L\d{3})$/),
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
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;
