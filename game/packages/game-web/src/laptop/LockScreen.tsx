import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { postAction } from '../api.ts';
import { useGame } from '../store.ts';

/**
 * Экран входа ноутбука (канон 47; 4c-1, PL-A): аватар, a.cole, сетка 3×3 — ключ рисуют мышью
 * через точки (как в жизни: прошли над точкой между двумя — она тоже в ключе), «Подсказка» —
 * «наш первый знак». Неверно — линия краснеет, ничего не стирается (P-4); пять неверных — поле
 * молчит 2 минуты, отсчёт на экране (LK-A). С клавиатуры — цифры 1–9 и Enter.
 */

const FIELD = 'ноутбук';
const STEP = 96;
const PAD = 40;
const SIZE = PAD * 2 + STEP * 2;
const HIT = 30;

const at = (n: number) => ({
  x: PAD + ((n - 1) % 3) * STEP,
  y: PAD + Math.floor((n - 1) / 3) * STEP,
});

/** Точка между двумя (по прямой через одну) — она тоже в ключе, если ещё не была. */
function between(a: number, b: number): number | null {
  const ra = Math.floor((a - 1) / 3);
  const ca = (a - 1) % 3;
  const rb = Math.floor((b - 1) / 3);
  const cb = (b - 1) % 3;
  if ((ra + rb) % 2 || (ca + cb) % 2) return null;
  const mid = ((ra + rb) / 2) * 3 + (ca + cb) / 2 + 1;
  return mid === a || mid === b ? null : mid;
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [path, setPath] = useState<number[]>([]);
  const [pen, setPen] = useState<{ x: number; y: number } | null>(null);
  const [state, setState] = useState<'idle' | 'wrong' | 'short' | 'check'>('idle');
  const [hint, setHint] = useState(false);
  const [avatarBig, setAvatarBig] = useState(false);
  const blockedUntil = useGame((g) => g.fieldBlockedUntil[FIELD] ?? 0);
  const [now, setNow] = useState(Date.now());
  const svg = useRef<SVGSVGElement>(null);
  const wait = Math.max(0, blockedUntil - now);

  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [blockedUntil]);

  // Отложенная очистка после попытки. Начали рисовать раньше — она отменяется (правка автора
  // 10.11: очистка срабатывала посреди нового ключа — линия «пропадала»).
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = (ms: number) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      resetTimer.current = null;
      setPath([]);
      setState('idle');
    }, ms);
  };
  const cancelReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
  };
  // Ушли с экрана — отложенная очистка не нужна.
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const submit = async (p: number[]) => {
    if (wait > 0) return;
    // Случайный щелчок по точке — не попытка; две-три точки — «не меньше четырёх».
    if (p.length < 2) {
      setPath([]);
      return;
    }
    if (p.length < 4) {
      setState('short');
      reset(1100);
      return;
    }
    setState('check');
    const r = await postAction('ПАРОЛЬ', FIELD, p.join('-')).catch(() => null);
    const g = useGame.getState();
    if (r?.released.length) g.addFound(r.released, '47', []);
    // Верный ключ: ответ не «тихий» (успех или повтор), рабочий стол в деле.
    if (r && !r.quiet && useGame.getState().materials.some((m) => m.id === 'L560')) {
      onUnlock();
      return;
    }
    if (r?.wait) g.blockField(FIELD, r.wait);
    setNow(Date.now());
    setState('wrong');
    reset(900);
  };

  const point = (e: PointerEvent) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE,
    };
  };
  const dotAt = (p: { x: number; y: number }) => {
    for (let n = 1; n <= 9; n++) {
      const d = at(n);
      if (Math.hypot(d.x - p.x, d.y - p.y) < HIT) return n;
    }
    return null;
  };
  const add = (list: number[], n: number) => {
    if (list.includes(n)) return list;
    const last = list[list.length - 1];
    const mid = last ? between(last, n) : null;
    return [...list, ...(mid && !list.includes(mid) ? [mid] : []), n];
  };

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (wait > 0 || state === 'check' || e.button !== 0) return;
    const p = point(e);
    if (!p) return;
    // Рисовать можно начать и рядом с точкой: точки цепляются, когда линия проходит по ним.
    const n = dotAt(p);
    cancelReset();
    e.currentTarget.setPointerCapture(e.pointerId);
    setState('idle');
    setPath(n ? [n] : []);
    setPen(p);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!pen) return;
    const p = point(e);
    if (!p) return;
    setPen(p);
    const n = dotAt(p);
    if (n) setPath((list) => add(list, n));
  };
  const up = () => {
    if (!pen) return;
    setPen(null);
    void submit(path);
  };

  // Клавиатура: цифры 1–9 — точки, Enter — войти, Backspace — назад.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (wait > 0 || state === 'check') return;
      if (/^[1-9]$/.test(e.key)) setPath((list) => add(list, Number(e.key)));
      else if (e.key === 'Backspace') setPath((list) => list.slice(0, -1));
      else if (e.key === 'Enter') void submit(path);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const line = path.map((n) => at(n));
  const color = state === 'wrong' ? '#e0574f' : '#9fc4ff';
  const mmss = `${Math.floor(wait / 60000)}:${String(Math.ceil((wait % 60000) / 1000) % 60).padStart(2, '0')}`;

  return (
    <div className="lap-lock" data-testid="laptop-lock">
      <button
        type="button"
        className={`lap-avatar${avatarBig ? ' lap-avatar-big' : ''}`}
        data-testid="laptop-avatar"
        aria-label="Картинка учётной записи"
        title="Картинка учётной записи"
        onWheel={(e) => {
          if (e.deltaY < 0) zoomAvatar();
          else setAvatarBig(false);
        }}
        onDoubleClick={() => (avatarBig ? setAvatarBig(false) : zoomAvatar())}
      >
        {/* Фрагмент знака: две линии под прямым углом — горизонтальная влево, вертикальная вниз (L947). */}
        <svg viewBox="0 0 100 100" aria-hidden>
          <path d="M-10 38 H62 V112" fill="none" stroke="#d9e2ee" strokeWidth="9" />
        </svg>
      </button>
      <div className="lap-user">a.cole</div>
      <svg
        ref={svg}
        className={`lap-pattern${state === 'wrong' ? ' lap-pattern-wrong' : ''}`}
        data-testid="laptop-pattern"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <title>Сетка графического ключа</title>
        {line.length > 0 && (
          <polyline
            points={[...line, ...(pen ? [pen] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
        )}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const d = at(n);
          const on = path.includes(n);
          return (
            <g key={n} data-testid={`laptop-dot-${n}`}>
              <circle cx={d.x} cy={d.y} r={HIT} fill="transparent" />
              <circle cx={d.x} cy={d.y} r={on ? 11 : 7} fill={on ? color : '#c9d3df'} />
            </g>
          );
        })}
      </svg>
      <div className="lap-lock-msg" data-testid="laptop-lock-msg" role="status">
        {wait > 0
          ? `Слишком много попыток. Повторите через ${mmss}`
          : state === 'wrong'
            ? 'Неверный ключ'
            : state === 'short'
              ? 'Соедините не меньше четырёх точек'
              : 'Нарисуйте ключ'}
      </div>
      <button
        type="button"
        className="lap-hint"
        data-testid="laptop-hint"
        onClick={() => setHint((h) => !h)}
      >
        Подсказка
      </button>
      {hint && (
        <div className="lap-hint-text" data-testid="laptop-hint-text">
          наш первый знак
        </div>
      )}
      <div className="lap-lock-foot">VAULTLINE · рабочее место руководителя программы</div>
    </div>
  );

  function zoomAvatar() {
    setAvatarBig(true);
    // Крупный план картинки (L947): в деле; висит — на самом ноутбуке (LW-A).
    void postAction('ОСМОТР', '47 картинка учётной записи', 'увеличить')
      .then((r) => {
        if (r.released.length) useGame.getState().addFound(r.released, '47', []);
      })
      .catch(() => undefined);
  }
}

/**
 * Экран приветствия (правка автора 10.11): ключ уже введён — при следующем открытии ноутбука
 * картинка профиля, a.cole и «Войти», как в системах тех лет. Enter — то же.
 */
export function Welcome({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onEnter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnter]);
  return (
    <div className="lap-lock lap-welcome" data-testid="laptop-welcome">
      <div className="lap-welcome-card">
        <span className="lap-avatar lap-avatar-big" aria-hidden>
          <svg viewBox="0 0 100 100" aria-hidden>
            <path d="M-10 38 H62 V112" fill="none" stroke="#d9e2ee" strokeWidth="9" />
          </svg>
        </span>
        <div className="lap-user">a.cole</div>
        <button type="button" className="lap-enter" data-testid="laptop-enter" onClick={onEnter}>
          Войти
        </button>
      </div>
      <div className="lap-lock-foot">VAULTLINE · рабочее место руководителя программы</div>
    </div>
  );
}
