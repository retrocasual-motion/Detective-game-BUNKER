import { create } from 'zustand';
import { reducedMotion } from '../motion.ts';
import type { LampLook } from './decor.ts';

/**
 * Лампа на столе (автор 25.11): цепочка — навели, она чуть подаётся; щёлкнули или потянули вниз —
 * цепочка уходит вниз и возвращается, лампа включается или выключается. Пока — только свет на столе;
 * свет в комнате — на этапе дизайна. Не сохраняется: каждый раз лампа горит.
 */
export const useLamp = create<LampLook & { hover: boolean }>(() => ({
  on: true,
  pull: 0,
  hover: false,
}));

/** Насколько цепочка подаётся при наведении. */
const HOVER_PULL = 0.15;
/** Длительность рывка цепочки, мс. */
const TUG_MS = 260;

export function lampHover(on: boolean) {
  useLamp.setState((s) => ({
    hover: on,
    pull: s.pull > HOVER_PULL ? s.pull : on ? HOVER_PULL : 0,
  }));
}

/** Тянут мышью: 0…1 — насколько. */
export function lampDrag(pull: number) {
  useLamp.setState({ pull: Math.max(0, Math.min(1, pull)) });
}

/** Отпустили или щёлкнули: дотянуть, переключить, вернуть цепочку. */
export function lampTug() {
  const from = useLamp.getState().pull;
  if (reducedMotion()) {
    useLamp.setState((s) => ({ on: !s.on, pull: s.hover ? HOVER_PULL : 0 }));
    return;
  }
  const start = performance.now();
  let toggled = false;
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / TUG_MS);
    // Первая половина — вниз до конца, вторая — обратно.
    const down = t < 0.5 ? from + (1 - from) * (t / 0.5) : 1 - (t - 0.5) / 0.5;
    if (!toggled && t >= 0.5) {
      toggled = true;
      useLamp.setState((s) => ({ on: !s.on }));
    }
    const rest = useLamp.getState().hover ? HOVER_PULL : 0;
    useLamp.setState({ pull: t < 1 ? Math.max(rest, down) : rest });
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
