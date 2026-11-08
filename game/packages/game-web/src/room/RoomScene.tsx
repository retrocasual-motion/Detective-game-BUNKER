import type { View } from '@bunker/shared';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import {
  easeCamera,
  faceOps,
  lerpPose,
  POSES,
  type Pose,
  perspectiveFor,
  poseOps,
  toCss,
  transitionMs,
} from './camera.ts';
import { drawRoom } from './decor.ts';
import { NavArrows } from './NavArrows.tsx';
import { useViewport } from './useViewport.ts';
import { VIEW_LABELS } from './views.ts';

type FaceView = Exclude<View, 'room'>;

interface Phase {
  /** Откуда едет камера — поза, а не вид: новый переход посреди старого начинается с места. */
  from: Pose;
  /** Из какого вида уехали (для длительности перехода). */
  fromView: View;
  to: View;
  moving: boolean;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface RoomSceneProps {
  view: View;
  onGo(view: View): void;
  /** Стрелки по краям прячутся, пока открыт просмотрщик. */
  hideNav: boolean;
  faces: Record<FaceView, ReactNode>;
}

/**
 * Комната (ROOM-B): три вида — грани одной серой 3D-комнаты, переход — движение камеры.
 * Грани — CSS 3D; стены и пол — холст со своей проекцией (camera.ts, decor.ts).
 * Камера в движении ведётся кадрами из JS, чтобы холст и грани не расходились.
 * В покое активная грань лежит плоско (без 3D), остальные скрыты.
 */
export function RoomScene({ view, onGo, hideNav, faces }: RoomSceneProps) {
  const vp = useViewport();
  const p = perspectiveFor(vp);
  const [ph, setPh] = useState<Phase>({
    from: POSES[view],
    fromView: view,
    to: view,
    moving: false,
  });
  const world = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /** Где камера сейчас (в том числе посреди перехода). */
  const live = useRef<Pose>(POSES[view]);

  const apply = (pose: Pose | null) => {
    if (pose) live.current = pose;
    if (world.current) world.current.style.transform = pose ? toCss(poseOps(pose, p)) : 'none';
    if (pose && canvas.current) drawRoom(canvas.current, pose, p, vp);
  };

  useLayoutEffect(() => {
    setPh((cur) =>
      cur.to === view
        ? cur
        : {
            from: cur.moving ? live.current : POSES[cur.to],
            fromView: cur.to,
            to: view,
            moving: !reducedMotion(),
          },
    );
  }, [view]);

  const flat = !ph.moving && ph.to !== 'room';

  // Покой: плоская грань или общий вид комнаты. Ставится после каждой отрисовки.
  useLayoutEffect(() => {
    if (!ph.moving) apply(flat ? null : POSES[ph.to]);
  });

  // Движение: кадры из JS — одна и та же поза для граней и холста. Первая поза ставится
  // до отрисовки (layout), иначе мелькнул бы кадр с гранями без камеры.
  // biome-ignore lint/correctness/useExhaustiveDependencies: перезапуск — только при новом переходе
  useLayoutEffect(() => {
    if (!ph.moving) return;
    const a = ph.from;
    const b = POSES[ph.to];
    const duration = transitionMs(ph.fromView, ph.to);
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      apply(lerpPose(a, b, easeCamera(t)));
      if (t < 1) raf = requestAnimationFrame(frame);
      else setPh((c) => ({ ...c, moving: false }));
    };
    apply(a);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ph.moving, ph.from, ph.fromView, ph.to]);

  const inRoom = !ph.moving && ph.to === 'room';

  return (
    <div
      className="scene"
      data-testid="scene"
      data-view={ph.to}
      data-moving={ph.moving}
      style={{ perspective: `${p}px` }}
    >
      <canvas ref={canvas} className="scene-decor" hidden={flat} />
      <div ref={world} className="world">
        {(['desk', 'left', 'right'] as const).map((f) => {
          const active = flat && f === ph.to;
          const cls = [
            'plane',
            'face',
            `face-${f}`,
            active && 'face-active',
            flat && !active && 'face-hidden',
          ];
          return (
            <div
              key={f}
              className={cls.filter(Boolean).join(' ')}
              style={{
                width: vp.width,
                height: vp.height,
                left: -vp.width / 2,
                top: -vp.height / 2,
                transform: active ? 'none' : toCss(faceOps(f, p)),
              }}
            >
              <div className="face-content" inert={!active}>
                {faces[f]}
              </div>
              {inRoom && (
                <button
                  type="button"
                  className="face-zone"
                  data-testid={`zone-${f}`}
                  onClick={() => onGo(f)}
                >
                  {VIEW_LABELS[f]}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {/* Стрелки видны и во время перехода: щелчок сразу ведёт к новой цели (MOVE-A). */}
      {!hideNav && <NavArrows view={ph.to} onGo={onGo} />}
    </div>
  );
}
