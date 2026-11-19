import { useEffect, useRef, useState } from 'react';
import { phoneCall } from '../api.ts';
import { ddmmyyyy, gameNow, hhmm } from '../clock.ts';
import { useFreeArea } from '../device/deviceView.tsx';
import { reducedMotion } from '../motion.ts';
import { useGame } from '../store.ts';
import { dtmf, startTone, type ToneKind } from './tones.ts';
import './deskphone.css';

/**
 * Телефон следователя на столе (6a-3, PH-B; автор 19.11: «нажал на телефон — камера к нему
 * придвинулась, нажимаешь цифры, снимаешь трубку»). Офисный телефон конца 2000-х (как IP-телефоны
 * того времени): номер можно набрать, не снимая трубку, — он виден на экранчике, — и снять трубку
 * (или «Громкая связь», «Вызов»); можно снять трубку сначала — гудок — и набирать. Вызов, затем
 * то, что слышно на линии (пока текстом: записей голосов нет — «восприятие не проверено», решение
 * 29.10). В меню линии цифры набираются кнопками. Положить трубку — отбой. Линии — сервер
 * (`/api/phone`, правила ЗВОНОК пакета).
 */

type Phase = 'idle' | 'dialtone' | 'ringing' | 'connected' | 'dead';

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

/** Длина набора на экранчике. */
const MAX = 16;
/** Номер не короче — иначе «Вызов» не идёт. */
const MIN = 7;
/** Логический размер телефона, px (масштабируется в свободное место). */
const W = 760;
const H = 470;

/** Последний набранный номер — для «Повтор» (как на настоящем телефоне, до перезагрузки). */
let lastNumber = '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DeskPhone() {
  const from = useGame((g) => g.deskPhone);
  if (!from) return null;
  return <PhoneOpen from={from} />;
}

function PhoneOpen({
  from,
}: {
  from: { left: number; top: number; width: number; height: number };
}) {
  const area = useFreeArea();
  const fast = reducedMotion();
  // Время: вызов — полтора гудка; пауза после последней цифры — набор пошёл сам.
  const RING_MS = fast ? 250 : 3200;
  const AUTO_DIAL_MS = fast ? 500 : 3000;
  const KEYS_SEND_MS = fast ? 500 : 2500;

  const started = useGame((g) => g.state?.started);
  const [now, setNow] = useState(() => gameNow(started));
  const [offHook, setOffHook] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [dialed, setDialed] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [keys, setKeys] = useState('');
  const [menu, setMenu] = useState(false);
  const [heard, setHeard] = useState<string[]>([]);
  const [talkFrom, setTalkFrom] = useState(0);
  const [entered, setEntered] = useState(fast);

  const number = useRef('');
  const call = useRef(0);
  const tone = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTone = (k: ToneKind | null) => {
    tone.current?.();
    tone.current = k ? startTone(k) : null;
  };
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    const t = setInterval(() => setNow(gameNow(started)), 1000);
    return () => clearInterval(t);
  }, [started]);
  // Камера «подъезжает» к телефону: из прямоугольника на столе — в середину.
  useEffect(() => {
    const f = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(f);
  }, []);
  // Ушли от телефона — тишина.
  useEffect(
    () => () => {
      tone.current?.();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const hangUp = () => {
    call.current++;
    clearTimer();
    setTone(null);
    setPhase('idle');
    setOffHook(false);
    setSpeaker(false);
    setDialed('');
    setKeys('');
    setMenu(false);
  };

  const place = async (n: string) => {
    if (n.length < MIN) return;
    lastNumber = n;
    number.current = n;
    const my = ++call.current;
    clearTimer();
    setPhase('ringing');
    setHeard([]);
    setKeys('');
    setMenu(false);
    setTone('ring');
    const [r] = await Promise.all([phoneCall(n).catch(() => null), sleep(RING_MS)]);
    if (my !== call.current) return;
    if (!r) {
      setTone(null);
      setPhase('dead');
      setHeard(['Нет связи с сервером игры — попробуйте ещё раз.']);
      return;
    }
    if (!r.connected) {
      setPhase('dead');
      setHeard([r.text]);
      setTone('busy');
      timer.current = setTimeout(() => setTone(null), fast ? 300 : 3000);
      return;
    }
    setTone(null);
    setPhase('connected');
    setMenu(r.menu);
    setHeard([r.text]);
    setTalkFrom(Date.now());
  };

  const sendKeys = async (k: string) => {
    if (!k) return;
    const my = call.current;
    const r = await phoneCall(number.current, k).catch(() => null);
    if (my !== call.current || !r) return;
    setHeard((h) => [...h, `Набрано: ${k}`, r.text]);
    setMenu(r.menu);
  };

  const press = (k: string) => {
    dtmf(k);
    if (phase === 'connected') {
      if (!menu) return;
      clearTimer();
      if (k === '#') {
        setKeys('');
        void sendKeys(keys);
        return;
      }
      const nk = (keys + k).slice(0, 8);
      setKeys(nk);
      // Номер партии и заказа в деле — четыре цифры; можно и «#», и подождать.
      if (nk.replace(/\D/g, '').length >= 4) {
        setKeys('');
        void sendKeys(nk);
      } else
        timer.current = setTimeout(() => {
          setKeys('');
          void sendKeys(nk);
        }, KEYS_SEND_MS);
      return;
    }
    if (phase === 'ringing' || phase === 'dead') return;
    const nd = (dialed + k).slice(0, MAX);
    setDialed(nd);
    if (offHook) {
      // Трубка снята: гудок стих с первой цифрой; пауза — номер пошёл.
      if (phase === 'dialtone') {
        setTone(null);
        setPhase('idle');
      }
      clearTimer();
      if (nd.replace(/\D/g, '').length >= MIN)
        timer.current = setTimeout(() => void place(nd), AUTO_DIAL_MS);
    }
  };

  /** Снять или положить трубку. */
  const handset = () => {
    if (offHook) {
      hangUp();
      return;
    }
    setOffHook(true);
    if (dialed.replace(/\D/g, '').length >= MIN) void place(dialed);
    else {
      setPhase('dialtone');
      setTone('dial');
    }
  };
  /** Громкая связь — то же, что снять трубку, только трубка лежит. */
  const speakerKey = () => {
    if (offHook) {
      hangUp();
      return;
    }
    setSpeaker(true);
    handset();
  };
  /** «Вызов» под экранчиком: набранный номер — на громкую связь. */
  const dialKey = () => {
    if (phase === 'ringing' || phase === 'connected') return;
    if (dialed.replace(/\D/g, '').length < MIN) return;
    if (!offHook) {
      setOffHook(true);
      setSpeaker(true);
    }
    void place(dialed);
  };
  const redial = () => {
    if (!lastNumber || phase === 'ringing' || phase === 'connected') return;
    setDialed(lastNumber);
    if (!offHook) {
      setOffHook(true);
      setSpeaker(true);
    }
    void place(lastNumber);
  };
  const erase = () => {
    if (phase !== 'idle' && phase !== 'dialtone') return;
    clearTimer();
    setDialed((d) => d.slice(0, -1));
  };
  const close = () => {
    hangUp();
    useGame.getState().setDeskPhone(null);
  };

  // Клавиатура дублирует кнопки: цифры, *, #; Backspace — стереть; Enter — трубка; Esc — отойти.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => undefined);
  onKey.current = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (/^[0-9*#]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') erase();
    else if (e.key === 'Enter') handset();
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const k = Math.min((area.width - 80) / W, (area.height - 260) / H, 1.25);
  const cx = area.center || window.innerWidth / 2;
  const cy = area.height * 0.42;
  // Откуда «подъезжает»: прямоугольник телефона на столе.
  const fromScale = Math.max(0.05, from.width / W);
  const fromX = from.left + from.width / 2 - cx;
  const fromY = from.top + from.height / 2 - cy;

  const talk = phase === 'connected' ? Math.floor((Date.now() - talkFrom) / 1000) : 0;
  const mmss = `${Math.floor(talk / 60)}:${String(talk % 60).padStart(2, '0')}`;
  const screen =
    phase === 'ringing'
      ? ['Вызов…', number.current]
      : phase === 'connected'
        ? [`Соединено ${mmss}`, menu && keys ? `Ввод: ${keys}` : number.current]
        : phase === 'dead'
          ? ['Нет соединения', number.current]
          : phase === 'dialtone'
            ? ['Гудок', dialed || '—']
            : [offHook ? 'Набор' : 'Наберите номер', dialed || '—'];

  return (
    <section className="deskphone-view" data-testid="deskphone" aria-label="Телефон следователя">
      <button
        type="button"
        className="laptop-backdrop"
        aria-label="Отойти от телефона"
        data-testid="deskphone-close"
        onClick={close}
      />
      <div
        className={`dp-stage${entered ? ' dp-in' : ''}`}
        style={{
          left: cx,
          top: cy,
          width: W,
          height: H,
          transform: entered
            ? `translate(-50%, -50%) scale(${k})`
            : `translate(calc(-50% + ${fromX}px), calc(-50% + ${fromY}px)) scale(${fromScale})`,
        }}
      >
        <div className={`dp-phone${offHook && !speaker ? ' dp-off' : ''}`}>
          {/* Рычаг и трубка: щелчок по трубке — снять / положить. */}
          <div className="dp-cradle" />
          <button
            type="button"
            className="dp-handset"
            data-testid="dp-handset"
            aria-label={offHook ? 'Положить трубку' : 'Снять трубку'}
            aria-pressed={offHook && !speaker}
            onClick={handset}
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
                <span className={`dp-line${offHook ? ' dp-line-on' : ''}`}>Линия 1</span>
              </div>
              <div className="dp-lcd-state">{screen[0]}</div>
              <div className="dp-lcd-number" data-testid="dp-number">
                {screen[1]}
              </div>
              <div className="dp-lcd-soft" aria-hidden>
                <span>Стереть</span>
                <span>Вызов</span>
                <span>Повтор</span>
              </div>
            </div>
            <div className="dp-softkeys">
              <button type="button" data-testid="dp-erase" aria-label="Стереть" onClick={erase} />
              <button type="button" data-testid="dp-call" aria-label="Вызов" onClick={dialKey} />
              <button type="button" data-testid="dp-redial" aria-label="Повтор" onClick={redial} />
            </div>
            <div className="dp-keypad">
              {KEYS.map(([d, letters]) => (
                <button
                  key={d}
                  type="button"
                  className="dp-key"
                  data-testid={`dp-key-${keyId(d)}`}
                  aria-label={d}
                  onClick={() => press(d)}
                >
                  <span className="dp-digit">{d}</span>
                  <span className="dp-letters">{letters}</span>
                </button>
              ))}
            </div>
            <div className="dp-func">
              <button
                type="button"
                className={`dp-fkey${speaker ? ' dp-fkey-on' : ''}`}
                data-testid="dp-speaker"
                onClick={speakerKey}
              >
                <span className="dp-led" />
                Громкая связь
              </button>
              <button type="button" className="dp-fkey" onClick={redial} tabIndex={-1}>
                <span className="dp-led dp-led-off" />
                Повтор
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="dp-heard"
        data-testid="dp-heard"
        style={{ left: cx, top: cy + (H * k) / 2 + 18 }}
      >
        {heard.length ? (
          <>
            <div className="dp-heard-title">{offHook ? 'В трубке' : 'Было слышно'}</div>
            {heard.map((t, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: реплики линии по порядку
              <p key={i} className={t.startsWith('Набрано:') ? 'dp-heard-keys' : undefined}>
                {t}
              </p>
            ))}
            <div className="dp-heard-note">
              Записей голосов пока нет — слышно текстом (восприятие не проверено).
            </div>
          </>
        ) : (
          <div className="dp-hint">
            Наберите номер на кнопках и снимите трубку — или снимите трубку и наберите.
          </div>
        )}
      </div>
    </section>
  );
}
