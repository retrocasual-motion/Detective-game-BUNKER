import type { PlayerState } from '@bunker/shared';
import type { SaveStatus } from './store.ts';

export interface Saver {
  /** Запомнить состояние и отправить через delayMs после последнего изменения. */
  schedule(s: PlayerState): void;
  /**
   * Отправить отложенное сразу и дождаться запросов. closing — страницу закрывают (pagehide): запрос
   * уходит с keepalive (RV-56).
   */
  flush(closing?: boolean): Promise<void>;
  /**
   * Больше не сохранять (до resume): «Новое дело», выход, дело открыто в другой вкладке. Отложенное
   * выбрасывается — иначе повтор или уход со страницы вернул бы старое дело на сервер (R2-04).
   */
  stop(): void;
  resume(): void;
}

const statusOf = (e: unknown) => {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
};

/**
 * Отложенное сохранение (TECH_PLAN 6.4; волна 1).
 * - Уходит только последнее состояние, обычно не больше одного запроса одновременно.
 * - Каждый запрос несёт номер — счётчик этой страницы, не часы устройства (RV-48): опоздавший
 *   запрос сервер не применит. Поэтому flush может слать сразу, не дожидаясь.
 * - Сбой связи и 5xx: состояние не теряется, повтор через retryMs (или раньше — при следующем
 *   изменении или закрытии страницы).
 * - 409 — дело открыто на другой странице или сброшено: сохранение останавливается ('conflict').
 * - 401 — вход истёк: состояние остаётся отложенным ('signedout'), его дошлют после входа.
 * - Другие 4xx ('rejected'): этот запрос не повторяется, но следующее изменение сохраняется снова —
 *   сервер сам приводит сохранение к допустимому, тупика нет (RV-50).
 */
export function createSaver(
  put: (s: PlayerState, seq: number, closing?: boolean) => Promise<void>,
  delayMs = 500,
  onStatus: (s: SaveStatus) => void = () => {},
  retryMs = 3000,
): Saver {
  let pending: PlayerState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const inFlight = new Set<Promise<void>>();
  let due = false;
  let seq = 0;
  let stopped = false;

  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      send();
    }, ms);
  };

  const sendNow = (closing = false) => {
    if (!pending || stopped) return;
    const s = pending;
    pending = null;
    onStatus('saving');
    const request: Promise<void> = put(s, ++seq, closing)
      .then(
        () => {
          if (!pending && inFlight.size === 1) onStatus('saved');
        },
        (e: unknown) => {
          const status = statusOf(e);
          if (status === 409) {
            stopped = true;
            pending = null;
            onStatus('conflict');
            return;
          }
          if (status === 401) {
            if (!pending) pending = s;
            onStatus('signedout');
            return;
          }
          if (
            status !== null &&
            status >= 400 &&
            status < 500 &&
            status !== 408 &&
            status !== 429
          ) {
            onStatus('rejected');
            return;
          }
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
      if (stopped) return;
      pending = s;
      arm(delayMs);
    },
    async flush(closing = false) {
      if (timer) clearTimeout(timer);
      timer = null;
      sendNow(closing);
      await Promise.allSettled([...inFlight]);
    },
    stop() {
      stopped = true;
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    resume() {
      stopped = false;
    },
  };
}
