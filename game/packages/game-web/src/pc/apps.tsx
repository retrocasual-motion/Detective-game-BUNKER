import { type FormEvent, useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { postAction } from '../api.ts';
import { FileIcon } from '../laptop/apps.tsx';
import { useGame } from '../store.ts';
import { type Incoming, incoming, issueOf, mailbox, normalizeDate, serverTabs } from './content.ts';

/**
 * Программы компьютера следователя (4c-3; CO-A, DI-A, TM-A): «Поступления» — вложения ответов
 * бюро; окно пароля (ящик, архив; LK-A); почтовый клиент экспорта ящика; контейнер архива;
 * «Экспорт сервера VL-31» — терминал с вкладками по мере ответов; браузер с архивом номеров
 * газеты (дата выпуска). Всё остаётся на компьютере (DV-A); текст — в ходатайство (data-material).
 */

const md = (text: string) => <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{text}</Markdown>;
const mmss = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.ceil((ms % 60000) / 1000) % 60).padStart(2, '0')}`;

/** Ответ движка на ввод в поле: открыто (released / уже было), отказ с текстом, пауза. */
async function enter(field: string, value: string) {
  const r = await postAction('ПАРОЛЬ', field, value).catch(() => null);
  const g = useGame.getState();
  if (r?.released.length) g.addFound(r.released, 'pc', []);
  if (r?.wait) g.blockField(field, r.wait);
  return r;
}

/** Ожидание поля (LK-A) — секунды до конца, обновляется. */
function useWait(field: string) {
  const until = useGame((g) => g.fieldBlockedUntil[field] ?? 0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [until]);
  return Math.max(0, until - now);
}

/** Окно пароля зашифрованного вложения (канон: «Поле ввода: Пароль ящика / Пароль архива»). */
export function PasswordBox({
  label,
  field,
  file,
  open,
  onOpen,
}: {
  label: string;
  field: string;
  file: string;
  /** Уже открыт (пароль вводили) — показать содержимое. */
  open: boolean;
  onOpen: () => void;
}) {
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');
  const wait = useWait(field);
  useEffect(() => {
    if (open) onOpen();
  }, [open, onOpen]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim() || wait > 0) return;
    const r = await enter(field, value.trim());
    if (r && !r.quiet) onOpen();
    else setMsg(r?.reply && !/^С этим|^Такого/.test(r.reply) ? r.reply : 'Неверный пароль.');
  };
  return (
    <form className="pc-pass" onSubmit={(e) => void submit(e)} data-testid="pc-password">
      <div className="pc-pass-head">
        <FileIcon type="lock" size={32} />
        <div>
          <b>{file}</b>
          <div>Файл зашифрован. Введите пароль, чтобы открыть.</div>
        </div>
      </div>
      <label className="pc-pass-field">
        {label}
        <input
          type="password"
          autoComplete="off"
          data-testid="pc-password-input"
          value={value}
          disabled={wait > 0}
          onChange={(e) => {
            setValue(e.target.value);
            setMsg('');
          }}
        />
      </label>
      <div className="pc-pass-msg" data-testid="pc-password-msg" role="status">
        {wait > 0 ? `Поле не принимает значение. Повторите через ${mmss(wait)}` : msg}
      </div>
      <div className="pc-pass-actions">
        <button type="submit" disabled={wait > 0} data-testid="pc-password-ok">
          Открыть
        </button>
      </div>
    </form>
  );
}

/** Почтовый клиент экспорта ящика (L453): список писем и текст выбранного. */
export function Mail() {
  const body = useGame((g) => g.materials.find((m) => m.id === 'L453')?.body ?? '');
  const letters = useMemo(() => mailbox(body), [body]);
  const [sel, setSel] = useState(letters[0]?.n ?? 0);
  const cur = letters.find((l) => l.n === sel);
  return (
    <div className="pc-mail" data-testid="pc-mail">
      <aside className="pc-mail-folders">
        <b>e.pierce.uk@mailbridge.net</b>
        <span className="pc-mail-folder-on">Все письма ({letters.length})</span>
      </aside>
      <div className="pc-mail-main">
        <table className="pc-mail-list">
          <thead>
            <tr>
              <th>№</th>
              <th>Дата</th>
              <th>От</th>
              <th>Кому</th>
              <th>Тема</th>
            </tr>
          </thead>
          <tbody data-material="L453">
            {letters.map((l) => (
              <tr
                key={l.n}
                className={l.n === sel ? 'pc-row-sel' : undefined}
                data-testid={`pc-letter-${l.n}`}
                onClick={() => setSel(l.n)}
              >
                <td>{l.n}</td>
                <td>{l.date}</td>
                <td>{l.from}</td>
                <td>{l.to}</td>
                <td>{l.subject}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cur && (
          <article className="pc-mail-read" data-material="L453" data-testid="pc-mail-read">
            <div className="pc-mail-head">
              <div>
                <span>От:</span> {cur.from}
              </div>
              <div>
                <span>Кому:</span> {cur.to}
              </div>
              <div>
                <span>Дата:</span> {cur.date}
              </div>
              <div>
                <span>Тема:</span> {cur.subject}
              </div>
            </div>
            {md(cur.body)}
          </article>
        )}
      </div>
    </div>
  );
}

/** Контейнер архива проекта после пароля: три документа (L736–L738). */
export function ArchiveBox({ openDoc }: { openDoc: (id: string) => void }) {
  // Выборка — из списка, не в селекторе: новый массив на каждый вызов зациклил бы перерисовку.
  const materials = useGame((g) => g.materials);
  const docs = useMemo(() => materials.filter((m) => /^L73[678]$/.test(m.id)), [materials]);
  return (
    <div className="pc-archive" data-testid="pc-archive">
      <div className="pc-archive-head">VL-31_project_archive.enc — контейнер открыт</div>
      <table className="lap-files">
        <thead>
          <tr>
            <th>Документ</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} data-testid={`pc-archive-${d.id}`} onDoubleClick={() => openDoc(d.id)}>
              <td>
                <FileIcon type="doc" size={16} /> {d.title.replace(/^Архив проекта VL-31:\s*/, '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Документ (ответ бюро, документ архива, выпуск газеты) — страницей, текст выделяется. */
export function DocWindow({ id }: { id: string }) {
  const m = useGame((g) => g.materials.find((x) => x.id === id));
  if (!m) return null;
  return (
    <div className="lap-doc-scroll">
      <div className="lap-page" data-material={m.id} data-testid="pc-doc">
        {md(m.body)}
      </div>
    </div>
  );
}

/**
 * «Экспорт сервера VL-31» (TM-A): экран терминала 2000-х; вкладки — что пришло по ходатайствам
 * (L214 по разделам, L215, L387, копии экспортов). Клавиши F1… — вкладки.
 */
export function Terminal({ start }: { start?: string }) {
  const materials = useGame((g) => g.materials);
  const tabs = useMemo(() => serverTabs(materials), [materials]);
  const first = Math.max(
    0,
    tabs.findIndex((t) => t.material === start),
  );
  const [i, setI] = useState(first);
  const cur = tabs[i];
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: F1… — вкладки терминала, когда он в фокусе
    <div
      className="pc-term"
      data-testid="pc-terminal"
      tabIndex={-1}
      onKeyDown={(e) => {
        const n = /^F(\d+)$/.exec(e.key)?.[1];
        if (n && tabs[Number(n) - 1]) {
          e.preventDefault();
          setI(Number(n) - 1);
        }
      }}
    >
      <div className="pc-term-banner">
        ОКРУЖНОЕ БЮРО РАССЛЕДОВАНИЙ · ДЕЛО № 09-1128 · ВЫГРУЗКА СЛЕДСТВИЯ С СЕРВЕРА ОБЪЕКТА VL-31
      </div>
      {tabs.length === 0 ? (
        <div className="pc-term-empty" data-testid="pc-terminal-empty">
          &gt; НЕТ ДАННЫХ. Выгрузки с сервера объекта выдаются бюро по ходатайству специалиста.
          <span className="pc-term-cursor" />
        </div>
      ) : (
        <div className="pc-term-main">
          <nav className="pc-term-tabs">
            {tabs.map((t, k) => (
              <button
                key={`${t.material}-${t.title}`}
                type="button"
                className={k === i ? 'pc-term-tab-on' : undefined}
                data-testid={`pc-term-${t.key}`}
                onClick={() => setI(k)}
              >
                <span>[{t.key}]</span> {t.title}
              </button>
            ))}
          </nav>
          <section
            className="pc-term-body"
            data-material={cur?.material}
            data-testid="pc-term-body"
          >
            <div className="pc-term-title">
              &gt; {cur?.key} · {cur?.title}
            </div>
            {cur && <Markdown remarkPlugins={[remarkGfm]}>{cur.body}</Markdown>}
          </section>
        </div>
      )}
    </div>
  );
}

/** «Поступления»: вложения ответов бюро — по одному, как пришли. */
export function IncomingFolder({ open }: { open: (it: Incoming) => void }) {
  const materials = useGame((g) => g.materials);
  const list = useMemo(() => incoming(materials), [materials]);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="lap-explorer" data-testid="pc-incoming">
      <div className="lap-toolbar">
        <span className="lap-label">Адрес</span>
        <div className="lap-address">Рабочий стол › Поступления</div>
      </div>
      <div className="lap-files-wrap">
        {list.length === 0 ? (
          <p className="pc-empty" data-testid="pc-incoming-empty">
            Поступлений нет. Вложения ответов на ходатайства появляются здесь.
          </p>
        ) : (
          <table className="lap-files">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Тип</th>
              </tr>
            </thead>
            <tbody>
              {list.map((it) => (
                <tr
                  key={it.id}
                  className={sel === it.id ? 'lap-row-sel' : undefined}
                  data-testid={`pc-in-${it.id}`}
                  onClick={() => setSel(it.id)}
                  onDoubleClick={() => open(it)}
                >
                  <td>
                    <FileIcon
                      type={it.kind === 'letter' ? 'txt' : it.kind === 'server' ? 'server' : 'lock'}
                      size={16}
                    />{' '}
                    {it.name}
                  </td>
                  <td>
                    {it.kind === 'letter'
                      ? 'Письмо'
                      : it.kind === 'server'
                        ? 'Выгрузка сервера'
                        : 'Зашифрованный файл'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="lap-status">Объектов: {list.length}</div>
    </div>
  );
}

/**
 * Браузер компьютера дела: закладка «Архив номеров» (17) — поле «Дата выпуска» (движок, LK-A),
 * открытый выпуск — страницей; адресная строка — сайты (движок «АДРЕС»).
 */
export function PcBrowser() {
  const archive = useGame((g) => g.materials.find((m) => m.id === '17'));
  const [page, setPage] = useState<
    { kind: 'archive' } | { kind: 'doc'; id: string } | { kind: 'text'; text: string }
  >({ kind: 'archive' });
  const [typed, setTyped] = useState('silverridge-chronicle.com/arhiv');
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState('');
  const field = 'архив номеров газеты';
  const wait = useWait(field);

  const openDate = async (e: FormEvent) => {
    e.preventDefault();
    const d = normalizeDate(date);
    if (!d) {
      setMsg('Дата — в виде ДД.ММ.ГГГГ.');
      return;
    }
    if (wait > 0) return;
    const r = await enter(field, d);
    const issue = r?.released[0] ?? issueOf(useGame.getState().materials, d);
    if (issue) {
      setPage({ kind: 'doc', id: issue.id });
      setMsg('');
    } else setMsg(r?.reply ?? 'Выпуск за эту дату не оцифрован.');
  };
  const go = async (address: string) => {
    if (/silverridge-chronicle\.com/.test(address)) {
      setPage({ kind: 'archive' });
      return;
    }
    const r = await postAction('АДРЕС', 'браузер', address).catch(() => null);
    if (r?.released.length) useGame.getState().addFound(r.released, 'pc', []);
    const host =
      address
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        ?.replace(/^www\./, '') ?? '';
    const m =
      r?.released[0] ?? useGame.getState().materials.find((x) => host && x.title.includes(host));
    if (m) setPage({ kind: 'doc', id: m.id });
    else
      setPage({
        kind: 'text',
        text: r?.reply && !r.quiet ? r.reply : 'Не удаётся открыть страницу.',
      });
  };

  return (
    <div className="lap-browser" data-testid="pc-browser">
      <form
        className="lap-toolbar lap-navbar"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) void go(typed.trim());
        }}
      >
        <span className="lap-label">Адрес</span>
        <input
          className="lap-url"
          value={typed}
          aria-label="Адрес"
          data-testid="pc-url"
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="submit">Переход</button>
      </form>
      <div className="lap-favbar">
        <span className="lap-label">Закладки</span>
        {archive && (
          <button
            type="button"
            data-testid="pc-fav-17"
            onClick={() => {
              setTyped('silverridge-chronicle.com/arhiv');
              setPage({ kind: 'archive' });
            }}
          >
            {archive.title}
          </button>
        )}
      </div>
      <div
        className="lap-web"
        data-testid="pc-web"
        data-material={page.kind === 'doc' ? page.id : '17'}
      >
        {page.kind === 'archive' && archive ? (
          <div className="pc-news">
            {/* Служебные строки описания (где закладка, какое поле) — не текст страницы. */}
            {md(archive.body.replace(/^(Поле ввода|Закладка браузера)[^\n]*\n?/gm, ''))}
            <form className="pc-news-form" onSubmit={(e) => void openDate(e)}>
              <label>
                Дата выпуска
                <input
                  data-testid="pc-news-date"
                  placeholder="ДД.ММ.ГГГГ"
                  value={date}
                  disabled={wait > 0}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setMsg('');
                  }}
                />
              </label>
              <button type="submit" data-testid="pc-news-open" disabled={wait > 0}>
                Открыть
              </button>
            </form>
            <div className="pc-news-msg" data-testid="pc-news-msg" role="status">
              {wait > 0 ? `Поле не принимает значение. Повторите через ${mmss(wait)}` : msg}
            </div>
          </div>
        ) : page.kind === 'doc' ? (
          <DocBody id={page.id} />
        ) : page.kind === 'text' ? (
          <p>{page.text}</p>
        ) : null}
      </div>
    </div>
  );
}

function DocBody({ id }: { id: string }) {
  const m = useGame((g) => g.materials.find((x) => x.id === id));
  return m ? <div data-testid="pc-issue">{md(m.body)}</div> : null;
}
