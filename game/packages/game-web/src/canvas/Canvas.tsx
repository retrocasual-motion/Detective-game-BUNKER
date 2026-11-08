import type { Camera } from '@bunker/shared';
import { type PointerEvent, type ReactNode, useEffect, useRef, type WheelEvent } from 'react';
import { type Bounds, clampToBounds, minZoomFor, zoomAt } from './math.ts';

interface CanvasProps {
  camera: Camera;
  onCameraChange(camera: Camera): void;
  className?: string;
  testId?: string;
  /** Край поверхности (стол): камера за него не уезжает. */
  bounds?: Bounds;
  /** Мировые размеры подложки под детьми (столешница). */
  surface?: Bounds;
  /** Клик по пустому месту (без перетаскивания). */
  onBackgroundClick?(): void;
  children: ReactNode;
}

const WHEEL_SPEED = 0.0015;
const CLICK_SLOP = 3;

/**
 * Бесконечная поверхность: фон тянется мышью, колесо масштабирует вокруг курсора.
 * Дети лежат в мировых координатах. Общая для стола и доски.
 */
export function Canvas({
  camera,
  onCameraChange,
  className,
  testId,
  onBackgroundClick,
  bounds,
  surface,
  children,
}: CanvasProps) {
  const pan = useRef<{ startX: number; startY: number; cam: Camera; moved: boolean } | null>(null);
  const el = useRef<HTMLDivElement>(null);

  const change = (cam: Camera) => {
    const r = el.current?.getBoundingClientRect();
    onCameraChange(bounds && r ? clampToBounds(cam, bounds, r) : cam);
  };

  // Старая сохранённая камера и смена размера окна: поправить сразу, а не на первом жесте.
  const latest = useRef({ camera, onCameraChange, bounds });
  latest.current = { camera, onCameraChange, bounds };
  useEffect(() => {
    const fix = () => {
      const { camera: cam, onCameraChange: set, bounds: b } = latest.current;
      const r = el.current?.getBoundingClientRect();
      if (!b || !r || r.width === 0) return;
      const c = clampToBounds(cam, b, r);
      if (c.x !== cam.x || c.y !== cam.y || c.zoom !== cam.zoom) set(c);
    };
    fix();
    window.addEventListener('resize', fix);
    return () => window.removeEventListener('resize', fix);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { startX: e.clientX, startY: e.clientY, cam: camera, moved: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (Math.abs(dx) + Math.abs(dy) > CLICK_SLOP) p.moved = true;
    if (p.moved) change({ ...p.cam, x: p.cam.x + dx, y: p.cam.y + dy });
  };

  const onPointerUp = () => {
    if (pan.current && !pan.current.moved) onBackgroundClick?.();
    pan.current = null;
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    let factor = Math.exp(-e.deltaY * WHEEL_SPEED);
    // У предела масштаб не уходит ниже, иначе ограничение вернуло бы его вокруг центра и стол
    // «пополз» бы от курсора.
    if (bounds) factor = Math.max(factor, minZoomFor(bounds, rect) / camera.zoom);
    change(zoomAt(camera, point, factor));
  };

  return (
    <div
      ref={el}
      className={`canvas ${className ?? ''}`}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div
        className="canvas-world"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
      >
        {surface && (
          <div
            className="canvas-surface"
            style={{
              left: surface.left,
              top: surface.top,
              width: surface.right - surface.left,
              height: surface.bottom - surface.top,
            }}
          />
        )}
        {children}
      </div>
    </div>
  );
}
