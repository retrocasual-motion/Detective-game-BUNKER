import type { Thread } from '@bunker/shared';
import type { MouseEvent } from 'react';
import { CARD_W, PIN_Y } from '../canvas/geometry.ts';

type Pt = { x: number; y: number };
/** Где висит вещь; w — ширина (у записок своя). */
export type At = Pt & { w?: number };

/** Кнопка вещи — вверху посередине: от неё идёт нить. */
export const pinOf = (p: At): Pt => ({ x: p.x + (p.w ?? CARD_W) / 2, y: p.y + PIN_Y });

/**
 * Полоса для щелчка по нити не доходит до кнопок на концах: иначе она лежала поверх кнопки, и
 * от листа с нитью нельзя было протянуть вторую (щелчок попадал в нить). Радиус кнопки (7) и
 * половина полосы (5) — в мировых единицах, как и нить.
 */
const PIN_GAP = 12;
function hitSegment(a: Pt, b: Pt): [Pt, Pt] | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len <= 2 * PIN_GAP) return null;
  const k = PIN_GAP / len;
  const dx = (b.x - a.x) * k;
  const dy = (b.y - a.y) * k;
  return [
    { x: a.x + dx, y: a.y + dy },
    { x: b.x - dx, y: b.y - dy },
  ];
}

interface WallThreadsProps {
  /** Где сейчас висит каждый материал (с учётом перетаскивания). */
  at: Map<string, At>;
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
  const lines = (list: Thread[]) =>
    list.map((t) => {
      const fa = at.get(t.from);
      const fb = at.get(t.to);
      if (!fa || !fb) return null;
      const a = pinOf(fa);
      const b = pinOf(fb);
      const [ha, hb] = hitSegment(a, b) ?? [a, a];
      return (
        <g key={t.id}>
          <line className="board-thread" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          {/* biome-ignore lint/a11y/noStaticElementInteractions: нить — линия SVG, цель для мыши; доступ с клавиатуры — этап дизайна */}
          <line
            className="board-thread-hit"
            data-testid={`thread-${t.from}-${t.to}`}
            x1={ha.x}
            y1={ha.y}
            x2={hb.x}
            y2={hb.y}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onThreadClick(t.id, e)}
            onDoubleClick={(e) => onThreadDoubleClick(t.id, e)}
          >
            {/* Подсказка жестов (RV-22): раньше их было не угадать. */}
            <title>Щелчок — подписать нить; двойной щелчок — снять</title>
          </line>
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
    });
  return (
    <svg className="board-threads" aria-hidden="true">
      {lines(threads)}
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
