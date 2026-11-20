import { FORM_TOKEN, SITE_FORMS, type SiteFormId, type SitePage } from '@bunker/shared';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatWait } from '../clock.ts';
import { NO_LINKS, remarkSites } from '../paperLinks.tsx';
import { type Letter, mailbox } from '../pc/content.ts';
import { MediaPlayer } from '../player/MediaPlayer.tsx';
import { EMBEDDED_MEDIA, splitEmbedded } from '../player/media.ts';
import { highlightFind } from '../search/highlight.ts';

/**
 * Сайт дела (A-272, AC-3; T-1): страница из материала пакета — функциональная редакция (финальные
 * тексты и вид — отдельной задачей автора). Формы шлют значения в движок игры от имени игрока,
 * пришедшего из игры (пропуск в ссылке → cookie сайта). Вне игры — сайт без текста и форм.
 */

type Resp = SitePage | { anon: true; domain: string } | { notFound: string };

const json = { 'content-type': 'application/json' };

const md = (text: string) => (
  <Markdown remarkPlugins={[remarkGfm, remarkSites]} components={NO_LINKS}>
    {text}
  </Markdown>
);

async function loadPage(): Promise<Resp> {
  const r = await fetch(`/api/site/page?path=${encodeURIComponent(location.pathname)}`);
  if (r.status === 404) return { notFound: 'Страница не найдена (404).' };
  return r.json();
}

export function SiteApp() {
  const [page, setPage] = useState<Resp | null>(null);
  const reload = useCallback(async () => setPage(await loadPage()), []);

  useEffect(() => {
    void (async () => {
      // Пропуск из игры — один раз: cookie сайта, адрес — без пропуска.
      const pass = new URLSearchParams(location.search).get('enter');
      if (pass) {
        await fetch('/api/site/enter', {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ pass }),
        }).catch(() => undefined);
        history.replaceState(null, '', location.pathname + location.hash);
      }
      await reload();
    })();
  }, [reload]);

  useEffect(() => {
    if (page && 'title' in page) document.title = page.title.replace(/^Сайт\s+/, '');
    else if (page && 'domain' in page) document.title = page.domain;
  }, [page]);

  if (!page) return <div className="site-loading">Загрузка…</div>;
  if ('notFound' in page)
    return (
      <main className="site-plain" data-testid="site-404">
        <h1>Страница не найдена</h1>
        <p>{page.notFound}</p>
      </main>
    );
  if ('anon' in page)
    return (
      <main className="site-plain" data-testid="site-anon">
        <h1>{page.domain}</h1>
        <p>Сайт дела открывается из игры: щёлкните его адрес в материалах дела.</p>
      </main>
    );
  return <Page page={page} reload={reload} />;
}

/** Выписка, на которой открыли страницу (`#x=слова&l=письмо`, A-272, DB-B). */
function wanted(): { text: string; letter: number | null } | null {
  const h = new URLSearchParams(location.hash.slice(1));
  const text = h.get('x');
  return text ? { text, letter: Number(h.get('l')) || null } : null;
}

function Page({ page, reload }: { page: SitePage; reload: () => Promise<void> }) {
  const parts = useMemo(() => page.body.split(/\n\n(?=::form:)|(?<=::)\n\n/), [page.body]);
  const want = useMemo(wanted, []);
  const [sel, setSel] = useState<{
    text: string;
    material: string;
    source: string;
    letter: number | null;
    x: number;
    y: number;
  } | null>(null);
  const [pinned, setPinned] = useState('');

  // Открыли выпиской — слова подсвечены и в виду (как поиск по делу в игре).
  useEffect(() => {
    if (!want) return;
    const t = setTimeout(() => {
      const r = highlightFind(document.body, want.text, 0);
      r?.startContainer.parentElement?.scrollIntoView({ block: 'center' });
    }, 300);
    return () => clearTimeout(t);
  }, [want]);

  useEffect(() => {
    const off = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !s.toString().trim()) setSel(null);
    };
    document.addEventListener('selectionchange', off);
    return () => document.removeEventListener('selectionchange', off);
  }, []);

  /** Выделение на странице — кнопка «На стену» у его конца. */
  const onUp = () => {
    const s = window.getSelection();
    const text = s?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (!s || s.isCollapsed || !text) return;
    const at = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
    if (at?.closest('form, button')) return;
    const material = at?.closest('[data-material]')?.getAttribute('data-material');
    if (!material) return;
    const r = s.getRangeAt(s.rangeCount - 1).getBoundingClientRect();
    setSel({
      text: text.slice(0, 600),
      material,
      source:
        at?.closest('[data-source]')?.getAttribute('data-source') ??
        `${page.domain} · ${page.title}`,
      letter: Number(at?.closest('[data-letter]')?.getAttribute('data-letter')) || null,
      x: Math.min(Math.max(r.right, 80), window.innerWidth - 80),
      y: r.bottom + window.scrollY,
    });
  };
  const toWall = async () => {
    if (!sel) return;
    const res = await fetch('/api/site/excerpt', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        id: `x:${crypto.randomUUID()}`,
        text: sel.text,
        material: sel.material,
        source: sel.source.slice(0, 160),
        place: {
          kind: 'site',
          address: `${page.domain}${location.pathname === '/' ? '' : location.pathname}`,
          ...(sel.letter ? { letter: sel.letter } : {}),
        },
      }),
    }).catch(() => null);
    window.getSelection()?.removeAllRanges();
    setSel(null);
    setPinned(
      res?.ok ? 'На стене в деле — вернитесь к игре.' : 'Не получилось: нет связи с игрой.',
    );
    setTimeout(() => setPinned(''), 4000);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: выделение текста мышью — выписка на стену
    <div className="site" data-testid="site" data-domain={page.domain} onMouseUp={onUp}>
      <header className="site-head">
        <div className="site-brand">
          <b>{page.domain}</b>
          {page.header && <span className="site-logo">{page.header}</span>}
        </div>
        {page.nav.length > 0 && <SiteNav nav={page.nav} body={page.body} />}
      </header>
      <main className="site-main" data-material={page.material}>
        {page.mailbox ? (
          <WebMail body={page.mailbox} letter={want?.letter ?? null} />
        ) : (
          parts.map((p, k) => {
            const id = FORM_TOKEN.exec(p.trim())?.[1] as SiteFormId | undefined;
            if (!id) {
              // Запись внутри страницы (L163 — старый фильм HEXON): раздел — плеером на своём месте.
              const heading = EMBEDDED_MEDIA[page.material];
              const film = heading ? splitEmbedded(p, heading) : null;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: части страницы не переставляются
                <div key={k}>
                  {film ? (
                    <>
                      {md(film.before)}
                      <MediaPlayer materialId={page.material} body={film.section} />
                      {md(film.after)}
                    </>
                  ) : (
                    md(p)
                  )}
                </div>
              );
            }
            if (id === 'vl-login' && page.cabinet)
              return (
                <p key={id} className="site-in" data-testid="site-in">
                  Вы вошли: {page.cabinet} · <a href="/cabinet">Кабинет сотрудника</a>
                </p>
              );
            if (id === 'vl-forgot' && page.cabinet) return null;
            if (id === 'vl-forgot') return <VlForgot key={id} wait={page.wait} />;
            // Почта уже открыта: повторный вход не нужен (F8) — как у кабинета VAULTLINE.
            if (id === 'mb-login' && page.mailOpen)
              return (
                <p key={id} className="site-in" data-testid="site-in">
                  Вы вошли · <a href="/mail">Почта</a>
                </p>
              );
            if (id === 'mb-forgot' && page.mailOpen) return null;
            if (id === 'mb-forgot') return <MailForgot key={id} wait={page.wait} />;
            return (
              <SiteForm
                key={id}
                id={id}
                wait={page.wait[id] ?? 0}
                onDone={async (r) => {
                  if (id === 'vl-login' && r.opened.includes('L620')) location.assign('/cabinet');
                  else if (id === 'mb-login' && r.opened.includes('L453')) location.assign('/mail');
                  else if (r.opened.length || !r.quiet) await reload();
                  return id === 'mb-login' && !r.opened.length
                    ? 'Неверный адрес или пароль.'
                    : r.reply;
                }}
              />
            );
          })
        )}
        {page.docs.length > 0 && (
          <Docs docs={page.docs} domain={page.domain} want={want?.text ?? null} />
        )}
      </main>
      {sel && (
        <button
          type="button"
          className="site-to-wall"
          data-testid="site-to-wall"
          style={{ left: sel.x, top: sel.y + 6 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void toWall()}
        >
          На стену
        </button>
      )}
      {pinned && (
        <p className="site-pinned" role="status" data-testid="site-pinned">
          {pinned}
        </p>
      )}
    </div>
  );
}

interface FormResult {
  reply: string;
  quiet: boolean;
  opened: string[];
  wait: number;
}

async function send(form: SiteFormId, values: Record<string, string>): Promise<FormResult | null> {
  const r = await fetch('/api/site/form', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ form, values }),
  }).catch(() => null);
  if (!r?.ok) return null;
  return r.json();
}

/** Отсчёт паузы поля (лимит неверных вводов). */
function useWait(initial: number) {
  const [until, setUntil] = useState(() => (initial > 0 ? Date.now() + initial : 0));
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => {
      if (Date.now() >= until) setUntil(0);
      tick((n) => n + 1);
    }, 500);
    return () => clearInterval(t);
  }, [until]);
  const left = until ? Math.max(0, until - Date.now()) : 0;
  return { left, set: (ms: number) => setUntil(ms > 0 ? Date.now() + ms : 0) };
}

function SiteForm({
  id,
  wait,
  onDone,
  extra,
}: {
  id: SiteFormId;
  wait: number;
  onDone: (r: FormResult, values: Record<string, string>) => Promise<string> | string;
  extra?: Record<string, string>;
}) {
  const spec = SITE_FORMS[id];
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const w = useWait(wait);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || w.left > 0) return;
    // Пустое поле — у поля, без сервера: попытка не тратится (UX-4, VF-5).
    const empty = spec.fields.filter((f) => !(values[f.name] ?? '').trim());
    if (spec.some ? empty.length === spec.fields.length : empty.length > 0) {
      setMissing(empty.map((f) => f.name));
      setMsg(
        spec.some
          ? 'Заполните хотя бы одно поле.'
          : empty.length === 1
            ? `Заполните поле «${empty[0]?.label}».`
            : `Заполните поля: ${empty.map((f) => `«${f.label}»`).join(', ')}.`,
      );
      return;
    }
    setMissing([]);
    setBusy(true);
    const all = { ...extra, ...values };
    const r = await send(id, all);
    setBusy(false);
    if (!r) {
      setMsg('Нет связи с сервером.');
      return;
    }
    w.set(r.wait);
    setMsg(await onDone(r, all));
  };
  return (
    <form className="site-form" data-testid={`site-form-${id}`} onSubmit={(e) => void submit(e)}>
      {spec.title && <b className="site-form-title">{spec.title}</b>}
      {spec.fields.map((f) => (
        <label key={f.name}>
          {f.label}
          <input
            type={f.password ? 'password' : 'text'}
            name={f.name}
            data-testid={`site-${id}-${f.name}`}
            placeholder={f.placeholder}
            autoComplete="off"
            value={values[f.name] ?? ''}
            disabled={w.left > 0}
            aria-invalid={missing.includes(f.name) || undefined}
            onChange={(e) => {
              setValues((v) => ({ ...v, [f.name]: e.target.value }));
              setMissing((m) => m.filter((x) => x !== f.name));
              setMsg('');
            }}
          />
        </label>
      ))}
      <button type="submit" disabled={busy || w.left > 0} data-testid={`site-${id}-submit`}>
        {spec.submit}
      </button>
      <div className="site-msg" role="status" data-testid={`site-${id}-msg`}>
        {w.left > 0
          ? `Слишком много попыток. Повторите через ${formatWait(w.left)}.`
          : msg && md(msg)}
      </div>
    </form>
  );
}

/**
 * Разделы сайта в шапке (UX-6, DA-4): раздел, который есть на странице, — ссылка к нему
 * («Главная» — наверх); раздела на странице нет — просто слово, не вкладка: нажимается только то,
 * что выглядит нажимаемым.
 */
function SiteNav({ nav, body }: { nav: string[]; body: string }) {
  const heads = [...body.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => (m[1] ?? '').trim());
  const low = (s: string) => s.toLowerCase();
  const target = (n: string) =>
    /^главная$/i.test(n)
      ? 'top'
      : (heads.find((h) => low(h).startsWith(low(n)) || low(n).startsWith(low(h))) ?? null);
  const go = (t: string) => {
    if (t === 'top') {
      window.scrollTo({ top: 0 });
      return;
    }
    const el = [...document.querySelectorAll('.site-main :is(h1, h2, h3)')].find(
      (h) => h.textContent?.trim() === t,
    );
    el?.scrollIntoView({ block: 'start' });
  };
  return (
    <nav className="site-nav">
      {nav.map((n) => {
        const t = target(n);
        return t ? (
          <a
            key={n}
            href={`#${encodeURIComponent(n)}`}
            onClick={(e) => {
              e.preventDefault();
              go(t);
            }}
          >
            {n}
          </a>
        ) : (
          <span key={n} className="site-nav-off">
            {n}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * «Забыли пароль?» VAULTLINE (PW-B, автор 20.11): второй вход — по кодовому слову. Логин →
 * контрольный вопрос учётной записи → ответ → кабинет. Как у почты (MailForgot).
 */
function VlForgot({ wait }: { wait: SitePage['wait'] }) {
  const [asked, setAsked] = useState<{ login: string; question: string } | null>(null);
  if (!asked)
    return (
      <SiteForm
        id="vl-forgot"
        wait={wait['vl-forgot'] ?? 0}
        onDone={(r, v) => {
          if (/Контрольный вопрос/.test(r.reply))
            setAsked({ login: v.login ?? '', question: r.reply });
          return r.reply;
        }}
      />
    );
  return (
    <div className="site-question" data-testid="site-question">
      <p>{asked.question}</p>
      <SiteForm
        id="vl-word"
        wait={wait['vl-word'] ?? 0}
        extra={{ login: asked.login }}
        onDone={(r) => {
          if (r.opened.includes('L620') || (!r.quiet && /Вход выполнен/.test(r.reply)))
            location.assign('/cabinet');
          return r.reply;
        }}
      />
    </div>
  );
}

/** «Забыли пароль?» почты: адрес → контрольный вопрос → ответ (A-272, задание §3). */
function MailForgot({ wait }: { wait: SitePage['wait'] }) {
  const [asked, setAsked] = useState<{ address: string; question: string } | null>(null);
  if (!asked)
    return (
      <SiteForm
        id="mb-forgot"
        wait={wait['mb-forgot'] ?? 0}
        onDone={(r, v) => {
          if (/Контрольный вопрос/.test(r.reply))
            setAsked({ address: v.address ?? '', question: r.reply });
          return r.reply;
        }}
      />
    );
  return (
    <div className="site-question" data-testid="site-question">
      <p>{asked.question}</p>
      <SiteForm
        id="mb-answer"
        wait={wait['mb-answer'] ?? 0}
        extra={{ address: asked.address }}
        onDone={(r) => {
          if (r.opened.includes('L453') || (!r.quiet && /Вход выполнен/.test(r.reply)))
            location.assign('/mail');
          return r.reply;
        }}
      />
    </div>
  );
}

/** Документы, открытые на странице (учёт анкет, архив проекта): заголовок — раскрыть. */
function Docs({
  docs,
  domain,
  want,
}: {
  docs: SitePage['docs'];
  domain: string;
  want: string | null;
}) {
  // Открыли выпиской — раскрыт документ, где она есть.
  const [open, setOpen] = useState<string | null>(
    (want && docs.find((d) => d.body.replace(/\s+/g, ' ').includes(want))?.id) ||
      (docs.at(-1)?.id ?? null),
  );
  return (
    <section className="site-docs" data-testid="site-docs">
      <h2>Открытые документы</h2>
      {docs.map((d) => (
        <article
          key={d.id}
          className="site-doc"
          data-material={d.id}
          data-source={`${domain} · ${d.title}`}
          data-testid={`site-doc-${d.id}`}
        >
          <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)}>
            {d.title}
          </button>
          {open === d.id && md(d.body.replace(/^# [^\n]*\n+/, ''))}
        </article>
      ))}
    </section>
  );
}

/** Веб-почта Mailbridge 2009 года (L453): «Входящие» и «Отправленные», только чтение. */
function WebMail({ body, letter }: { body: string; letter: number | null }) {
  const letters = useMemo(() => mailbox(body), [body]);
  // Адрес ящика — из заголовка самого ящика (его отдаёт сервер, когда почта открыта); в коде
  // страницы адреса нет (P-10: это цель пароля почты).
  const me = /^# Почта (\S+@\S+)/m.exec(body)?.[1] ?? '';
  const [box, setBox] = useState<'in' | 'out'>('in');
  const sent = (l: Letter) => !!me && l.from.includes(me);
  const list = letters.filter((l) => (box === 'out' ? sent(l) : !sent(l)));
  const [sel, setSel] = useState<number | null>(letter);
  const cur = letters.find((l) => l.n === sel) ?? null;
  // Источник выписки — как на конверте: «почта Э. Пирс · 09.10 · Re: B».
  const short = (d: string) => d.split(' ')[0]?.slice(0, 5) ?? d;
  return (
    <div className="site-mail" data-testid="site-mail" data-material="L453">
      <aside>
        <b>{me}</b>
        <button
          type="button"
          className={box === 'in' ? 'on' : undefined}
          data-testid="site-mail-in"
          onClick={() => setBox('in')}
        >
          Входящие ({letters.filter((l) => !sent(l)).length})
        </button>
        <button
          type="button"
          className={box === 'out' ? 'on' : undefined}
          data-testid="site-mail-out"
          onClick={() => setBox('out')}
        >
          Отправленные ({letters.filter(sent).length})
        </button>
        <span className="site-mail-ro">Только чтение</span>
      </aside>
      <div className="site-mail-main">
        <table>
          <tbody>
            {list.map((l) => (
              <tr
                key={l.n}
                className={l.n === sel ? 'on' : undefined}
                data-testid={`site-letter-${l.n}`}
                onClick={() => setSel(l.n)}
              >
                <td>{sent(l) ? l.to : l.from}</td>
                <td>{l.subject}</td>
                <td>{l.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cur && (
          <article
            className="site-letter"
            data-testid="site-letter"
            data-letter={cur.n}
            data-source={`почта Э. Пирс · ${short(cur.date)} · ${cur.subject}`}
          >
            <h3>{cur.subject}</h3>
            <p className="site-letter-meta">
              {cur.date} · {cur.from} → {cur.to}
            </p>
            {md(cur.body)}
          </article>
        )}
      </div>
    </div>
  );
}
