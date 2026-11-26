import { type FormEvent, useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { postAction } from '../api.ts';
import { formatWait, OFFLINE, useFieldWait } from '../lock.ts';
import { NO_LINKS, remarkSites } from '../paperLinks.tsx';
import { domainOf, goToSite } from '../site.ts';
import { CaseSite } from '../sites/CaseSite.tsx';
import { useGame } from '../store.ts';
import { dateForEngine, forScreen, issueOf, normalizeDate } from './content.ts';

/**
 * Программы компьютера следователя (4c-3; CO-A, DI-A): браузер с архивом номеров газеты (дата
 * выпуска), документ окном. «Сервер объекта VL-31» — ServerApp.tsx (A-272). Всё остаётся на компьютере (DV-A); текст — в запрос (data-material).
 */

const md = (text: string) => (
  <Markdown remarkPlugins={[remarkGfm, remarkBreaks, remarkSites]} components={NO_LINKS}>
    {text}
  </Markdown>
);

/** Ответ движка на ввод в поле: открыто (released / уже было), отказ с текстом, пауза. */
export async function enter(field: string, value: string) {
  const r = await postAction('ПАРОЛЬ', field, value).catch(() => null);
  const g = useGame.getState();
  if (r?.released.length) g.addFound(r.released, 'pc', []);
  if (r?.wait) g.blockField(field, r.wait);
  return r;
}

/** Документ (выпуск газеты и т. п.) — страницей, текст выделяется. */
export function DocWindow({ id }: { id: string }) {
  const m = useGame((g) => g.materials.find((x) => x.id === id));
  if (!m) return null;
  return (
    <div className="lap-doc-scroll">
      <div className="lap-page" data-material={m.id} data-testid="pc-doc">
        {md(forScreen(m.body))}
      </div>
    </div>
  );
}

/** Ячейки, по которым можно щёлкнуть, — короткие значения (код, терминал, маршрут), не время. */
type PcPage =
  | { kind: 'archive' }
  | { kind: 'doc'; id: string }
  | { kind: 'text'; text: string }
  | { kind: 'site'; address: string; letter?: number };

const ARCHIVE = 'blackwood-chronicle.com/arhiv';

/**
 * Браузер компьютера дела: закладка «Архив номеров» (17) — поле «Дата выпуска» (движок, LK-A),
 * открытый выпуск — страницей; адресная строка, назад и вперёд — сайты дела здесь же, в окне
 * (A-288 п. 9: настоящая вкладка не открывается). Ссылка на сайт в листе, записке или выписке
 * открывает его тут (`pcSite`).
 */
export function PcBrowser() {
  const archive = useGame((g) => g.materials.find((m) => m.id === '17'));
  const [page, setPage] = useState<PcPage>({ kind: 'archive' });
  const [url, setUrl] = useState(ARCHIVE);
  const [typed, setTyped] = useState(ARCHIVE);
  const [hist, setHist] = useState<{ back: string[]; fwd: string[] }>({ back: [], fwd: [] });
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState('');
  const field = 'архив номеров газеты';
  const wait = useFieldWait(field);

  const openDate = async (e: FormEvent) => {
    e.preventDefault();
    const d = normalizeDate(date);
    if (!d) {
      setMsg('Дата — в виде ДД.ММ.ГГГГ.');
      return;
    }
    if (wait > 0) return;
    const r = await enter(field, dateForEngine(date, d));
    const issue = r?.released[0] ?? issueOf(useGame.getState().materials, d);
    if (issue) {
      setPage({ kind: 'doc', id: issue.id });
      setMsg('');
    } else setMsg(!r ? `${OFFLINE}.` : (r.reply ?? 'Выпуск за эту дату не оцифрован.'));
  };
  /** Открыть адрес; `letter` — письмо веб-почты (выписка). */
  const go = async (address: string, letter?: number) => {
    setUrl(address);
    setTyped(address);
    if (domainOf(address) === 'blackwood-chronicle.com') {
      setPage({ kind: 'archive' });
      return;
    }
    setPage({ kind: 'text', text: 'Загрузка…' });
    const r = await goToSite(address);
    if ('address' in r) {
      setUrl(r.address);
      setTyped(r.address);
      setPage({ kind: 'site', address: r.address, ...(letter ? { letter } : {}) });
    } else setPage({ kind: 'text', text: r.reply });
  };
  /** Переход игрока (адрес, закладка, ссылка): в историю. */
  const visit = (address: string, letter?: number) => {
    setHist((h) => ({ back: [...h.back, url], fwd: [] }));
    void go(address, letter);
  };
  // Ссылка на сайт из листа, записки, выписки — сюда (pcSite.at — каждый новый переход).
  const want = useGame((g) => g.pcSite);
  // biome-ignore lint/correctness/useExhaustiveDependencies: только на новый переход
  useEffect(() => {
    if (want) visit(want.address, want.letter);
  }, [want?.at]);

  return (
    <div className="lap-browser" data-testid="pc-browser">
      <form
        className="lap-toolbar lap-navbar"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) visit(typed.trim());
        }}
      >
        <button
          type="button"
          className="lap-round"
          aria-label="Назад"
          data-testid="pc-back"
          disabled={!hist.back.length}
          onClick={() => {
            const prev = hist.back[hist.back.length - 1];
            if (prev === undefined) return;
            setHist((h) => ({ back: h.back.slice(0, -1), fwd: [url, ...h.fwd] }));
            void go(prev);
          }}
        >
          ←
        </button>
        <button
          type="button"
          className="lap-round"
          aria-label="Вперёд"
          data-testid="pc-forward"
          disabled={!hist.fwd.length}
          onClick={() => {
            const next = hist.fwd[0];
            if (next === undefined) return;
            setHist((h) => ({ back: [...h.back, url], fwd: h.fwd.slice(1) }));
            void go(next);
          }}
        >
          →
        </button>
        <span className="lap-label">Адрес</span>
        <input
          className="lap-url"
          maxLength={300}
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
          <button type="button" data-testid="pc-fav-17" onClick={() => visit(ARCHIVE)}>
            {archive.title}
          </button>
        )}
      </div>
      <div
        className="lap-web"
        data-testid="pc-web"
        data-material={page.kind === 'doc' ? page.id : page.kind === 'archive' ? '17' : undefined}
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
              {wait > 0 ? `Поле не принимает значение. Повторите через ${formatWait(wait)}` : msg}
            </div>
          </div>
        ) : page.kind === 'doc' ? (
          <DocBody id={page.id} />
        ) : page.kind === 'text' ? (
          <p data-testid="pc-web-text">{page.text}</p>
        ) : page.kind === 'site' ? (
          <CaseSite address={page.address} letter={page.letter} onGo={visit} />
        ) : null}
      </div>
    </div>
  );
}

function DocBody({ id }: { id: string }) {
  const m = useGame((g) => g.materials.find((x) => x.id === id));
  return m ? <div data-testid="pc-issue">{md(m.body)}</div> : null;
}
