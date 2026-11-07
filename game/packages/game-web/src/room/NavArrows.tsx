import type { View } from '@bunker/shared';
import { type Dir, NAV, VIEW_LABELS } from './views.ts';

const GLYPH: Record<Dir, string> = { left: '‹', right: '›', up: '˄', down: '˅' };

/** Маленькие стрелки по краям экрана — переход в соседний вид (ROOM-B). */
export function NavArrows({ view, onGo }: { view: View; onGo(view: View): void }) {
  return (
    <>
      {(Object.entries(NAV[view]) as [Dir, View][]).map(([dir, to]) => (
        <button
          key={dir}
          type="button"
          className={`nav-arrow nav-${dir}`}
          data-testid={`nav-${dir}`}
          aria-label={VIEW_LABELS[to]}
          onClick={() => onGo(to)}
        >
          <span className="nav-glyph">{GLYPH[dir]}</span>
          <span className="nav-label">{VIEW_LABELS[to]}</span>
        </button>
      ))}
    </>
  );
}
