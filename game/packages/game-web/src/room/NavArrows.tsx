import type { View } from '@bunker/shared';
import type { MouseEvent } from 'react';
import { type Dir, NAV, VIEW_LABELS } from './views.ts';

const GLYPH: Record<Dir, string> = { left: '‹', right: '›', up: '˄', down: '˅' };

/**
 * Стрелки по краям экрана — переход в соседний вид (ROOM-B). Вплотную к краю (UX-F1, MS-2:
 * к краю мышь «бросают» без прицела), подпись видна всегда (UX-F2).
 */
export function NavArrows({ view, onGo }: { view: View; onGo(view: View): void }) {
  // Второй щелчок двойного (detail > 1) — не новый переход: стрелка «Комната» в комнате ведёт
  // обратно к столу, и двойной щелчок вернул бы игрока туда же (UN-2).
  const go = (to: View, e: MouseEvent) => {
    if (e.detail > 1) return;
    onGo(to);
  };
  return (
    <>
      {(Object.entries(NAV[view]) as [Dir, View][]).map(([dir, to]) => (
        <button
          key={dir}
          type="button"
          className={`nav-arrow nav-${dir}`}
          data-testid={`nav-${dir}`}
          aria-label={VIEW_LABELS[to]}
          onClick={(e) => go(to, e)}
        >
          <span className="nav-glyph">{GLYPH[dir]}</span>
          <span className="nav-label">{VIEW_LABELS[to]}</span>
        </button>
      ))}
    </>
  );
}
