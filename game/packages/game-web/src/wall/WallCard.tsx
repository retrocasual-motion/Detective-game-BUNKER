import type { Material } from '@bunker/shared';
import { memo, type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { useDraggable } from '../canvas/useDraggable.ts';

export interface Place {
  x: number;
  y: number;
  rot: number;
  z: number;
}

/** Предмет со стола висит на стене карточкой (ITEM-A): устройство или пакет вещдоков. */
export const isItemCard = (m: Material) => m.placement === 'evidence' || m.kind === 'bag';

export interface PinHandlers {
  onPointerDown(e: PointerEvent<HTMLElement>, id: string): void;
  onPointerMove(e: PointerEvent<HTMLElement>): void;
  onPointerUp(e: PointerEvent<HTMLElement>): void;
  onPointerCancel(): void;
}

interface WallCardProps {
  id: string;
  place: Place;
  zoom: number;
  /** Вид вещи — по нему форма (`.paper-<kind>`, персонаж, записка, ярлык). */
  kind: string;
  label: string;
  children: ReactNode;
  /** Щелчок без перетаскивания: открыть материал или править записку. */
  onActivate?(id: string): void;
  onDrop(id: string, x: number, y: number, at: { x: number; y: number }): void;
  onLive(id: string, dx: number, dy: number, at?: { x: number; y: number }): void;
  pin: PinHandlers;
  /** Только у записок: ✕ — снять со стены (с «Вернуть»). */
  onDelete?(id: string): void;
  /** Записку правят — перетаскивание выключено, щелчки идут в поле ввода. */
  editing?: boolean;
  /** Своя ширина (записка, ярлык), мировые px. */
  width?: number;
  /** Ручка справа — потянуть, чтобы изменить ширину (как в Miro). */
  onResize?(id: string, width: number): void;
  /** Панель над вещью (размер шрифта у записки). */
  toolbar?: ReactNode;
  /** Вещь тянут над папкой ходатайства — вместо неё над папкой идёт её призрак. */
  hidden?: boolean;
}

/**
 * Вещь на стене на одной кнопке (слегка косо): лист своего типа, карточка предмета со стола
 * (ITEM-A), карточка персонажа, записка или ярлык игрока. Потянуть — передвинуть (куда
 * отпустили, там и висит); от кнопки — нить; щелчок — открыть (у записки — править).
 */
export const WallCard = memo(function WallCard({
  id,
  place,
  zoom,
  kind,
  label,
  children,
  onActivate,
  onDrop,
  onLive,
  pin,
  onDelete,
  editing,
  width,
  onResize,
  toolbar,
  hidden,
}: WallCardProps) {
  const [liveW, setLiveW] = useState<number | null>(null);
  const resize = useRef<{ x: number; w: number } | null>(null);
  const w = liveW ?? width;
  const drag = useDraggable({
    zoom,
    onDrop: (dx, dy, at) => onDrop(id, place.x + dx, place.y + dy, at),
    onMove: (dx, dy, at) => onLive(id, dx, dy, at),
  });
  const x = place.x + (drag.offset?.x ?? 0);
  const y = place.y + (drag.offset?.y ?? 0);
  const paperClass = `card paper paper-${kind}${drag.offset ? ' card-dragging' : ''}`;

  return (
    <div
      className={`wall-card wall-card-${kind}${drag.offset ? ' wall-card-dragging' : ''}${hidden ? ' wall-card-over-folder' : ''}`}
      data-testid={`wall-${id}`}
      data-wall-item={id}
      style={{
        translate: `${x}px ${y}px`,
        rotate: `${place.rot + drag.tilt}deg`,
        zIndex: drag.offset ? 100000 : place.z,
        ...(w ? { width: w } : {}),
      }}
    >
      {toolbar}
      {editing ? (
        <div className={paperClass} data-kind={kind}>
          {children}
        </div>
      ) : (
        <button
          type="button"
          aria-label={label}
          className={paperClass}
          data-kind={kind}
          onClick={() => {
            if (!drag.wasDragged()) onActivate?.(id);
          }}
          {...drag.handlers}
        >
          {children}
        </button>
      )}
      <button
        type="button"
        className="wall-pin"
        data-testid={`pin-${id}`}
        aria-label="Тянуть нить от кнопки"
        title="Потяните к другой вещи на стене или щёлкните и затем щёлкните по ней — получится нить"
        onPointerDown={(e) => pin.onPointerDown(e, id)}
        onPointerMove={pin.onPointerMove}
        onPointerUp={pin.onPointerUp}
        onPointerCancel={pin.onPointerCancel}
      />
      {onResize && w && (
        // biome-ignore lint/a11y/noStaticElementInteractions: ручка ширины — цель для мыши; клавиатура — этап дизайна
        <span
          className="wall-resize"
          data-testid={`resize-${id}`}
          title="Потяните, чтобы изменить ширину"
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            resize.current = { x: e.clientX, w };
          }}
          onPointerMove={(e) => {
            const r = resize.current;
            if (r) setLiveW(Math.max(80, Math.min(900, r.w + (e.clientX - r.x) / zoom)));
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            const r = resize.current;
            resize.current = null;
            if (r) onResize(id, Math.max(80, Math.min(900, r.w + (e.clientX - r.x) / zoom)));
            setLiveW(null);
          }}
          onPointerCancel={() => {
            resize.current = null;
            setLiveW(null);
          }}
        />
      )}
      {onDelete && !editing && (
        <button
          type="button"
          className="wall-delete"
          data-testid={`delete-${id}`}
          aria-label="Снять со стены"
          title="Снять со стены"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(id)}
        >
          ✕
        </button>
      )}
    </div>
  );
});
