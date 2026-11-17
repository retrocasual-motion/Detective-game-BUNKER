/**
 * «Уменьшить движение» — своя настройка игры (RM-A, решение автора 09.11).
 *
 * Системную настройку (Windows «Эффекты анимации», `prefers-reduced-motion`) игра не
 * учитывает: у многих она выключена, и игра без движения — наклона листа, полёта камеры,
 * плавных переходов — ощущается мёртвой. Тем, кому движение мешает, будет переключатель
 * в настройках игры; он пишет флаг сюда. Пока переключателя нет, флаг ставят автотесты.
 *
 * Флаг — атрибут `data-motion="reduce"` на `<html>`: по нему CSS гасит переходы, а код
 * сцены и листа — сглаживание и наклон.
 */
const KEY = 'bunker.reduceMotion';

/** Прочитать сохранённую настройку при запуске (до первого кадра). */
export function initMotion(): void {
  let on = false;
  try {
    on = localStorage.getItem(KEY) === '1';
  } catch {
    // Хранилище недоступно (приватный режим) — движение включено.
  }
  if (on) document.documentElement.dataset.motion = 'reduce';
}

/** Переключатель в настройках главного меню (RM-A): сохраняется между заходами. */
export function setReducedMotion(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Хранилище недоступно — настройка действует до перезагрузки.
  }
  if (on) document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
}

/** Включено ли в игре «уменьшить движение». */
export function reducedMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce';
}
