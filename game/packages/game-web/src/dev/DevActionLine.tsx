import { arrangeWall } from '@bunker/shared';
import { useState } from 'react';
import { postActionLine, resetState } from '../api.ts';
import { deliverNow } from '../delivery.ts';
import { useGame } from '../store.ts';
import { clearReading, loadReading, mmss, readingRows, readingTsv } from './readingLog.ts';

interface Entry {
  id: number;
  line: string;
  result: string;
  reply: string;
  opened: string[];
}

/**
 * Служебная строка действий (E2-CHECK-A) — только в режиме разработки: проверить движок правил
 * руками.
 * Формат — как в сквозном проходе пакета: «ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ» (хвост «=> …» и «# …»
 * можно не убирать); «СБРОС» — начать дело заново; «ПОРЯДОК» — разложить стену по порядку.
 * Ручная проверка A-272 — по `game/docs/A272_MANUAL_CHECK.md`. В игре для игроков её нет.
 */
export function DevActionLine() {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const addReleased = useGame((g) => g.addReleased);
  const [reading, setReading] = useState<ReturnType<typeof readingRows> | null>(null);

  /** Время чтения (RD-A): таблица по материалам; повторное нажатие — обновить. */
  const showReading = () => {
    const titles = new Map(useGame.getState().materials.map((m) => [m.id, m.title]));
    setReading(readingRows(loadReading(), titles));
  };

  const note = (text: string, reply: string) =>
    setLog((l) =>
      [{ id: Date.now(), line: text, result: 'готово', reply, opened: [] }, ...l].slice(0, 6),
    );

  /** Разложить стену по порядку: 01, 02… сеткой, повешенные письма и записки — ниже. */
  const arrange = () => {
    const g = useGame.getState();
    g.updateState((s) => arrangeWall(s, g.materials));
    note('ПОРЯДОК', 'Стена разложена по порядку.');
  };

  const run = async () => {
    const text = line.trim();
    if (!text || busy) return;
    const cmd = text.toUpperCase();
    if (cmd === 'ПОРЯДОК') {
      setLine('');
      arrange();
      return;
    }
    setBusy(true);
    // «СБРОС» — начать дело заново: прогресс и раскладка (только в разработке).
    if (cmd === 'СБРОС') {
      await resetState().catch(() => undefined);
      window.location.reload();
      return;
    }
    try {
      const r = await postActionLine(text);
      addReleased(r.released);
      setLog((l) =>
        [
          {
            id: Date.now(),
            line: text,
            result: r.result ?? '',
            reply: r.reply,
            opened: r.released.map((m) => m.id),
          },
          ...l,
        ].slice(0, 6),
      );
      setLine('');
    } catch {
      setLog((l) =>
        [
          { id: Date.now(), line: text, result: 'ошибка', reply: 'Сервер не ответил.', opened: [] },
          ...l,
        ].slice(0, 6),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`dev-line${open ? ' dev-line-open' : ''}`} data-testid="dev-line">
      <button
        type="button"
        className="dev-line-tab"
        data-testid="dev-line-tab"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Служебная строка
      </button>
      {open && (
        <div className="dev-line-body">
          <form
            className="dev-line-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <input
              data-testid="dev-line-input"
              aria-label="Действие: ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ"
              placeholder="ОСМОТР | 29 | листать П-01"
              value={line}
              onChange={(e) => setLine(e.target.value)}
            />
            <button type="submit" data-testid="dev-line-run" disabled={busy}>
              Выполнить
            </button>
          </form>
          <div className="dev-line-tools">
            <button
              type="button"
              data-testid="dev-reset"
              title="Начать дело заново: прогресс и раскладка (то же, что команда «СБРОС»)"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void resetState()
                  .catch(() => undefined)
                  .then(() => window.location.reload());
              }}
            >
              Сброс
            </button>
            <button type="button" data-testid="dev-arrange" onClick={arrange}>
              Разложить стену по порядку
            </button>
            <button type="button" data-testid="dev-reading" onClick={showReading}>
              Время чтения
            </button>
            <button
              type="button"
              data-testid="dev-delivery"
              title="Вещдоки из камеры хранения — сразу, без звонка (короб «Изъятое» и «Личные вещи»)"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void deliverNow()
                  .then((ok) =>
                    note('ВЕЩДОКИ', ok ? 'Вещдоки пришли — короба у стола.' : 'Сервер не ответил.'),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Вещдоки сейчас
            </button>
          </div>
          {reading && (
            <div className="dev-reading" data-testid="dev-reading-table">
              <div className="dev-reading-tools">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(readingTsv(reading)).catch(() => undefined)
                  }
                >
                  Скопировать таблицу
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearReading();
                    setReading([]);
                  }}
                >
                  Сбросить
                </button>
                <button type="button" onClick={() => setReading(null)}>
                  Скрыть
                </button>
              </div>
              {reading.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Материал</th>
                      <th>Время</th>
                      <th>Открыт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reading.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.id} {r.title}
                        </td>
                        <td>{mmss(r.seconds)}</td>
                        <td>{r.opens}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>Пока ничего не читали.</p>
              )}
            </div>
          )}
          <ol className="dev-line-log" data-testid="dev-line-log">
            {log.map((e) => (
              <li key={e.id}>
                <span className="dev-line-cmd">{e.line}</span>
                <span className="dev-line-result">
                  {e.result}
                  {e.opened.length > 0 && ` · открыто: ${e.opened.join(', ')}`}
                </span>
                <span className="dev-line-reply">{e.reply}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
