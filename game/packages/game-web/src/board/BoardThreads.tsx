import type { BoardItem, BoardThread } from '@bunker/shared';
import type { MouseEvent } from 'react';
import { CARD_W, PIN_Y } from '../canvas/geometry.ts';

export const pinOf = (i: { x: number; y: number }) => ({ x: i.x + CARD_W / 2, y: i.y + PIN_Y });

interface BoardThreadsProps {
  /** Копии с учётом перетаскивания — нить идёт за карточкой сразу. */
  items: BoardItem[];
  threads: BoardThread[];
  /** Нить, которую сейчас тянут от булавки: от булавки до курсора. */
  pulling: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  onThreadClick(id: string, e: MouseEvent): void;
  onThreadDoubleClick(id: string, e: MouseEvent): void;
}

/**
 * Нити доски — слой SVG поверх копий, от булавки к булавке, в мировых координатах.
 * Игра их не проверяет (B-A). У нити широкая невидимая полоса — попасть мышью легко.
 */
export function BoardThreads({
  items,
  threads,
  pulling,
  onThreadClick,
  onThreadDoubleClick,
}: BoardThreadsProps) {
  const pin = new Map(items.map((i) => [i.id, pinOf(i)]));
  return (
    <svg className="board-threads" aria-hidden="true">
      {threads.map((t) => {
        const a = pin.get(t.from);
        const b = pin.get(t.to);
        if (!a || !b) return null;
        return (
          <g key={t.id}>
            <line className="board-thread" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {/* biome-ignore lint/a11y/noStaticElementInteractions: нить — линия SVG, цель для мыши; доступ с клавиатуры — этап дизайна */}
            <line
              className="board-thread-hit"
              data-testid={`board-thread-${t.id}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => onThreadClick(t.id, e)}
              onDoubleClick={(e) => onThreadDoubleClick(t.id, e)}
            />
            {t.label && (
              // biome-ignore lint/a11y/noStaticElementInteractions: подпись нити — цель для мыши; доступ с клавиатуры — этап дизайна
              <text
                className="board-thread-label"
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 8}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onThreadClick(t.id, e)}
                onDoubleClick={(e) => onThreadDoubleClick(t.id, e)}
              >
                {t.label}
              </text>
            )}
          </g>
        );
      })}
      {pulling && (
        <line
          className="board-thread board-thread-pulling"
          data-testid="board-thread-pulling"
          x1={pulling.from.x}
          y1={pulling.from.y}
          x2={pulling.to.x}
          y2={pulling.to.y}
        />
      )}
    </svg>
  );
}
