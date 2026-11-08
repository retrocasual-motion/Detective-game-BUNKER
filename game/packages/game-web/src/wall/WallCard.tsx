import type { Material } from '@bunker/shared';
import { memo, type PointerEvent } from 'react';
import { useDraggable } from '../canvas/useDraggable.ts';

export interface Place {
  x: number;
  y: number;
  rot: number;
  z: number;
}

/** Предмет со стола висит на стене карточкой (ITEM-A): устройство или пакет вещдоков. */
export const isItemCard = (m: Material) => m.placement === 'evidence' || m.kind === 'bag';

interface WallCardProps {
  material: Material;
  place: Place;
  /** Снят в поле (иначе висит в своей колонке). */
  onField: boolean;
  zoom: number;
  onOpen(materialId: string): void;
  onDrop(materialId: string, x: number, y: number): void;
  onLive(materialId: string, dx: number, dy: number): void;
  onReturn(materialId: string): void;
  pin: {
    onPointerDown(e: PointerEvent<HTMLElement>, materialId: string): void;
    onPointerMove(e: PointerEvent<HTMLElement>): void;
    onPointerUp(e: PointerEvent<HTMLElement>): void;
    onPointerCancel(): void;
  };
}

/**
 * Материал на стене: лист своего типа на одной кнопке (слегка косо) или карточка предмета со
 * стола — фото и номер с бирки, ничего сверх бирки (ITEM-A). Щелчок — открыть (у предмета —
 * «взять в руки», OPEN-A); потянуть — снять в поле или передвинуть; от кнопки — нить.
 * В поле у листа есть «↩» — вернуть в колонку.
 */
export const WallCard = memo(function WallCard({
  material,
  place,
  onField,
  zoom,
  onOpen,
  onDrop,
  onLive,
  onReturn,
  pin,
}: WallCardProps) {
  const id = material.id;
  const drag = useDraggable({
    zoom,
    onDrop: (dx, dy) => onDrop(id, place.x + dx, place.y + dy),
    onMove: (dx, dy) => onLive(id, dx, dy),
  });
  const x = place.x + (drag.offset?.x ?? 0);
  const y = place.y + (drag.offset?.y ?? 0);
  const item = isItemCard(material);
  const kind = item ? 'item' : material.kind;

  return (
    <div
      className={`wall-card${drag.offset ? ' wall-card-dragging' : ''}`}
      data-testid={`wall-${id}`}
      data-wall-item={id}
      data-place={onField ? 'field' : 'column'}
      style={{
        translate: `${x}px ${y}px`,
        rotate: `${place.rot + drag.tilt}deg`,
        zIndex: drag.offset ? 5000 : place.z,
      }}
    >
      <button
        type="button"
        aria-label={`${id}. ${material.title}`}
        className={`card paper paper-${kind}${drag.offset ? ' card-dragging' : ''}`}
        data-kind={kind}
        onClick={() => {
          if (!drag.wasDragged()) onOpen(id);
        }}
        {...drag.handlers}
      >
        {item ? (
          <>
            <span className="card-id">Изъято · {id}</span>
            <span className="card-title">{material.title}</span>
            <span className={`item-photo item-photo-${id}`} aria-hidden />
          </>
        ) : (
          <>
            <span className="card-id">{id}</span>
            <span className="card-title">{material.title}</span>
            {material.kind === 'disc' && <span className="paper-disc-window" aria-hidden />}
          </>
        )}
      </button>
      <button
        type="button"
        className="wall-pin"
        data-testid={`pin-${id}`}
        aria-label="Тянуть нить от кнопки"
        title="Потяните к другому листу или щёлкните и затем щёлкните по нему — получится нить"
        onPointerDown={(e) => pin.onPointerDown(e, id)}
        onPointerMove={pin.onPointerMove}
        onPointerUp={pin.onPointerUp}
        onPointerCancel={pin.onPointerCancel}
      />
      {onField && (
        <button
          type="button"
          className="wall-return"
          data-testid={`return-${id}`}
          aria-label="Вернуть в колонку"
          title="Вернуть в колонку"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onReturn(id)}
        >
          ↩
        </button>
      )}
    </div>
  );
});
