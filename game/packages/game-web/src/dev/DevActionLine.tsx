import { arrangeWall, openAll } from '@bunker/shared';
import { useState } from 'react';
import { postActionLine, resetState } from '../api.ts';
import { useGame } from '../store.ts';
import { clearReading, loadReading, mmss, readingRows, readingTsv } from './readingLog.ts';

/**
 * «ПОДГОТОВКА» — одним вводом открыть всё, что нужно для проверки запросов по списку
 * `game/docs/PETITION_CHECKLIST.md`: адреса сайтов (адресная книга) и материалы, из которых
 * берут карточки. Строки — из сквозного прохода пакета v3.4.
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
  'ОСМОТР | 29__бумаги_из_помещений (пачка П-02, слой картона сбоку) | вытащить картон',
  'ОСМОТР | обложка дела A-24 и копия бланка осмотра, пачка П-02 | увеличить',
  'ПАРОЛЬ | ноутбук | 5-1-2-3-6-9-8-7-4',
];

/**
 * «КОМПЬЮТЕР» — ответы бюро для проверки компьютера следователя (4c-3): журналы сервера (L214,
 * L215, L387–L390), экспорт ящика (L452) и архив проекта (L735). Пароли и даты выпусков — не
 * вводятся: их проверяют руками на компьютере. Строки — из сквозного прохода пакета v3.4.
 */
const COMPUTER = [
  'ХОДАТАЙСТВО | zapros@okrug-bureau.org | прошу: 20, «вызов переведён на голосовую почту» ; основание: 20, «приложение № 7»',
  'ХОДАТАЙСТВО | zapros@okrug-bureau.org | прошу: 28, «терминал технической (отметки обходов)» ; основание: 30, «С 08:10»',
  'ХОДАТАЙСТВО | zapros@okrug-bureau.org | прошу: 04, «Материалы сеансов пользователей служебного узла» ; основание: L214, «сеанс пользователя 05 — просмотр и экспорт»',
  'АДРЕС | браузер | mailbridge.net',
  'ХОДАТАЙСТВО | lawful-requests@mailbridge.net | прошу: L249, «Запросы органов» ; основание: L387, «e.pierce.uk@mailbridge.net»',
  'АДРЕС | браузер | vaultline-program.com',
  'ОСМОТР | 29__бумаги_из_помещений (пачка П-02, слой картона сбоку) | вытащить картон',
  'ХОДАТАЙСТВО | documents@vaultline-program.com | прошу: L991, «Выбыл досрочно. Опись — архив проекта» ; основание: 26, «бланк VAULTLINE № VL-31»',
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
 * «ПОДГОТОВКА» — открыть всё для проверки запросов; «КОМПЬЮТЕР» — ответы бюро для компьютера. В игре для игроков её нет.
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

  const prepare = async (
    lines: readonly string[] = PREPARE,
    name = 'ПОДГОТОВКА',
    done = 'Адреса и материалы для проверки запросов открыты (лоток «Входящие»).',
  ) => {
    if (busy) return;
    setBusy(true);
    // Конверты архива (A-260) — все вскрыты: карточки берутся из стартовых материалов.
    const g = useGame.getState();
    g.updateState((s) => openAll(s, g.materials));
    const opened: string[] = [];
    for (const l of lines) {
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
          line: name,
          result: 'готово',
          reply: done,
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
    if (cmd === 'КОМПЬЮТЕР') {
      setLine('');
      await prepare(
        COMPUTER,
        'КОМПЬЮТЕР',
        'Ответы бюро — на компьютере следователя («Поступления», «Экспорт сервера VL-31»). Пароли и даты — вводить на компьютере.',
      );
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
            <button
              type="button"
              data-testid="dev-prepare"
              disabled={busy}
              title="Открыть адреса и материалы для проверки запросов (PETITION_CHECKLIST.md)"
              onClick={() => void prepare()}
            >
              Подготовка к запросам
            </button>
            <button
              type="button"
              data-testid="dev-computer"
              disabled={busy}
              title="Выдать ответы бюро для проверки компьютера следователя (команда «КОМПЬЮТЕР»)"
              onClick={() =>
                void prepare(
                  COMPUTER,
                  'КОМПЬЮТЕР',
                  'Ответы бюро — на компьютере следователя («Поступления», «Экспорт сервера VL-31»). Пароли и даты — вводить на компьютере.',
                )
              }
            >
              Ответы бюро для компьютера
            </button>
            <button type="button" data-testid="dev-reading" onClick={showReading}>
              Время чтения
            </button>
          </div>
          {reading && (
            <div className="dev-reading" data-testid="dev-reading-table">
              <div className="dev-reading-tools">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(readingTsv(reading))}
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
