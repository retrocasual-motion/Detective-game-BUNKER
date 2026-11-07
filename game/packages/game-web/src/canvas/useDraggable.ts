import { type PointerEvent, useRef, useState } from 'react';

const CLICK_SLOP = 3;

export interface DragResult {
  /** Смещение в мировых координатах, пока объект тянут (null — не тянут). */
  offset: { x: number; y: number } | null;
  /** Был ли последний жест перетаскиванием (а не кликом) — для двойного клика. */
  wasDragged(): boolean;
  handlers: {
    onPointerDown(e: PointerEvent<HTMLElement>): void;
    onPointerMove(e: PointerEvent<HTMLElement>): void;
    onPointerUp(e: PointerEvent<HTMLElement>): void;
    onPointerCancel(e: PointerEvent<HTMLElement>): void;
  };
}

/**
 * Перетаскивание объекта на холсте. Пока тянут — смещение живёт локально (плавно);
 * в конце жеста onDrop получает итоговое смещение в мировых координатах.
 */
export function useDraggable(
  zoom: number,
  onDrop: (dx: number, dy: number) => void,
  onGrab?: () => void,
): DragResult {
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  const end = (e: PointerEvent<HTMLElement>, commit: boolean) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    const dx = (e.clientX - s.x) / zoom;
    const dy = (e.clientY - s.y) / zoom;
    setOffset(null);
    if (commit && dragged.current) onDrop(dx, dy);
  };

  return {
    offset,
    wasDragged: () => dragged.current,
    handlers: {
      onPointerDown(e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        dragged.current = false;
        onGrab?.();
      },
      onPointerMove(e) {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) + Math.abs(dy) > CLICK_SLOP) dragged.current = true;
        if (dragged.current) setOffset({ x: dx / zoom, y: dy / zoom });
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
