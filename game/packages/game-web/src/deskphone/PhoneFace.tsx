import { type CSSProperties, useEffect, useState } from 'react';
import { ddmmyyyy, gameNow, hhmm } from '../clock.ts';
import type { Room } from '../room/camera.ts';
import { useGame } from '../store.ts';
import { useCall } from './call.ts';
import { KEYS, phoneSpots, type Spot } from './model.ts';
import './deskphone.css';

/**
 * Надписи и зоны щелчка телефона на столе (6a-3, DP-A). Сам телефон — объёмный, нарисован на
 * столе брусками (`model.ts` → `decor.ts`); здесь — плоские слои на верхах брусков в той же
 * 3D-сцене (`RoomScene`): текст экранчика, цифры на кнопках, места щелчка клавиш под экранчиком и
 * трубки. Со стола — просто вещь (щелчок ведёт камеру); камера у телефона — всё нажимается.
 */

const LETTERS: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': '+',
};
const keyId = (k: string) => (k === '*' ? 'star' : k === '#' ? 'hash' : k);

/** Логическая ширина слоя (px) — по ней шрифты; в сцене слой сжат до размера зоны. */
const LOGICAL = { lcd: 340, key: 56, soft: 64, handset: 70 } as const;

/** Слой на верхе бруска: центр зоны, плашмя, повёрнут вместе с трубкой. */
function place(room: Room, s: Spot, logicalW: number, yaw = 0): CSSProperties {
  const k = (s.w * room.p) / logicalW;
  return {
    width: logicalW,
    height: (logicalW * s.d) / s.w,
    transform: `translate3d(${s.x * room.p}px, ${room.deskY - s.top * room.p}px, ${
      s.z * room.p
    }px) rotateX(90deg) rotateZ(${-yaw}deg) scale(${k}) translate(-50%, -50%)`,
  };
}

export function PhoneFace({ room, active }: { room: Room; active: boolean }) {
  const started = useGame((g) => g.state?.started);
  const [now, setNow] = useState(() => gameNow(started));
  const c = useCall();
  useEffect(() => {
    const t = setInterval(() => setNow(gameNow(started)), 1000);
    return () => clearInterval(t);
  }, [started]);

  const spots = phoneSpots({ offHook: c.offHook, pressed: c.pressed });
  const talk = c.phase === 'connected' ? Math.floor((Date.now() - c.talkFrom) / 1000) : 0;
  const mmss = `${Math.floor(talk / 60)}:${String(talk % 60).padStart(2, '0')}`;
  const [state, shown] =
    c.phase === 'ringing'
      ? ['Вызов…', c.number]
      : c.phase === 'connected'
        ? [`Соединено ${mmss}`, c.menu && c.keys ? `Ввод: ${c.keys}` : c.number]
        : c.phase === 'dead'
          ? ['Нет соединения', c.number]
          : c.phase === 'dialtone'
            ? ['Гудок', c.dialed || '—']
            : [c.offHook ? 'Набор' : 'Наберите номер', c.dialed || '—'];
  const tab = active ? 0 : -1;
  const cls = (base: string) => `dp-spot ${base}${active ? ' dp-active' : ''}`;

  return (
    <>
      <div
        className={cls('dp-lcd')}
        data-testid="dp-lcd"
        aria-live="polite"
        style={place(room, spots.lcd, LOGICAL.lcd)}
      >
        <div className="dp-lcd-top">
          <span>{hhmm(now)}</span>
          <span>{ddmmyyyy(now)}</span>
          <span className={`dp-line${c.offHook ? ' dp-line-on' : ''}`}>Линия 1</span>
        </div>
        <div className="dp-lcd-state">{state}</div>
        <div className="dp-lcd-number" data-testid="dp-number">
          {shown}
        </div>
        {/* Подписи клавиш под экранчиком — на экране, как у офисных телефонов. */}
        <div className="dp-lcd-soft" aria-hidden>
          <span>Стереть</span>
          <span>Повтор</span>
        </div>
      </div>
      <button
        type="button"
        className={cls('dp-soft')}
        data-testid="dp-erase"
        tabIndex={tab}
        aria-label="Стереть"
        style={place(room, spots.soft.erase, LOGICAL.soft)}
        onClick={() => c.erase()}
      />
      <button
        type="button"
        className={cls('dp-soft')}
        data-testid="dp-redial"
        tabIndex={tab}
        aria-label="Повтор"
        style={place(room, spots.soft.redial, LOGICAL.soft)}
        onClick={() => c.redial()}
      />
      {KEYS.map((d) => (
        <button
          key={d}
          type="button"
          className={cls('dp-key')}
          data-testid={`dp-key-${keyId(d)}`}
          tabIndex={tab}
          aria-label={d}
          style={place(room, spots.keys[d], LOGICAL.key)}
          onClick={() => c.press(d)}
        >
          <span className="dp-digit">{d}</span>
          <span className="dp-letters">{LETTERS[d] ?? ''}</span>
        </button>
      ))}
      <button
        type="button"
        className={cls('dp-hs')}
        data-testid="dp-handset"
        tabIndex={tab}
        aria-label={c.offHook ? 'Положить трубку' : 'Снять трубку'}
        aria-pressed={c.offHook}
        style={place(room, spots.handset, LOGICAL.handset, spots.handsetYaw)}
        onClick={() => c.handset()}
      />
    </>
  );
}
