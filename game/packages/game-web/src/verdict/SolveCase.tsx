import { useState } from 'react';
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
  if (status.form || status.sent) return null;
  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className={`solve-case${import.meta.env.DEV ? ' solve-case-dev' : ''}`}
        data-testid="solve-case"
        disabled={busy}
        onClick={run(ask)}
      >
        Решить дело
      </button>
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
