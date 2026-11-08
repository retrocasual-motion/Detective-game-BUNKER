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
  id: z.string().regex(/^\d{2}$/),
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

export const DeskItemSchema = z.object({
  materialId: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number().int(),
  /** Поворот на столе, градусы (TECH_PLAN 4.2: «повернуть на столе», декоративно). */
  rot: z.number().min(-180).max(180),
});
export type DeskItem = z.infer<typeof DeskItemSchema>;

export const BoardItemSchema = z.object({
  id: z.string().min(1).max(64),
  materialId: z.string(),
  x: z.number(),
  y: z.number(),
});
export type BoardItem = z.infer<typeof BoardItemSchema>;

export const BoardThreadSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string(),
  to: z.string(),
  label: z.string().max(200),
});
export type BoardThread = z.infer<typeof BoardThreadSchema>;

export const ViewSchema = z.enum(['desk', 'room', 'left', 'right']);
export type View = z.infer<typeof ViewSchema>;

export const STATE_VERSION = 3;

export const PlayerStateSchema = z.object({
  version: z.literal(STATE_VERSION),
  view: ViewSchema,
  desk: z.object({ camera: CameraSchema, items: z.array(DeskItemSchema) }),
  board: z.object({
    camera: CameraSchema,
    items: z.array(BoardItemSchema),
    threads: z.array(BoardThreadSchema),
  }),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;
