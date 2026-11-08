import type { View } from '@bunker/shared';
import { type Dir, NAV, VIEW_LABELS } from './views.ts';

const GLYPH: Record<Dir, string> = { left: '‹', right: '›', up: '˄', down: '˅' };

/**
 * Значок — по движению камеры (UX-F1, SP-1): к столу — «вниз» (наклон к столу), в комнату —
 * «вверх» (поднять голову и отойти), хотя обе стрелки внизу по центру (ROOM-ARROW).
 */
const glyphFor = (dir: Dir, to: View) => (to === 'room' ? '˄' : GLYPH[dir]);

/**
 * Стрелки по краям экрана — переход в соседний вид (ROOM-B). Вплотную к краю (UX-F1, MS-2:
 * к краю мышь «бросают» без прицела), подпись видна всегда (UX-F2).
 */
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
          <span className="nav-glyph">{glyphFor(dir, to)}</span>
          <span className="nav-label">{VIEW_LABELS[to]}</span>
        </button>
      ))}
    </>
  );
}
