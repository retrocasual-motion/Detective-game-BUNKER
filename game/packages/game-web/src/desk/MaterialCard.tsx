import type { DeskItem, Material } from '@bunker/shared';
import { memo } from 'react';
import { useDraggable } from '../canvas/useDraggable.ts';

interface MaterialCardProps {
  item: DeskItem;
  material: Material;
  zoom: number;
  onMove(materialId: string, x: number, y: number): void;
  onGrab(materialId: string): void;
  onOpen?(materialId: string): void;
}

/**
 * Материал на столе — лист бумаги (DESK-A): лежит с поворотом, при взятии приподнимается
 * (тень больше), в движении отстаёт от руки наклоном, после отпускания оседает.
 * Один клик (без перетаскивания) — открыть.
 */
export const MaterialCard = memo(function MaterialCard({
  item,
  material,
  zoom,
  onMove,
  onGrab,
  onOpen,
}: MaterialCardProps) {
  const drag = useDraggable({
    zoom,
    onDrop: (dx, dy) => onMove(item.materialId, item.x + dx, item.y + dy),
    onGrab: () => onGrab(item.materialId),
  });
  const x = item.x + (drag.offset?.x ?? 0);
  const y = item.y + (drag.offset?.y ?? 0);

  return (
    <button
      type="button"
      aria-label={`${material.id}. ${material.title}`}
      className={`card paper${drag.offset ? ' card-dragging' : ''}`}
      data-testid={`card-${item.materialId}`}
      style={{ translate: `${x}px ${y}px`, rotate: `${item.rot + drag.tilt}deg`, zIndex: item.z }}
      onClick={() => {
        if (!drag.wasDragged()) onOpen?.(item.materialId);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen?.(item.materialId);
      }}
      {...drag.handlers}
    >
      <span className="card-id">{material.id}</span>
      <span className="card-title">{material.title}</span>
    </button>
  );
});
