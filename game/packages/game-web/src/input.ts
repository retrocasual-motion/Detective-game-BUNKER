/**
 * Управление: мышь или тачпад (TP-C, решение автора 17.11) — своя настройка игры, как
 * «уменьшить движение». У мыши колесо приближает, зажатое колесо сдвигает. У тачпада колеса
 * нет: щипок приближает, два пальца сдвигают. Угадывать по прокрутке ненадёжно (TP-B
 * отвергнут), поэтому — переключатель в «Настройках»; по умолчанию на Mac — тачпад.
 *
 * Флаг — `data-input` на `<html>` (по нему же подсказки), хранится в `localStorage`.
 */
import { useSyncExternalStore } from 'react';

export type InputMode = 'mouse' | 'trackpad';

const KEY = 'bunker.input';

const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** Прочитать настройку при запуске; щипок не увеличивает страницу браузера. */
export function initInput(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Хранилище недоступно — по системе.
  }
  const mode: InputMode =
    saved === 'mouse' || saved === 'trackpad' ? saved : isMac() ? 'trackpad' : 'mouse';
  document.documentElement.dataset.input = mode;
  // Щипок тачпада (и Ctrl + колесо) браузер понимает как «увеличить страницу» — в игре это
  // приближение под курсором. Слушатель не пассивный, иначе отменить нельзя.
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  // Safari: щипок — свои события жестов; страница не увеличивается.
  for (const t of ['gesturestart', 'gesturechange'])
    window.addEventListener(t, (e) => e.preventDefault(), { passive: false });
}

export function inputMode(): InputMode {
  return typeof document !== 'undefined' && document.documentElement.dataset.input === 'trackpad'
    ? 'trackpad'
    : 'mouse';
}

/** Переключатель в «Настройках» главного меню: сохраняется между заходами. */
export function setInputMode(mode: InputMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Хранилище недоступно — до перезагрузки.
  }
  document.documentElement.dataset.input = mode;
  for (const f of listeners) f();
}

const listeners = new Set<() => void>();
/** Подсказки на экране — по настройке (перерисовка при переключении). */
export const useInputMode = (): InputMode =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    inputMode,
    () => 'mouse',
  );

/** Прокрутка в пикселях (Firefox считает строками). */
interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}
const LINE_PX = 33;
/** Щипок даёт маленькие шаги — усиливаем, чтобы приближение шло за пальцами. */
const PINCH_GAIN = 5;

/**
 * Что значит прокрутка. Мышь: колесо — приблизить (`zoom` > 0 — отдалить). Тачпад: щипок —
 * приблизить, два пальца — сдвинуть (`pan` — на сколько пикселей сдвинулись пальцы).
 */
export function wheelIntent(
  e: WheelLike,
  mode: InputMode = inputMode(),
): { zoom: number } | { pan: [number, number] } {
  const k = e.deltaMode === 1 ? LINE_PX : 1;
  const dx = e.deltaX * k;
  const dy = e.deltaY * k;
  if (e.ctrlKey) return { zoom: dy * PINCH_GAIN };
  if (mode === 'trackpad') return { pan: [dx, dy] };
  return { zoom: dy };
}

/**
 * Во сколько раз приблизить за одну прокрутку: по силе движения, не больше одного шага.
 * Щелчок колеса мыши (~100 px) — ровно шаг, как раньше; тачпад — плавно, без рывков.
 */
export function zoomFactor(zoom: number, step: number): number {
  return Math.min(step, Math.max(1 / step, step ** (-zoom / 100)));
}
