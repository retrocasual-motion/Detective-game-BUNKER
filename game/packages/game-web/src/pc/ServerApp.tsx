import { type FormEvent, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatWait, OFFLINE, useFieldWait } from '../lock.ts';
import { NO_LINKS, remarkSites } from '../paperLinks.tsx';
import { useGame } from '../store.ts';
import { enter } from './apps.tsx';
import { exportFiles, matches, options, serverData, technical, withoutTitle } from './server.ts';

/**
 * «Сервер объекта VL-31» (A-272, AC-2; вид T-2-A — терминал 2000-х: серый фон, моноширинный
 * шрифт): копия следствия с диска «Прил. 7», только чтение. Меню слева — четыре раздела; журнал
 * событий — с фильтрами «Терминал» и «Учётная запись» (значения — из таблицы; щелчок по
 * терминалу или учётной записи в строке ставит фильтр, TM2-B); сеансы — по коду пользователя
 * (поле ввода — ПАРОЛЬ движка, лимит — как у всех полей отправки).
 */

const SESSIONS = 'сервер объекта: сеансы пользователей';

type Section = 'log' | 'node' | 'tech' | 'sessions';
const MENU: { key: Section; label: string }[] = [
  { key: 'log', label: 'Журнал событий 13.10' },
  { key: 'node', label: 'Узел связи за заезд' },
  { key: 'tech', label: 'Терминал технической — выгрузка следствия; изъят вместе с сервером' },
  { key: 'sessions', label: 'Сеансы пользователей' },
];

const md = (text: string) => (
  <Markdown remarkPlugins={[remarkGfm, remarkSites]} components={NO_LINKS}>
    {text}
  </Markdown>
);

/** С какого раздела открыть программу по материалу (из поиска). */
export const sectionOf = (material?: string | null): Section =>
  material === 'L215' ? 'tech' : material && /^L(38[789]|390)$/.test(material) ? 'sessions' : 'log';

export function ServerApp({ start }: { start?: string }) {
  const materials = useGame((g) => g.materials);
  const get = (id: string) => materials.find((m) => m.id === id);
  const l214 = get('L214')?.body ?? '';
  const data = useMemo(() => serverData(l214), [l214]);
  const [sec, setSec] = useState<Section>(() => sectionOf(start));

  return (
    <div className="srv" data-testid="srv">
      <header className="srv-head">
        <b>СЕРВЕР ОБЪЕКТА VL-31</b>
        <span>Копия следствия · диск «Прил. 7» · только чтение</span>
      </header>
      <div className="srv-sub">Время — часы сервера объекта. Только чтение.</div>
      <div className="srv-main">
        <nav className="srv-menu">
          {MENU.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={sec === m.key}
              className={sec === m.key ? 'srv-menu-btn srv-menu-on' : 'srv-menu-btn'}
              data-testid={`srv-menu-${m.key}`}
              onClick={() => setSec(m.key)}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <section className="srv-page" data-testid="srv-page">
          {sec === 'log' ? (
            <Log data={data} />
          ) : sec === 'node' ? (
            <div className="srv-text" data-material="L214">
              {md(data.node)}
            </div>
          ) : sec === 'tech' ? (
            <div className="srv-text" data-material="L215">
              {md(technical(get('L215')?.body ?? ''))}
            </div>
          ) : (
            <Sessions start={start} />
          )}
        </section>
      </div>
    </div>
  );
}

function Log({ data }: { data: ReturnType<typeof serverData> }) {
  const [terminal, setTerminal] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const terminals = useMemo(() => options(data.log, 'terminal'), [data.log]);
  const accounts = useMemo(() => options(data.log, 'account'), [data.log]);
  const rows = data.log.filter((r) => matches(r, terminal, account));
  return (
    <div className="srv-text" data-material="L214">
      <details className="srv-state">
        <summary>Состояние на 13.10.2009 00:00:00</summary>
        {md(data.state)}
      </details>
      <div className="srv-filters">
        <label>
          Терминал
          <select
            data-testid="srv-filter-terminal"
            value={terminal ?? ''}
            onChange={(e) => setTerminal(e.target.value || null)}
          >
            <option value="">все</option>
            {terminals.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Учётная запись
          <select
            data-testid="srv-filter-account"
            value={account ?? ''}
            onChange={(e) => setAccount(e.target.value || null)}
          >
            <option value="">все</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <span className="srv-count" data-testid="srv-count">
          Строк: {rows.length} из {data.log.length}
        </span>
        {(terminal || account) && (
          <button
            type="button"
            className="srv-btn"
            data-testid="srv-filter-clear"
            onClick={() => {
              setTerminal(null);
              setAccount(null);
            }}
          >
            Сбросить
          </button>
        )}
      </div>
      <table className="srv-log" data-testid="srv-log">
        <thead>
          <tr>
            <th>Время</th>
            <th>Терминал</th>
            <th>Учётная запись</th>
            <th>Событие</th>
            <th>Результат</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.time}|${r.terminal}|${r.event}`}>
              <td>{r.time}</td>
              <td>
                <Pick value={r.terminal} on={setTerminal} />
              </td>
              <td>
                <Pick value={r.account} on={setAccount} />
              </td>
              <td>{r.event}</td>
              <td>{r.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.logAfter && md(data.logAfter)}
      <div className="srv-note">
        <b>Пометка бюро к приложению.</b> {data.note}
      </div>
    </div>
  );
}

/** Значение в строке: щелчок — фильтр по нему (одно значение ячейки — сразу, несколько — первое). */
function Pick({ value, on }: { value: string; on: (v: string) => void }) {
  const first = value.split(/,\s*/)[0]?.trim() ?? '';
  if (!first || first === '—') return <>{value}</>;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: необязательный ярлык; фильтр есть и в списке выше
    <span
      className="srv-pick"
      title="Показать только строки с этим значением"
      onClick={() => {
        if (window.getSelection()?.toString()) return;
        on(first);
      }}
    >
      {value}
    </span>
  );
}

function Sessions({ start }: { start?: string }) {
  const materials = useGame((g) => g.materials);
  const has05 = materials.some((m) => m.id === 'L387');
  const [code, setCode] = useState('');
  const [shown, setShown] = useState<string | null>(has05 ? '05' : null);
  const [file, setFile] = useState<string | null>(
    start && /^L(38[89]|390)$/.test(start) ? start : null,
  );
  const [msg, setMsg] = useState('');
  const wait = useFieldWait(SESSIONS);
  const files = exportFiles(materials);
  const l387 = materials.find((m) => m.id === 'L387');
  const doc = file ? materials.find((m) => m.id === file) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = code.trim();
    if (!v || wait > 0) return;
    const r = await enter(SESSIONS, v);
    if (!r) {
      setMsg(`${OFFLINE}.`);
      return;
    }
    const opened = r.released.some((m) => m.id === 'L387') || (has05 && /^\D*0?5\D*$/.test(v));
    if (opened) {
      setShown('05');
      setFile(null);
      setMsg('');
    } else {
      setShown(null);
      setMsg(r.reply || 'Такого кода нет.');
    }
  };

  return (
    <div className="srv-text">
      <form className="srv-code" onSubmit={(e) => void submit(e)}>
        <label>
          Код пользователя
          <input
            data-testid="srv-code"
            value={code}
            maxLength={20}
            disabled={wait > 0}
            autoComplete="off"
            onChange={(e) => {
              setCode(e.target.value);
              setMsg('');
            }}
          />
        </label>
        <button type="submit" className="srv-btn" data-testid="srv-code-open" disabled={wait > 0}>
          Открыть
        </button>
      </form>
      <div className="srv-msg" data-testid="srv-msg" role="status">
        {wait > 0 ? `Поле не принимает значение. Повторите через ${formatWait(wait)}` : msg}
      </div>
      {shown === '05' && l387 && (
        <div className="srv-session" data-testid="srv-session">
          {doc ? (
            <div data-material={doc.id} data-testid="srv-export">
              <button type="button" className="srv-btn" onClick={() => setFile(null)}>
                ← Сеанс 05
              </button>
              {md(withoutTitle(doc.body))}
            </div>
          ) : (
            <>
              <div data-material="L387">{md(withoutTitle(l387.body))}</div>
              <div className="srv-folder" data-testid="srv-exports">
                <b>Папка «Экспорты»</b>
                {files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="srv-btn"
                    data-testid={`srv-file-${f.id}`}
                    onClick={() => setFile(f.id)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
