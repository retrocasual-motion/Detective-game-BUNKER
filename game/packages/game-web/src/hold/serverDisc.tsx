import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { roomFor } from '../room/camera.ts';
import { deskObjects, screenRect } from '../room/decor.ts';
import { insertServerDisc } from '../room/drive.ts';
import { useViewport } from '../room/useViewport.ts';
import { useGame } from '../store.ts';
import Held3D from './Held3D.tsx';
import { EnvelopeFlap, Plate, paintFlapShadow, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Конверт «Прил. 7 · Сервер VL-31» с диском (A-272, AC-2; автор 19.11): в руках — заклеенный
 * конверт, потянули клапан (OG-B) — в руках диск, его крутят и читают надпись. Отложили — диск лежит
 * на столе; вставляет его игрок сам: зажать на столе и дотащить до дисковода под монитором
 * (DD-A, `room/drive.ts`) — или, держа диск в руках, щёлкнуть по дисководу за ним (UX-3, DA-2: путь
 * без удержания кнопки). Кнопки «Вставить» нет. Надписи — только из канона: на конверте
 * маркером «Прил. 7 · Сервер VL-31» (файл 52), диск — «Прил. 7 · Сервер VL-31» (L214).
 */

const KRAFT = '#b58f5a';
const INK = '#1d1d1d';
const LABEL = 'Прил. 7 · Сервер VL-31';

/**
 * Конверт заклеен, без печати; надпись маркером. Клапан тянут вверх — вскрыт, в руках диск (OG-B,
 * автор 23.11: не кнопкой).
 */
function ServerEnvelope({ onOpen }: { onOpen: () => void }) {
  const front = useTexture(
    () =>
      paintTexture(2.6, 1.8, KRAFT, ({ ctx, w, h, text }) => {
        paintFlapShadow(ctx, w, (FLAP_D / 1.8) * h);
        ctx.fillStyle = INK;
        // Надписи — под клапаном.
        text('Дело № 09-1128', w * 0.07, h * 0.4, w * 0.8, '54px Georgia, serif', 64);
        // Маркер — толстые буквы от руки.
        text(LABEL, w * 0.07, h * 0.5, w * 0.86, '700 132px "Comic Sans MS", cursive', 150);
      }),
    [],
  );
  return (
    <group>
      <mesh>
        <boxGeometry args={[2.6, 1.8, 0.04]} />
        <meshStandardMaterial color={KRAFT} roughness={0.9} />
      </mesh>
      <Plate w={2.6} h={1.8} z={0.0205} map={front} />
      <EnvelopeFlap
        w={2.6}
        h={1.8}
        depth={FLAP_D}
        z={0.0205}
        seal={false}
        label="Вскрыть конверт"
        testId="disc-envelope-open"
        onOpen={onOpen}
      />
    </group>
  );
}

/** Глубина клапана конверта с диском. */
const FLAP_D = 0.62;

/** Диск: сверху — белая печатная сторона с надписью маркером, снизу — зеркальная; дырка в центре. */
function Disc() {
  const R = 1;
  const top = useTexture(
    () =>
      paintTexture(2, 2, null, ({ ctx, w, h, text }) => {
        const c = w / 2;
        ctx.fillStyle = '#ecebe6';
        ctx.beginPath();
        ctx.arc(c, c, c, 0, Math.PI * 2);
        ctx.fill();
        // Прозрачное кольцо у центра и отверстие (alphaTest).
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(c, c, c * 0.075, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgb(0 0 0 / 18%)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(c, c, c * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        text(LABEL, c, h * 0.16, w * 0.62, '700 110px "Comic Sans MS", cursive', 124);
        ctx.textAlign = 'left';
      }),
    [],
  );
  const hole = useTexture(
    () =>
      paintTexture(2, 2, null, ({ ctx, w }) => {
        const c = w / 2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(c, c, c, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(c, c, c * 0.075, 0, Math.PI * 2);
        ctx.fill();
      }),
    [],
  );
  return (
    <group>
      {/* Печатная сторона — к игроку. */}
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[2 * R, 2 * R]} />
        <meshStandardMaterial map={top} transparent alphaTest={0.5} roughness={0.8} />
      </mesh>
      {/* Зеркальная сторона — серебро с отливом. */}
      <mesh position={[0, 0, -0.012]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[2 * R, 2 * R]} />
        <meshStandardMaterial
          color="#c9ccd3"
          alphaMap={hole}
          transparent
          alphaTest={0.5}
          metalness={0.9}
          roughness={0.18}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Дисковод за диском в руках (UX-3): стол виден за вещью — щелчок по дисководу вставляет диск.
 * Без подписи и подсветки до наведения: догадаться — дело игрока (DD-A).
 */
function DriveTarget() {
  const vp = useViewport();
  const r = useMemo(() => {
    const room = roomFor(vp);
    const drive = deskObjects(room, () => '#000000').find((o) => o.key === 'drive');
    return drive ? screenRect(drive, room.poses.desk, room) : null;
  }, [vp]);
  if (!r) return null;
  return (
    <button
      type="button"
      className="held-drive"
      data-testid="held-drive"
      aria-label="Дисковод компьютера"
      title="Дисковод компьютера"
      style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        useGame.getState().hold(null);
        void insertServerDisc();
      }}
    />
  );
}

export function ServerDiscHeld() {
  const out = useGame((g) => !!g.state?.discOut);
  const close = () => useGame.getState().hold(null);
  return (
    <Held3D
      key={out ? 'disc' : 'envelope'}
      mode="free"
      half={out ? [1.2, 1.2] : [1.5, 1.1]}
      label={out ? `Диск «${LABEL}»` : `Конверт «${LABEL}»`}
      onClose={close}
      overlay={out ? <DriveTarget /> : undefined}
    >
      {out ? <Disc /> : <ServerEnvelope onOpen={() => useGame.getState().takeDiscOut()} />}
    </Held3D>
  );
}
