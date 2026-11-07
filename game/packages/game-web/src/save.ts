import type { PlayerState } from '@bunker/shared';
import type { SaveStatus } from './store.ts';

export interface Saver {
  /** Запомнить состояние и отправить через delayMs после последнего изменения. */
  schedule(s: PlayerState): void;
  /** Отправить отложенное сразу и дождаться всех запросов. */
  flush(): Promise<void>;
}

/**
 * Отложенное сохранение: уходит только последнее состояние, не больше одного запроса
 * одновременно — поэтому запросы не обгоняют друг друга (TECH_PLAN 6.4).
 */
export function createSaver(
  put: (s: PlayerState) => Promise<void>,
  delayMs = 500,
  onStatus: (s: SaveStatus) => void = () => {},
): Saver {
  let pending: PlayerState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let due = false;

  const send = (): Promise<void> => {
    if (inFlight) {
      due = true;
      return inFlight;
    }
    if (!pending) return Promise.resolve();
    const s = pending;
    pending = null;
    due = false;
    onStatus('saving');
    inFlight = put(s)
      .then(
        () => {
          if (!pending) onStatus('saved');
        },
        () => onStatus('error'),
      )
      .finally(() => {
        inFlight = null;
        if (due) void send();
      });
    return inFlight;
  };

  return {
    schedule(s) {
      pending = s;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void send();
      }, delayMs);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      while (pending || inFlight) {
        if (inFlight) await inFlight;
        else await send();
      }
    },
  };
}
