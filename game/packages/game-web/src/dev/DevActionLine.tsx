import { useState } from 'react';
import { postActionLine } from '../api.ts';
import { useGame } from '../store.ts';

interface Entry {
  id: number;
  line: string;
  result: string;
  reply: string;
  opened: string[];
}

/**
 * Служебная строка действий (E2-CHECK-A) — только в режиме разработки: проверить движок правил
 * руками, пока игровых действий в интерфейсе нет (папка — этап 3, замки и осмотр — этап 4).
 * Формат — как в сквозном проходе пакета: «ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ». В игре для игроков её нет.
 */
export function DevActionLine() {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const addReleased = useGame((g) => g.addReleased);

  const run = async () => {
    const text = line.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const r = await postActionLine(text);
      addReleased(r.released);
      setLog((l) =>
        [
          {
            id: Date.now(),
            line: text,
            result: r.result,
            reply: r.reply,
            opened: r.released.map((m) => m.id),
          },
          ...l,
        ].slice(0, 6),
      );
      setLine('');
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
