import { type Camera, ZOOM_MAX, ZOOM_MIN } from '@bunker/shared';

export interface Point {
  x: number;
  y: number;
}

/** Камера: мир смещён на (x, y) пикселей экрана и увеличен в zoom раз. */
export const screenToWorld = (p: Point, cam: Camera): Point => ({
  x: (p.x - cam.x) / cam.zoom,
  y: (p.y - cam.y) / cam.zoom,
});

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** Масштаб вокруг точки экрана: мировая точка под курсором остаётся на месте. */
export function zoomAt(cam: Camera, screenPoint: Point, factor: number): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  const w = screenToWorld(screenPoint, cam);
  return { x: screenPoint.x - w.x * zoom, y: screenPoint.y - w.y * zoom, zoom };
}
