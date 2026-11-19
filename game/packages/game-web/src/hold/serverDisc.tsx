import { useState } from 'react';
import { DoubleSide } from 'three';
import { postAction } from '../api.ts';
import { OFFLINE } from '../lock.ts';
import { useGame } from '../store.ts';
import Held3D, { afterLeaving } from './Held3D.tsx';
import { Plate, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Конверт «Прил. 7 · Сервер VL-31» с диском (A-272, AC-2; автор 19.11): в руках — заклеенный
 * конверт, «Вскрыть конверт» — в руках диск, его крутят и читают надпись; «Вставить диск в
 * компьютер» — движок (ОСМОТР 52 — вставить диск в дисковод), затем компьютер: лоток, диск,
 * раскрутка, значок программы. Надписи — только из канона: на конверте маркером «Прил. 7 ·
 * Сервер VL-31» (файл 52), диск — «Прил. 7 · Сервер VL-31» (L214).
 */

const KRAFT = '#b58f5a';
const INK = '#1d1d1d';
const LABEL = 'Прил. 7 · Сервер VL-31';
/** Цель действия — как в сквозном проходе пакета. */
const TARGET = '52__конверт_прил_7_сервер.md';

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
  const out = useGame((g) => g.discOut);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const close = () => useGame.getState().hold(null);

  const insert = async () => {
    if (busy) return;
    setBusy(true);
    const r = await postAction('ОСМОТР', TARGET, 'вставить диск в дисковод').catch(() => null);
    setBusy(false);
    if (!r) {
      setMsg(`${OFFLINE}.`);
      return;
    }
    const g = useGame.getState();
    if (r.released.length) g.addFound(r.released, 'pc', []);
    afterLeaving(() => {
      useGame.getState().hold(null);
      useGame.getState().insertDisc();
    });
  };

  const action = out ? (
    <div className="held-action">
      <button
        type="button"
        className="tool held-action-btn"
        data-testid="disc-insert"
        disabled={busy}
        onClick={() => void insert()}
      >
        Вставить диск в компьютер
      </button>
      {msg && (
        <p className="held-action-msg" role="status">
          {msg}
        </p>
      )}
    </div>
  ) : (
    <div className="held-action">
      <button
        type="button"
        className="tool held-action-btn"
        data-testid="disc-envelope-open"
        onClick={() => useGame.setState({ discOut: true })}
      >
        Вскрыть конверт
      </button>
    </div>
  );

  return (
    <Held3D
      key={out ? 'disc' : 'envelope'}
      mode="free"
      half={out ? [1.2, 1.2] : [1.5, 1.1]}
      label={out ? `Диск «${LABEL}»` : `Конверт «${LABEL}»`}
      onClose={close}
      action={action}
    >
      {out ? <Disc /> : <ServerEnvelope />}
    </Held3D>
  );
}
