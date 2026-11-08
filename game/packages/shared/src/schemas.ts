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

/** Материал, снятый игроком из колонки «как пришло» в поле стены (WALL-C). */
export const WallItemSchema = z.object({
  materialId: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number().int(),
  /** Наклон листа на одной кнопке, градусы (декоративно). */
  rot: z.number().min(-180).max(180),
});
export type WallItem = z.infer<typeof WallItemSchema>;

/** Нить между двумя материалами на стене; игра её не читает и не проверяет (T-5-A). */
export const ThreadSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string(),
  to: z.string(),
  label: z.string().max(200),
});
export type Thread = z.infer<typeof ThreadSchema>;

/** Партия поступления: материалы, открытые одним действием, — одна колонка на стене (IN-B). */
export const ArrivalSchema = z.object({ ids: z.array(z.string()).min(1) });
export type Arrival = z.infer<typeof ArrivalSchema>;

/** Виды: стол (от первого лица) и стена (рабочая поверхность) — решение автора 08.11. */
export const ViewSchema = z.enum(['desk', 'wall']);
export type View = z.infer<typeof ViewSchema>;

export const STATE_VERSION = 4;

export const PlayerStateSchema = z.object({
  version: z.literal(STATE_VERSION),
  view: ViewSchema,
  wall: z.object({
    camera: CameraSchema,
    items: z.array(WallItemSchema),
    threads: z.array(ThreadSchema),
    arrivals: z.array(ArrivalSchema),
  }),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;
