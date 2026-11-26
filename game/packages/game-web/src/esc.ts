import { useEffect, useRef } from 'react';

/**
 * Слои и Esc (2b-П1, RV-87): что открыто поверх чего — один порядок. Esc закрывает только верхний
 * слой — тот, что открыли последним (лист поверх ноутбука в руках закрывается, ноутбук остаётся).
 * Раньше каждый слой слушал Esc сам, и одна клавиша закрывала и лист, и ноутбук, и поиск.
 *
 * Слой регистрируется, пока открыт (`useEscLayer(open, close)`). Пока есть хоть один слой, Esc
 * дальше не идёт: стена (выделение, протяжка нити) её не получает.
 */
type Layer = { id: number; close: () => void };

const layers: Layer[] = [];
let next = 1;
let listening = false;

let blurTarget: HTMLElement | null = null;
function blurLater() {
  blurTarget?.blur();
  blurTarget = null;
}

function onKey(e: KeyboardEvent) {
  // Поле остановило прошлый Esc — его снятие фокуса отменяется.
  window.removeEventListener('keydown', blurLater);
  blurTarget = null;
  if (e.key !== 'Escape') return;
  const top = layers[layers.length - 1];
  if (!top) return;
  // В поле ввода (подпись, адрес, поиск) Esc сначала его: поле само решает, что делать; не решило —
  // Esc только снимает фокус с поля, а слой закрывает следующий Esc. Так набранное не пропадает
  // вместе с окном от одной клавиши.
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('input, textarea, [contenteditable="true"]')) {
    // Поле взяло Esc себе — остановило его (блокнот, подпись метки), и до окна оно не дойдёт;
    // иначе — снять фокус. Тут же, в этой же обработке клавиши: таймер страницы в фоне (сайт открыт
    // во вкладке) мог бы опоздать. preventDefault не в счёт: его ставят и общие обработчики.
    window.removeEventListener('keydown', blurLater);
    blurTarget = t;
    window.addEventListener('keydown', blurLater, { once: true });
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  top.close();
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // Перехват раньше остальных слушателей окна.
  window.addEventListener('keydown', onKey, { capture: true });
}

/** Открыт ли сейчас хоть один слой (для клавиш комнаты: под слоем стрелки не работают). */
export const anyLayerOpen = (): boolean => layers.length > 0;

/** Слой, пока `open`: Esc (если он верхний) вызывает `close`. */
export function useEscLayer(open: boolean, close: () => void): void {
  const fn = useRef(close);
  fn.current = close;
  useEffect(() => {
    if (!open) return;
    listen();
    const layer: Layer = { id: next++, close: () => fn.current() };
    layers.push(layer);
    return () => {
      const k = layers.findIndex((l) => l.id === layer.id);
      if (k >= 0) layers.splice(k, 1);
    };
  }, [open]);
}

/** Для тестов. */
export const escDepth = (): number => layers.length;
