import type { Thread } from '@bunker/shared';
import type { MouseEvent } from 'react';
import { CARD_W, PIN_Y } from '../canvas/geometry.ts';

type Pt = { x: number; y: number };

/** Кнопка листа — вверху посередине: от неё идёт нить. */
export const pinOf = (p: Pt): Pt => ({ x: p.x + CARD_W / 2, y: p.y + PIN_Y });

interface WallThreadsProps {
  /** Где сейчас висит каждый материал (с учётом перетаскивания). */
  at: Map<string, Pt>;
  threads: Thread[];
  /** Нить, которую сейчас тянут от кнопки: до курсора. */
  pulling: { from: Pt; to: Pt } | null;
  onThreadClick(id: string, e: MouseEvent): void;
  onThreadDoubleClick(id: string, e: MouseEvent): void;
  onLabelClick(id: string, e: MouseEvent): void;
}

/**
 * Нити стены — слой SVG поверх листов, от кнопки к кнопке, в мировых координатах.
 * Игра их не проверяет (T-5-A, P-1). У нити широкая невидимая полоса — попасть легко.
 */
export function WallThreads({
  at,
  threads,
  pulling,
  onThreadClick,
  onThreadDoubleClick,
  onLabelClick,
}: WallThreadsProps) {
  return (
    <svg className="board-threads" aria-hidden="true">
      {threads.map((t) => {
        const fa = at.get(t.from);
        const fb = at.get(t.to);
        if (!fa || !fb) return null;
        const a = pinOf(fa);
        const b = pinOf(fb);
        return (
          <g key={t.id}>
            <line className="board-thread" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {/* biome-ignore lint/a11y/noStaticElementInteractions: нить — линия SVG, цель для мыши; доступ с клавиатуры — этап дизайна */}
            <line
              className="board-thread-hit"
              data-testid={`thread-${t.from}-${t.to}`}
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
                onClick={(e) => onLabelClick(t.id, e)}
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
          data-testid="thread-pulling"
          x1={pulling.from.x}
          y1={pulling.from.y}
          x2={pulling.to.x}
          y2={pulling.to.y}
        />
      )}
    </svg>
  );
}
