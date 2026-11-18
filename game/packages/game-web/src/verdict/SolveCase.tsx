import { useState } from 'react';
import { OFFLINE } from '../lock.ts';
import { useVerdict } from './verdict-store.ts';

/**
 * Кнопка «Решить дело» (TECH_PLAN 4.16; A-224, A-243) — доступна всегда, пока дело открыто.
 * Сначала предупреждение бюро (L998): после перехода к форме назад пути нет. «Вернуться к делу»
 * ни к чему не обязывает; «Продолжить» закрывает расследование и открывает форму (A-270).
 */
export function SolveCase() {
  const status = useVerdict((v) => v.status);
  const warning = useVerdict((v) => v.warning);
  const { ask, back, proceed } = useVerdict.getState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (status.form || status.sent) return null;
  // Сбой сети — сказать прямо, а не молча вернуть кнопку (R2-05).
  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch {
      setError(`${OFFLINE}.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="solve-case"
        data-testid="solve-case"
        disabled={busy}
        onClick={run(ask)}
      >
        Решить дело
      </button>
      {error && !warning && (
        <p className="solve-error" role="alert" data-testid="solve-error">
          {error}
        </p>
      )}
      {warning && (
        <div className="solve-backdrop">
          <div
            className="solve-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="solve-title"
            data-testid="solve-warning"
          >
            <h2 id="solve-title">Предупреждение бюро</h2>
            <p>
              После перехода к форме заключения назад пути нет: новые материалы не выдаются,
              действия недоступны. Перечитывать материалы дела можно.
            </p>
            <p>
              Если вы расследовали всё, что могли, — продолжайте. Если нет — вернитесь к делу:
              предупреждение ни к чему не обязывает.
            </p>
            {error && (
              <p className="solve-error-inline" role="alert" data-testid="solve-error">
                {error}
              </p>
            )}
            <div className="solve-actions">
              <button type="button" data-testid="solve-back" onClick={back}>
                Вернуться к делу
              </button>
              <button
                type="button"
                className="solve-go"
                data-testid="solve-continue"
                disabled={busy}
                onClick={run(proceed)}
              >
                Продолжить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
