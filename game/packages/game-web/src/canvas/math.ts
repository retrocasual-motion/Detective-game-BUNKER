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

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Камера не уезжает за край стола (UX-B1): точка мира в центре экрана остаётся на столешнице,
 * а отдалить можно не дальше, чем до всего стола целиком (с небольшим полем).
 */
export function clampToBounds(
  cam: Camera,
  b: Bounds,
  viewport: { width: number; height: number },
): Camera {
  const fit = Math.min(viewport.width / (b.right - b.left), viewport.height / (b.bottom - b.top));
  const zoom = Math.max(cam.zoom, Math.min(1, clampZoom(fit * 0.9)));
  // Центр экрана в мире — при текущем x, y и (возможно, поднятом) масштабе.
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const worldCx = (cx - cam.x) / cam.zoom;
  const worldCy = (cy - cam.y) / cam.zoom;
  const wx = Math.min(b.right, Math.max(b.left, worldCx));
  const wy = Math.min(b.bottom, Math.max(b.top, worldCy));
  return { x: cx - wx * zoom, y: cy - wy * zoom, zoom };
}
