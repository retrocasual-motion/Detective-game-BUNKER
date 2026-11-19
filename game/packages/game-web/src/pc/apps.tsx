import { type FormEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { postAction } from '../api.ts';
import { formatWait, OFFLINE, useFieldWait } from '../lock.ts';
import { NO_LINKS } from '../paperLinks.tsx';
import { useGame } from '../store.ts';
import { forScreen, hasValue, issueOf, locate, normalizeDate, serverDocs } from './content.ts';

/**
 * Программы компьютера следователя (4c-3; CO-A, DI-A, TM-A): «Экспорт сервера VL-31» — терминал
 * с вкладками; браузер с архивом номеров газеты (дата выпуска). Всё остаётся на компьютере (DV-A); текст — в запрос (data-material).
 */

const md = (text: string) => (
  <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={NO_LINKS}>
    {text}
  </Markdown>
);

/** Ответ движка на ввод в поле: открыто (released / уже было), отказ с текстом, пауза. */
async function enter(field: string, value: string) {
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
const pickable = (td: HTMLTableCellElement) => {
  const t = (td.textContent ?? '').trim();
  return td.tagName === 'TD' && td.cellIndex > 0 && t.length > 0 && t.length <= 32 && t !== '—';
};

/**
 * «Экспорт сервера VL-31» (TM-A; вид TM2-A + TM2-B — автор 11.11): терминал 2000-х. Слева — не
 * больше четырёх документов (что пришло по запросам), F1… — документ; над текстом — разделы
 * ярлыками. Щелчок по коду, терминалу или маршруту в таблице — строки с этим значением ярче,
 * прочие бледнеют (не исчезают); «✕» — как было. Ввода нет; поиск — свой, по делу.
 */
export function Terminal({ start }: { start?: string }) {
  const materials = useGame((g) => g.materials);
  const docs = useMemo(() => serverDocs(materials), [materials]);
  const [pos, setPos] = useState(() => locate(docs, start));
  const [mark, setMark] = useState<string | null>(null);
  const body = useRef<HTMLElement>(null);
  const doc = docs[pos.doc] ?? docs[0];
  const part = doc?.parts[pos.part] ?? doc?.parts[0];
  // Другой документ — выделение снимается: оно работает внутри документа (по всем его разделам).
  const openDoc = (d: number) => {
    setPos({ doc: d, part: docs[d]?.start ?? 0 });
    setMark(null);
  };

  // Выделение — по всем таблицам открытой части; ячейки, по которым можно щёлкнуть, — отмечены.
  // biome-ignore lint/correctness/useExhaustiveDependencies: пересчёт при смене части и значения
  useLayoutEffect(() => {
    const root = body.current;
    if (!root) return;
    for (const td of root.querySelectorAll('td')) td.classList.toggle('pc-pick', pickable(td));
    // Журнал событий (время · терминал · учётная запись · событие · результат) — свои ширины.
    for (const t of root.querySelectorAll('table')) {
      const th = [...t.querySelectorAll('th')].map((x) => x.textContent?.trim());
      t.classList.toggle('pc-log', th.length === 5 && th[0] === 'Время');
    }
    for (const tr of root.querySelectorAll('tbody tr')) {
      const cells = [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent ?? '');
      const on = !!mark && cells.some((c) => hasValue(c, mark));
      tr.classList.toggle('pc-row-on', on);
      tr.classList.toggle('pc-row-off', !!mark && !on);
    }
  }, [mark, pos, part?.body]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: F1… — документы терминала, когда он в фокусе
    <div
      className="pc-term"
      data-testid="pc-terminal"
      tabIndex={-1}
      onKeyDown={(e) => {
        const n = /^F(\d)$/.exec(e.key)?.[1];
        if (n && docs[Number(n) - 1]) {
          e.preventDefault();
          openDoc(Number(n) - 1);
        }
      }}
    >
      {/* Строка заголовка программы — неяркая: не меню и не кнопка (правка автора 11.11). */}
      <div className="pc-term-head">
        <span>ОКРУЖНОЕ БЮРО РАССЛЕДОВАНИЙ · ДЕЛО № 09-1128</span>
        <span>ВЫГРУЗКА С СЕРВЕРА ОБЪЕКТА VL-31</span>
      </div>
      {!doc || !part ? (
        <div className="pc-term-empty" data-testid="pc-terminal-empty">
          &gt; НЕТ ДАННЫХ. Выгрузки с сервера объекта выдаются бюро по запросу специалиста.
          <span className="pc-term-cursor" />
        </div>
      ) : (
        <div className="pc-term-main">
          <div className="pc-term-page">
            {doc.parts.length > 1 && (
              <div className="pc-term-parts">
                {doc.parts.map((p, k) => (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={k === pos.part}
                    className={k === pos.part ? 'pc-part-on' : undefined}
                    data-testid={`pc-part-${k}`}
                    onClick={() => setPos({ doc: pos.doc, part: k })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {mark && (
              <div className="pc-term-mark" data-testid="pc-mark">
                Выделено: <b>{mark}</b>
                <button
                  type="button"
                  aria-label="Снять выделение"
                  data-testid="pc-mark-clear"
                  onClick={() => setMark(null)}
                >
                  ✕
                </button>
              </div>
            )}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: щелчок по ячейке — необязательное выделение; всё читается и без него */}
            <section
              ref={body}
              className="pc-term-body"
              data-material={part.material}
              data-testid="pc-term-body"
              onClick={(e) => {
                const td = (e.target as HTMLElement).closest('td');
                if (!td || !pickable(td) || window.getSelection()?.toString()) return;
                const v = (td.textContent ?? '').trim();
                setMark((m) => (m === v ? null : v));
              }}
            >
              {/* Паспорт выгрузки — над первым разделом документа, не над каждым. */}
              {doc.note && pos.part === 0 && <div className="pc-term-note">{doc.note}</div>}
              <Markdown remarkPlugins={[remarkGfm]} components={NO_LINKS}>
                {part.body}
              </Markdown>
            </section>
          </div>
          {/* Документы — строкой F-клавиш внизу, как в программах DOS (Norton Commander). */}
          <nav className="pc-term-tabs">
            {docs.map((d, k) => (
              <button
                key={d.key}
                type="button"
                className={k === pos.doc ? 'pc-term-tab-on' : undefined}
                data-testid={`pc-term-${d.key}`}
                onClick={() => openDoc(k)}
              >
                <kbd>{d.key}</kbd>
                {d.title}
              </button>
            ))}
          </nav>
        </div>
      )}
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
  const wait = useFieldWait(field);

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
    } else setMsg(!r ? `${OFFLINE}.` : (r.reply ?? 'Выпуск за эту дату не оцифрован.'));
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
        text: !r ? `${OFFLINE}.` : r.reply && !r.quiet ? r.reply : 'Не удаётся открыть страницу.',
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
              {wait > 0 ? `Поле не принимает значение. Повторите через ${formatWait(wait)}` : msg}
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
