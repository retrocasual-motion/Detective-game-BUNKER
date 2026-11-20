import { useEffect, useState } from 'react';
import { ddmmyyyy, gameNow, hhmm } from '../clock.ts';
import { useGame } from '../store.ts';
import { useCall } from './call.ts';
import './deskphone.css';

/**
 * Верх телефона следователя (6a-3, DP-A): экранчик, «Стереть» и «Повтор» под ним, 12 кнопок с
 * буквами, трубка на рычаге со шнуром. Лежит плоскостью на корпусе в 3D-сцене комнаты
 * (`RoomScene`): со стола виден маленьким; камера подлетела — крупно, кнопки нажимаются.
 * Логический размер — FACE_W × FACE_H px на корпус 26 × 16 см.
 */
export const FACE_W = 760;
export const FACE_H = 468;

const KEYS: [string, string][] = [
  ['1', ''],
  ['2', 'ABC'],
  ['3', 'DEF'],
  ['4', 'GHI'],
  ['5', 'JKL'],
  ['6', 'MNO'],
  ['7', 'PQRS'],
  ['8', 'TUV'],
  ['9', 'WXYZ'],
  ['*', ''],
  ['0', '+'],
  ['#', ''],
];
const keyId = (k: string) => (k === '*' ? 'star' : k === '#' ? 'hash' : k);

export function PhoneFace({ active }: { active: boolean }) {
  const started = useGame((g) => g.state?.started);
  const [now, setNow] = useState(() => gameNow(started));
  const c = useCall();
  useEffect(() => {
    const t = setInterval(() => setNow(gameNow(started)), 1000);
    return () => clearInterval(t);
  }, [started]);

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
  // Со стола телефон — просто вещь: щелчок по нему ведёт камеру (зона на столе), кнопки молчат.
  const tab = active ? 0 : -1;

  return (
    <div
      className={`dp-phone${c.offHook ? ' dp-off' : ''}${active ? ' dp-active' : ''}`}
      data-testid="dp-face"
      inert={!active}
      style={{ width: FACE_W, height: FACE_H }}
    >
      <div className="dp-cradle" />
      <button
        type="button"
        className="dp-handset"
        data-testid="dp-handset"
        tabIndex={tab}
        aria-label={c.offHook ? 'Положить трубку' : 'Снять трубку'}
        aria-pressed={c.offHook}
        onClick={() => c.handset()}
      >
        <span className="dp-ear" />
        <span className="dp-grip" />
        <span className="dp-mouth" />
      </button>
      <svg className="dp-cord" viewBox="0 0 60 200" aria-hidden>
        <path d="M30 0 C 0 10, 60 20, 30 30 S 0 50, 30 60 S 60 80, 30 90 S 0 110, 30 120 S 60 140, 30 150 S 0 170, 30 200" />
      </svg>

      <div className="dp-panel">
        <div className="dp-lcd" data-testid="dp-lcd" aria-live="polite">
          <div className="dp-lcd-top">
            <span>{hhmm(now)}</span>
            <span>{ddmmyyyy(now)}</span>
            <span className={`dp-line${c.offHook ? ' dp-line-on' : ''}`}>Линия 1</span>
          </div>
          <div className="dp-lcd-state">{state}</div>
          <div className="dp-lcd-number" data-testid="dp-number">
            {shown}
          </div>
          <div className="dp-lcd-soft" aria-hidden>
            <span>Стереть</span>
            <span>Повтор</span>
          </div>
        </div>
        {/* Клавиши под экранчиком — их подписи на экране, как у офисных телефонов. */}
        <div className="dp-softkeys">
          <button
            type="button"
            data-testid="dp-erase"
            tabIndex={tab}
            aria-label="Стереть"
            onClick={() => c.erase()}
          />
          <button
            type="button"
            data-testid="dp-redial"
            tabIndex={tab}
            aria-label="Повтор"
            onClick={() => c.redial()}
          />
        </div>
        <div className="dp-keypad">
          {KEYS.map(([d, letters]) => (
            <button
              key={d}
              type="button"
              className="dp-key"
              data-testid={`dp-key-${keyId(d)}`}
              tabIndex={tab}
              aria-label={d}
              onClick={() => c.press(d)}
            >
              <span className="dp-digit">{d}</span>
              <span className="dp-letters">{letters}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
