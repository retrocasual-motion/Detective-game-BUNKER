import { z } from 'zod';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

export const MaterialSchema = z.object({
  id: z.string().regex(/^\d{2}$/),
  title: z.string().min(1),
  placement: z.enum(['desk', 'evidence']),
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

export const PlayerStateSchema = z.object({
  version: z.literal(1),
  view: ViewSchema,
  desk: z.object({ camera: CameraSchema, items: z.array(DeskItemSchema) }),
  board: z.object({
    camera: CameraSchema,
    items: z.array(BoardItemSchema),
    threads: z.array(BoardThreadSchema),
  }),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;
