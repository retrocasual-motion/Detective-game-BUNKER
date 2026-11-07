import type { PlayerState } from '@bunker/shared';
import type { SaveStatus } from './store.ts';

export interface Saver {
  /** Запомнить состояние и отправить через delayMs после последнего изменения. */
  schedule(s: PlayerState): void;
  /** Отправить отложенное сразу (закрытие страницы) и дождаться запросов. */
  flush(): Promise<void>;
}

/**
 * Отложенное сохранение (TECH_PLAN 6.4).
 * - Уходит только последнее состояние, обычно не больше одного запроса одновременно.
 * - Каждый запрос несёт растущий номер версии: если старый запрос придёт на сервер
 *   позже нового, сервер его не применит. Поэтому flush может слать сразу, не дожидаясь.
 * - Неудачное сохранение не теряется: состояние возвращается в очередь и повторяется
 *   через retryMs (или раньше — при следующем изменении или закрытии страницы).
 */
export function createSaver(
  put: (s: PlayerState, seq: number) => Promise<void>,
  delayMs = 500,
  onStatus: (s: SaveStatus) => void = () => {},
  retryMs = 3000,
): Saver {
  let pending: PlayerState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const inFlight = new Set<Promise<void>>();
  let due = false;
  let lastSeq = 0;

  const nextSeq = () => {
    lastSeq = Math.max(Date.now() * 1000, lastSeq + 1);
    return lastSeq;
  };

  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      send();
    }, ms);
  };

  const sendNow = () => {
    if (!pending) return;
    const s = pending;
    pending = null;
    onStatus('saving');
    const request: Promise<void> = put(s, nextSeq())
      .then(
        () => {
          if (!pending && inFlight.size === 1) onStatus('saved');
        },
        () => {
          if (!pending) pending = s;
          onStatus('error');
          arm(retryMs);
        },
      )
      .finally(() => {
        inFlight.delete(request);
        if (due && inFlight.size === 0) {
          due = false;
          send();
        }
      });
    inFlight.add(request);
  };

  const send = () => {
    if (inFlight.size > 0) {
      due = true;
      return;
    }
    sendNow();
  };

  return {
    schedule(s) {
      pending = s;
      arm(delayMs);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      sendNow();
      await Promise.allSettled([...inFlight]);
    },
  };
}
