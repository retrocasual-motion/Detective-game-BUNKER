import { DoubleSide } from 'three';
import { useGame } from '../store.ts';
import Held3D from './Held3D.tsx';
import { Plate, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Конверт «Прил. 7 · Сервер VL-31» с диском (A-272, AC-2; автор 19.11): в руках — заклеенный
 * конверт, «Вскрыть конверт» — в руках диск, его крутят и читают надпись. Отложили — диск лежит
 * на столе; вставляет его игрок сам: зажать на столе и дотащить до дисковода под монитором
 * (DD-A, `room/drive.ts`). Кнопки «Вставить» нет. Надписи — только из канона: на конверте
 * маркером «Прил. 7 · Сервер VL-31» (файл 52), диск — «Прил. 7 · Сервер VL-31» (L214).
 */

const KRAFT = '#b58f5a';
const INK = '#1d1d1d';
const LABEL = 'Прил. 7 · Сервер VL-31';

/** Конверт заклеен, без печати; надпись маркером. */
function ServerEnvelope() {
  const front = useTexture(
    () =>
      paintTexture(2.6, 1.8, KRAFT, ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        text('Дело № 09-1128', w * 0.07, h * 0.1, w * 0.8, '54px Georgia, serif', 64);
        // Маркер — толстые буквы от руки.
        text(LABEL, w * 0.07, h * 0.36, w * 0.86, '700 132px "Comic Sans MS", cursive', 150);
      }),
    [],
  );
  const back = useTexture(
    () =>
      paintTexture(2.6, 1.8, KRAFT, ({ ctx, w, h }) => {
        // Клапан заклеен — треугольник и полоса клея.
        ctx.fillStyle = 'rgb(0 0 0 / 10%)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w / 2, h * 0.3);
        ctx.closePath();
        ctx.fill();
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
      <Plate w={2.6} h={1.8} z={-0.0205} back map={back} />
    </group>
  );
}

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
      action={
        out ? undefined : (
          <div className="held-action">
            <button
              type="button"
              className="tool held-action-btn"
              data-testid="disc-envelope-open"
              onClick={() => useGame.getState().takeDiscOut()}
            >
              Вскрыть конверт
            </button>
          </div>
        )
      }
    >
      {out ? <Disc /> : <ServerEnvelope />}
    </Held3D>
  );
}
