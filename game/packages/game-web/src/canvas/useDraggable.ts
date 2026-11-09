import { type PointerEvent, useRef, useState } from 'react';

const CLICK_SLOP = 3;
/** Клик вскоре после перетаскивания — продолжение жеста, а не «открыть». */
const AFTER_DRAG_MS = 500;
/** Наклон бумаги по скорости руки: градусов на px/мс, предел. */
const TILT_PER_SPEED = 4;
const TILT_MAX = 8;
/** Рука остановилась — наклон уходит через столько мс. */
const TILT_IDLE_MS = 90;

export interface DragResult {
  /** Смещение в мировых координатах, пока объект тянут (null — не тянут). */
  offset: { x: number; y: number } | null;
  /** Наклон, градусы: бумага отстаёт от руки, как настоящая. 0 — в покое. */
  tilt: number;
  /** Было ли перетаскивание в последнем жесте или только что перед ним. */
  wasDragged(): boolean;
  handlers: {
    onPointerDown(e: PointerEvent<HTMLElement>): void;
    onPointerMove(e: PointerEvent<HTMLElement>): void;
    onPointerUp(e: PointerEvent<HTMLElement>): void;
    onPointerCancel(e: PointerEvent<HTMLElement>): void;
  };
}

interface DragOptions {
  zoom: number;
  /** Конец жеста: итоговое смещение в мировых координатах и точка экрана, где отпустили. */
  onDrop(dx: number, dy: number, at: { x: number; y: number }): void;
  onGrab?(): void;
  /** Каждое движение — для тех, кто должен следовать за объектом (нити доски). */
  onMove?(dx: number, dy: number): void;
}

/**
 * Перетаскивание объекта на холсте. Пока тянут — смещение живёт локально (плавно);
 * в конце жеста onDrop получает итоговое смещение в мировых координатах.
 */
export function useDraggable({ zoom, onDrop, onGrab, onMove }: DragOptions): DragResult {
  const start = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({ x: 0, t: 0, v: 0 });
  const dragged = useRef(false);
  const lastDragEnd = useRef(0);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const [tilt, setTilt] = useState(0);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTilt = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    last.current.v = 0;
    setTilt(0);
  };

  const end = (e: PointerEvent<HTMLElement>, commit: boolean) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    const dx = (e.clientX - s.x) / zoom;
    const dy = (e.clientY - s.y) / zoom;
    setOffset(null);
    stopTilt();
    if (dragged.current) lastDragEnd.current = Date.now();
    if (commit && dragged.current) onDrop(dx, dy, { x: e.clientX, y: e.clientY });
    else if (dragged.current) onMove?.(0, 0);
  };

  return {
    offset,
    tilt,
    wasDragged: () => dragged.current || Date.now() - lastDragEnd.current < AFTER_DRAG_MS,
    handlers: {
      onPointerDown(e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        last.current = { x: e.clientX, t: e.timeStamp, v: 0 };
        dragged.current = false;
        onGrab?.();
      },
      onPointerMove(e) {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) + Math.abs(dy) > CLICK_SLOP) dragged.current = true;
        if (!dragged.current) return;
        const l = last.current;
        const dt = Math.max(1, e.timeStamp - l.t);
        const v = l.v * 0.7 + ((e.clientX - l.x) / dt) * 0.3;
        last.current = { x: e.clientX, t: e.timeStamp, v };
        setTilt(Math.max(-TILT_MAX, Math.min(TILT_MAX, v * TILT_PER_SPEED)));
        if (idle.current) clearTimeout(idle.current);
        idle.current = setTimeout(stopTilt, TILT_IDLE_MS);
        setOffset({ x: dx / zoom, y: dy / zoom });
        onMove?.(dx / zoom, dy / zoom);
      },
      onPointerUp(e) {
        e.stopPropagation();
        end(e, true);
      },
      onPointerCancel(e) {
        end(e, false);
      },
    },
  };
}
