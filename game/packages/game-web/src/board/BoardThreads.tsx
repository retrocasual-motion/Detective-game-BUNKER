import type { BoardItem, BoardThread } from '@bunker/shared';
import { CARD_H, CARD_W } from '../canvas/geometry.ts';

interface BoardThreadsProps {
  items: BoardItem[];
  threads: BoardThread[];
  selectedId: string | null;
  onSelect(id: string): void;
  onEditLabel(id: string): void;
}

/** Нити доски — слой SVG под копиями, в мировых координатах. Игра их не проверяет (B-A). */
export function BoardThreads({
  items,
  threads,
  selectedId,
  onSelect,
  onEditLabel,
}: BoardThreadsProps) {
  const center = new Map(items.map((i) => [i.id, { x: i.x + CARD_W / 2, y: i.y + CARD_H / 2 }]));
  return (
    <svg className="board-threads" aria-hidden="true">
      {threads.map((t) => {
        const a = center.get(t.from);
        const b = center.get(t.to);
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
            {t.label && (
              <text className="board-thread-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8}>
                {t.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
