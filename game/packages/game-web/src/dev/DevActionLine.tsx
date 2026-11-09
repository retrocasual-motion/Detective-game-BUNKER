import { arrangeWall } from '@bunker/shared';
import { useState } from 'react';
import { postActionLine, resetState } from '../api.ts';
import { useGame } from '../store.ts';

/**
 * «ПОДГОТОВКА» — одним вводом открыть всё, что нужно для проверки ходатайств по списку
 * `game/docs/PETITION_CHECKLIST.md`: адреса сайтов (адресная книга) и материалы, из которых
 * берут карточки. Строки — из сквозного прохода пакета v3.3.
 */
const PREPARE = [
  'АДРЕС | браузер | vaultline-program.com',
  'АДРЕС | браузер | frontrange-savings.com',
  'АДРЕС | браузер | mailbridge.net',
  'АДРЕС | браузер | sentinel-labs.net',
  'АДРЕС | браузер | https://www.hexon-bio.com/archive',
  'ОСМОТР | 45__вещи_Д_Миллер.md | увеличить',
  'ОСМОТР | 50__радиопост_стойка_и_запись.md | свойства',
  'ОСМОТР | П-05 | листать',
  'ОСМОТР | П-05 | увеличить листы 19–24: просвечивающие строки',
  'ОСМОТР | 29__сканы_документации_превью (пачка П-02, слой картона сбоку) | вытащить картон',
  'ОСМОТР | обложка дела A-24 и копия бланка осмотра, пачка П-02 | увеличить',
  'ПАРОЛЬ | ноутбук | 5-1-2-3-6-9-8-7-4',
];

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
 * Формат — как в сквозном проходе пакета: «ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ» (хвост «=> …» и «# …»
 * можно не убирать); «СБРОС» — начать дело заново; «ПОРЯДОК» — разложить стену по порядку;
 * «ПОДГОТОВКА» — открыть всё для проверки ходатайств. В игре для игроков её нет.
 */
export function DevActionLine() {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const addReleased = useGame((g) => g.addReleased);

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

  const prepare = async () => {
    if (busy) return;
    setBusy(true);
    const opened: string[] = [];
    for (const l of PREPARE) {
      const r = await postActionLine(l).catch(() => null);
      if (r) {
        addReleased(r.released);
        opened.push(...r.released.map((m) => m.id));
      }
    }
    setBusy(false);
    setLog((l) =>
      [
        {
          id: Date.now(),
          line: 'ПОДГОТОВКА',
          result: 'готово',
          reply: 'Адреса и материалы для проверки ходатайств открыты (лоток «Входящие»).',
          opened,
        },
        ...l,
      ].slice(0, 6),
    );
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
    if (cmd === 'ПОДГОТОВКА') {
      setLine('');
      await prepare();
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
            <button type="button" data-testid="dev-arrange" onClick={arrange}>
              Разложить стену по порядку
            </button>
            <button
              type="button"
              data-testid="dev-prepare"
              disabled={busy}
              title="Открыть адреса и материалы для проверки ходатайств (PETITION_CHECKLIST.md)"
              onClick={() => void prepare()}
            >
              Подготовка к ходатайствам
            </button>
          </div>
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
