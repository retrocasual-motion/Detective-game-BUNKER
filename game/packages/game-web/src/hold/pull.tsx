import { type ThreeEvent, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import { reducedMotion } from '../motion.ts';
import { SETTLED, useAnimate } from './animate.ts';
import { holdPart, setPartCursor, useSpot } from './Held3D.tsx';

/**
 * Вскрыть, потянув (OG-B, автор 23.11): клапан конверта, крышку коробки игрок тянет сам. Навёл —
 * клапан чуть приподнялся (видно, что за него берутся); зажал и тянет вверх — клапан идёт за мышью;
 * отпустил дальше середины — вскрыто, раньше — клапан лёг обратно. Щелчок без протяжки — тоже
 * вскрыть (тачпад, запасной путь). Пока клапан держат, вещь не вращается (`holdPart`); протяжка
 * мимо клапана, как прежде, крутит вещь.
 *
 * `apply(t)` ставит часть по доле открытия 0…1; `onOpen` — когда открыто до конца.
 */

/** Наведение: насколько клапан приподнимается. */
const HOVER_T = 0.07;
/** Сколько тянуть до полного открытия, px. */
const PULL_PX = 170;
/** Порог «щелчок, а не протяжка», px (как у вещи в руках). */
const CLICK_PX = 5;

export interface Pull {
  anchor: React.RefObject<Group | null>;
  hover: boolean;
  /** Обработчики на каждую сетку, за которую тянут (клапан, половинка печати, пломба). */
  handlers: {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  };
}

export function usePull({
  id,
  label,
  testId,
  onOpen,
  apply,
}: {
  id: string;
  label: string;
  testId: string;
  onOpen: () => void;
  apply: (t: number) => void;
}): Pull {
  const invalidate = useThree((s) => s.invalidate);
  const anchor = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  const st = useRef({ now: 0, to: 0, dragging: false, opening: false, done: false });
  const open = useRef(onOpen);
  open.current = onOpen;
  const put = useRef(apply);
  put.current = apply;

  const fire = () => {
    if (st.current.done) return;
    st.current.done = true;
    setPartCursor('');
    open.current();
  };
  const finish = () => {
    const s = st.current;
    if (s.opening) return;
    s.opening = true;
    s.dragging = false;
    // «Уменьшить движение» — сразу открыто (UX-16).
    if (reducedMotion()) {
      s.now = 1;
      put.current(1);
      fire();
      return;
    }
    invalidate();
  };

  // Клавиатура и тесты: невидимая кнопка у печати, мышь не ловит — мышь берётся за саму часть.
  useSpot(anchor, { id, label, testId, onClick: finish, onHover: setHover, passive: true });
  useEffect(() => () => setPartCursor(''), []);

  useAnimate((dt) => {
    const s = st.current;
    const target = s.opening ? 1 : s.dragging ? s.to : hover ? HOVER_T : 0;
    // За мышью — почти сразу, сам — плавно.
    const k = 1 - Math.exp(-dt * (s.dragging ? 30 : s.opening ? 9 : 14));
    s.now += (target - s.now) * k;
    if (s.opening && s.now > 0.985) {
      s.now = 1;
      put.current(1);
      fire();
      return false;
    }
    put.current(s.now);
    return Math.abs(target - s.now) > SETTLED;
  });

  // Своя ли это сетка — ближняя к мыши (конверт повернули оборотом — клапан за ним не берётся).
  const mine = (e: ThreeEvent<PointerEvent>) => e.intersections[0]?.object === e.object;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    if (e.button !== 0 || s.opening || !mine(e)) return;
    e.stopPropagation();
    holdPart();
    setPartCursor('grabbing');
    const x0 = e.clientX;
    const y0 = e.clientY;
    // Клапан идёт за мышью от того места, где он сейчас (с подъёмом от наведения), а «вскрыть или
    // нет» решает только протяжка: подъём наведения доезжает за несколько кадров — на медленной
    // машине его доля другая, порог не должен от неё зависеть.
    const base = s.now;
    let pulled = 0;
    let moved = 0;
    s.dragging = true;
    s.to = base;
    const move = (ev: PointerEvent) => {
      // Кнопку отпустили вне окна (Alt+Tab) — как «отпустили» (R3-08).
      if (ev.buttons === 0) return up();
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      moved = Math.max(moved, Math.hypot(dx, dy));
      // Тянут вверх; вбок — тоже немного открывает (рука идёт не по линейке).
      pulled = (-dy + Math.abs(dx) * 0.3) / PULL_PX;
      s.to = Math.min(1, Math.max(0, base + pulled));
      invalidate();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      s.dragging = false;
      setPartCursor(hover ? 'grab' : '');
      invalidate();
    };
    const up = () => {
      end();
      if (moved < CLICK_PX || pulled >= 0.5) finish();
    };
    // Ушли из окна посреди протяжки — клапан лёг обратно.
    const cancel = () => end();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
  };

  return {
    anchor,
    hover,
    handlers: {
      onPointerDown,
      onPointerOver: (e) => {
        if (!mine(e)) return;
        e.stopPropagation();
        setHover(true);
        if (!st.current.dragging) setPartCursor('grab');
      },
      onPointerOut: () => {
        setHover(false);
        if (!st.current.dragging) setPartCursor('');
      },
    },
  };
}
