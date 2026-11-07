import type { BoardItem, BoardThread } from '@bunker/shared';
import { CARD_W, PIN_Y } from '../canvas/geometry.ts';

interface BoardThreadsProps {
  items: BoardItem[];
  threads: BoardThread[];
  selectedId: string | null;
  onSelect(id: string): void;
  onEditLabel(id: string): void;
}

/**
 * Нити доски — слой SVG поверх копий, от булавки к булавке, в мировых координатах.
 * Игра их не проверяет (B-A).
 */
export function BoardThreads({
  items,
  threads,
  selectedId,
  onSelect,
  onEditLabel,
}: BoardThreadsProps) {
  const pin = new Map(items.map((i) => [i.id, { x: i.x + CARD_W / 2, y: i.y + PIN_Y }]));
  return (
    <svg className="board-threads" aria-hidden="true">
      {threads.map((t) => {
        const a = pin.get(t.from);
        const b = pin.get(t.to);
        if (!a || !b) return null;
        return (
          <g key={t.id}>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: нить — линия SVG, цель для мыши; доступ с клавиатуры — этап дизайна */}
            <line
              className={`board-thread${t.id === selectedId ? ' board-thread-selected' : ''}`}
              data-testid={`board-thread-${t.id}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelect(t.id)}
              onDoubleClick={() => onEditLabel(t.id)}
            />
            <circle className="board-thread-pin" cx={a.x} cy={a.y} r={5} />
            <circle className="board-thread-pin" cx={b.x} cy={b.y} r={5} />
            {t.label && (
              // biome-ignore lint/a11y/noStaticElementInteractions: подпись нити — цель для мыши; доступ с клавиатуры — этап дизайна
              <text
                className="board-thread-label"
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 8}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={() => onEditLabel(t.id)}
              >
                {t.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
