import type { Camera } from '@bunker/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { reducedMotion } from '../motion.ts';
import { easeCamera, TRANSITION_MS, type Viewport } from '../room/camera.ts';

/**
 * Камера доски при переходе стол ↔ стена (правка автора 09.11). Со стола доска видна целиком,
 * у стены — камера игрока (его приближение). Раньше камера менялась скачком в начале полёта;
 * теперь она перетекает от одной к другой за время полёта камеры комнаты и с тем же
 * сглаживанием. Масштаб — в логарифме, центр кадра — по прямой: приближение выглядит ровным.
 *
 * `mode` — что показывается (стол или стена): смена режима запускает переход; обычные
 * движения игрока (колесо, перетаскивание) применяются сразу.
 */
export function useCameraTween(target: Camera, mode: unknown, vp: Viewport): Camera {
  const shown = useRef(target);
  const lastMode = useRef(mode);
  const [tween, setTween] = useState<{ from: Camera; start: number } | null>(null);
  const [, setTick] = useState(0);

  let cam = target;
  if (tween) {
    const t = Math.min(1, (performance.now() - tween.start) / TRANSITION_MS);
    cam = mixCamera(tween.from, target, easeCamera(t), vp);
  }
  // Смена режима — переход от того, что было на экране (и посреди прошлого перехода).
  // shown — последняя показанная камера; пишется после отрисовки, не во время (StrictMode).
  useLayoutEffect(() => {
    if (lastMode.current !== mode) {
      lastMode.current = mode;
      if (!reducedMotion()) setTween({ from: shown.current, start: performance.now() });
    }
    shown.current = cam;
  });

  useLayoutEffect(() => {
    if (!tween) return;
    let raf = 0;
    const frame = (now: number) => {
      if (now - tween.start >= TRANSITION_MS) setTween(null);
      else {
        setTick((k) => k + 1);
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tween]);

  return cam;
}

/** Камера между a (t = 0) и b (t = 1): масштаб — в логарифме, центр экрана — по прямой. */
export function mixCamera(a: Camera, b: Camera, t: number, vp: Viewport): Camera {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t);
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const ax = (cx - a.x) / a.zoom;
  const ay = (cy - a.y) / a.zoom;
  const bx = (cx - b.x) / b.zoom;
  const by = (cy - b.y) / b.zoom;
  return {
    x: cx - (ax + (bx - ax) * t) * zoom,
    y: cy - (ay + (by - ay) * t) * zoom,
    zoom,
  };
}
