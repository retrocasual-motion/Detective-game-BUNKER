import type { ContainerId, View } from '@bunker/shared';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCall } from '../deskphone/call.ts';
import { closePhone } from '../deskphone/DeskPhone.tsx';
import { PhoneFace } from '../deskphone/PhoneFace.tsx';
import { reducedMotion } from '../motion.ts';
import { useGame } from '../store.ts';
import {
  boardOps,
  type CameraSpot,
  easeCamera,
  lerpPose,
  type Pose,
  poseOps,
  roomFor,
  TRANSITION_MS,
  toCss,
} from './camera.ts';
import { DeskHotspots } from './DeskHotspots.tsx';
import { type Bank, type DiscOnDesk, drawObjects, drawRoom, type Epilogue } from './decor.ts';
import { DRIVE_IDLE, type DriveLook } from './drive.ts';
import { NavArrows } from './NavArrows.tsx';
import { useViewport } from './useViewport.ts';
import { VIEW_LABELS } from './views.ts';

interface Phase {
  /** Откуда едет камера — поза, а не вид: новый переход посреди старого начинается с места. */
  from: Pose;
  to: CameraSpot;
  moving: boolean;
}

interface RoomSceneProps {
  view: View;
  onGo(view: View): void;
  /** Стрелки по краям прячутся, пока открыт просмотрщик или компьютер. */
  hideNav: boolean;
  /** Содержимое доски (стена). */
  wall: ReactNode;
  /** «Входящие» на столе: что стоит в лотке, свежее — первым. */
  inbox: string[];
  /** Вскрытые конверты архива (A-260). */
  opened: readonly ContainerId[];
  /** Эпилог после заключения — конвертом на столе. */
  epilogue?: Epilogue;
  /** Диск сервера на столе (A-272). */
  disc?: DiscOnDesk;
  /** Дисковод под монитором: кадр вставки. */
  drive?: DriveLook;
  /** Коробка из банка (A-272). */
  bank?: Bank;
}

/**
 * Комната (решение «Стена», 08.11): стол от первого лица и доска на стене за ним.
 * Доска — DOM в CSS 3D; комната, столешница и предметы — два холста своей проекцией
 * (camera.ts, decor.ts): задний под доской, передний над ней (монитор и лампа заходят на
 * доску). Камера в движении ведётся кадрами из JS, чтобы холсты и доска не расходились.
 * В покое на виде «Стена» доска лежит плоско (без 3D), холсты скрыты.
 */
export function RoomScene({
  view,
  onGo,
  hideNav,
  wall,
  inbox,
  opened,
  epilogue = 'none',
  disc = 'none',
  bank = 'none',
  drive = DRIVE_IDLE,
}: RoomSceneProps) {
  const vp = useViewport();
  const room = useMemo(() => roomFor(vp), [vp]);
  // Телефон на столе крупно (6a-3): камера подлетает к нему — третья поза, не вид комнаты.
  const phoneOpen = useGame((g) => g.deskPhone);
  // Телефон на столе объёмный: снятая трубка и утопленная кнопка рисуются на холсте.
  const offHook = useCall((c) => c.offHook);
  const pressed = useCall((c) => c.pressed);
  const spot: CameraSpot = view === 'desk' && phoneOpen ? 'phone' : view;
  const [ph, setPh] = useState<Phase>({ from: room.poses[spot], to: spot, moving: false });
  const world = useRef<HTMLDivElement>(null);
  const phoneWorld = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  /** Где камера сейчас (в том числе посреди перехода). */
  const live = useRef<Pose>(room.poses[spot]);

  const apply = (pose: Pose | null) => {
    if (pose) live.current = pose;
    const css = pose ? toCss(poseOps(pose, room.p)) : 'none';
    if (world.current) world.current.style.transform = css;
    if (phoneWorld.current) phoneWorld.current.style.transform = css;
    if (pose && back.current) drawRoom(back.current, pose, room);
    if (pose && front.current)
      drawObjects(front.current, pose, room, inbox, opened, epilogue, disc, bank, drive, {
        offHook,
        pressed,
      });
  };

  useLayoutEffect(() => {
    setPh((cur) =>
      cur.to === spot
        ? cur
        : {
            from: cur.moving ? live.current : room.poses[cur.to],
            to: spot,
            moving: !reducedMotion(),
          },
    );
  }, [spot, room]);

  const flat = !ph.moving && ph.to === 'wall';

  // Покой: плоская доска или стол от первого лица. Ставится после каждой отрисовки.
  useLayoutEffect(() => {
    if (!ph.moving) apply(flat ? null : room.poses[ph.to]);
  });

  // Движение: кадры из JS — одна и та же поза для доски и холстов.
  // biome-ignore lint/correctness/useExhaustiveDependencies: перезапуск — только при новом переходе
  useLayoutEffect(() => {
    if (!ph.moving) return;
    const a = ph.from;
    const b = room.poses[ph.to];
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / TRANSITION_MS);
      apply(lerpPose(a, b, easeCamera(t)));
      if (t < 1) raf = requestAnimationFrame(frame);
      else setPh((c) => ({ ...c, moving: false }));
    };
    apply(a);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ph.moving, ph.from, ph.to]);

  const atDesk = !ph.moving && ph.to === 'desk';
  const atPhone = !ph.moving && ph.to === 'phone';

  return (
    <div
      className="scene"
      data-testid="scene"
      data-view={ph.to === 'phone' ? 'desk' : ph.to}
      data-spot={ph.to}
      data-moving={ph.moving}
      style={{ perspective: `${room.p}px` }}
    >
      <canvas ref={back} className="scene-decor" hidden={flat} />
      <div ref={world} className="world">
        <div
          className={`plane face face-wall${flat ? ' face-active' : ''}`}
          style={{
            width: vp.width,
            height: vp.height,
            left: -vp.width / 2,
            top: -vp.height / 2,
            transform: flat ? 'none' : toCss(boardOps()),
          }}
        >
          <div className="face-content" inert={!flat}>
            {wall}
          </div>
          {atDesk && (
            <button
              type="button"
              className="face-zone"
              data-testid="zone-wall"
              onClick={() => onGo('wall')}
            >
              {VIEW_LABELS.wall}
            </button>
          )}
        </div>
      </div>
      <canvas ref={front} className="scene-decor scene-front" hidden={flat} />
      {atPhone && (
        <button
          type="button"
          className="dp-away"
          data-testid="deskphone-close"
          aria-label="Отойти от телефона"
          onClick={closePhone}
        />
      )}
      {/* Телефон следователя — в той же 3D-сцене, поверх нарисованного стола (6a-3, DP-A). */}
      <div ref={phoneWorld} className="world" hidden={flat}>
        <PhoneFace room={room} active={atPhone} />
      </div>
      {atDesk && (
        <DeskHotspots
          room={room}
          inbox={inbox}
          opened={opened}
          epilogue={epilogue}
          disc={disc}
          bank={bank}
        />
      )}
      {/* Стрелки видны и во время перехода: щелчок сразу ведёт к новой цели (MOVE-A). */}
      {!hideNav && <NavArrows view={ph.to === 'phone' ? 'desk' : ph.to} onGo={onGo} />}
    </div>
  );
}
