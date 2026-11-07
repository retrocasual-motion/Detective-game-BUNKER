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

/** Материал на столе. Серый прототип: прямоугольник с номером и названием (TECH_PLAN 9.1). */
export const MaterialCard = memo(function MaterialCard({
  item,
  material,
  zoom,
  onMove,
  onGrab,
  onOpen,
}: MaterialCardProps) {
  const drag = useDraggable(
    zoom,
    (dx, dy) => onMove(item.materialId, item.x + dx, item.y + dy),
    () => onGrab(item.materialId),
  );
  const x = item.x + (drag.offset?.x ?? 0);
  const y = item.y + (drag.offset?.y ?? 0);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${material.id}. ${material.title}`}
      className={`card${drag.offset ? ' card-dragging' : ''}`}
      data-testid={`card-${item.materialId}`}
      style={{ transform: `translate(${x}px, ${y}px)`, zIndex: item.z }}
      onDoubleClick={() => {
        if (!drag.wasDragged()) onOpen?.(item.materialId);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen?.(item.materialId);
      }}
      {...drag.handlers}
    >
      <div className="card-id">{material.id}</div>
      <div className="card-title">{material.title}</div>
    </div>
  );
});
