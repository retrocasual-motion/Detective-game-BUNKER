import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { postAction } from '../api.ts';
import { formatWait, OFFLINE, useFieldWait } from '../lock.ts';
import { useGame } from '../store.ts';

/** Поле ввода телефона у движка (ПАРОЛЬ | телефон | 4 цифры). */
const FIELD = 'телефон';
const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

/**
 * Ввод кода (канон 48): «Enter passcode», четыре точки, цифровая клавиатура 3 × 4, внизу слева —
 * «Emergency» (EM-A: есть, но не работает — звонить с изъятого нельзя, P-7). Четвёртая цифра —
 * проверка; неверно — точки дрожат и гаснут, ничего не стирается (P-4); пять неверных — 2 минуты
 * (LK-A). Цифры можно набрать и с клавиатуры.
 */
export function Passcode({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'wrong' | 'check' | 'offline'>('idle');
  const wait = useFieldWait(FIELD);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const submit = async (c: string) => {
    setState('check');
    const r = await postAction('ПАРОЛЬ', FIELD, c).catch(() => null);
    // Сервер не ответил — код не проверен: не «неверно» (R2-01).
    if (!r) {
      setState('offline');
      timer.current = setTimeout(() => {
        setCode('');
        setState('idle');
      }, 2500);
      return;
    }
    const g = useGame.getState();
    if (r.released.length) g.addFound(r.released, '48', []);
    if (!r.quiet && useGame.getState().materials.some((m) => m.id === 'L540')) {
      onUnlock();
      return;
    }
    if (r.wait) g.blockField(FIELD, r.wait);
    setState('wrong');
    timer.current = setTimeout(() => {
      setCode('');
      setState('idle');
    }, 600);
  };
  const press = (d: string) => {
    if (wait > 0 || state !== 'idle' || code.length >= 4) return;
    const c = code + d;
    setCode(c);
    if (c.length === 4) void submit(c);
  };
  const back = () => {
    if (state === 'idle') setCode((c) => c.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="ph-pass" data-testid="phone-passcode">
      <div className="ph-pass-title" data-testid="phone-pass-msg" role="status">
        {wait > 0
          ? `Try again in ${formatWait(wait)}`
          : state === 'offline'
            ? OFFLINE
            : state === 'wrong'
              ? 'Wrong passcode'
              : 'Enter passcode'}
      </div>
      <div className={`ph-dots${state === 'wrong' ? ' ph-dots-wrong' : ''}`} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < code.length ? 'ph-dot-on' : undefined} />
        ))}
      </div>
      <div className="ph-keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            className="ph-key"
            data-testid={`phone-key-${d}`}
            onClick={() => press(d)}
          >
            {d}
          </button>
        ))}
        <button type="button" className="ph-key ph-key-text" aria-disabled="true" tabIndex={-1}>
          Emergency
        </button>
        <button
          type="button"
          className="ph-key"
          data-testid="phone-key-0"
          onClick={() => press('0')}
        >
          0
        </button>
        <button type="button" className="ph-key ph-key-text" onClick={back}>
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * «Slide to unlock» (PN-A, правка автора 11.11): код уже введён — ползунок вправо, и телефон
 * открыт. Отпустили раньше края — ползунок возвращается. Enter — то же.
 */
export function Slider({ onUnlock }: { onUnlock: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const drag = useRef<{ start: number; max: number } | null>(null);
  /** Насколько тянули ползунок: щелчок без протяжки — тоже открыть (RV-32, тачпад). */
  const moved = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !typing(e.target)) onUnlock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUnlock]);
  const scale = () => {
    const t = track.current;
    return t ? t.getBoundingClientRect().width / t.offsetWidth : 1;
  };
  return (
    <div className="ph-slide" ref={track} data-testid="phone-slide">
      <span className="ph-slide-text" style={{ opacity: 1 - x / 120 }}>
        slide to unlock
      </span>
      <button
        type="button"
        className="ph-slide-knob"
        data-testid="phone-slide-knob"
        aria-label="slide to unlock"
        style={{ translate: `${x}px 0`, transition: drag.current ? 'none' : undefined }}
        onClick={(e) => {
          // С клавиатуры (Enter, пробел) или щелчком без протяжки — открыть (RV-32).
          if (e.detail === 0 || moved.current < 4) onUnlock();
        }}
        onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
          const t = track.current;
          if (!t) return;
          drag.current = {
            start: e.clientX,
            max: t.offsetWidth - e.currentTarget.offsetWidth - 8,
          };
          moved.current = 0;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          moved.current = Math.max(moved.current, Math.abs(e.clientX - d.start));
          setX(Math.min(d.max, Math.max(0, (e.clientX - d.start) / scale())));
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && x >= d.max - 6) onUnlock();
          else setX(0);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setX(0);
        }}
      >
        ➜
      </button>
    </div>
  );
}
