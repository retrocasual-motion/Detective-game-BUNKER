import { FORM_TOKEN, SITE_FORMS, type SiteFormId, type SitePage } from '@bunker/shared';
import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getSitePage, type SiteFormResult, sendSiteForm } from '../api.ts';
import { formatWait } from '../clock.ts';
import { NO_LINKS, remarkSites, SiteNavContext } from '../paperLinks.tsx';
import { type Letter, mailbox } from '../pc/content.ts';
import { MediaPlayer } from '../player/MediaPlayer.tsx';
import { EMBEDDED_MEDIA, splitEmbedded } from '../player/media.ts';
import { refreshMaterials } from '../site.ts';
import { useGame } from '../store.ts';
import './sites.css';

/**
 * Сайт дела (A-272, AC-3; A-288 п. 9): страница из материала пакета — функциональная редакция
 * (финальные тексты и вид — отдельной задачей автора). Открывается в окне браузера устройства
 * внутри игры (компьютер следователя, ноутбук Адама) — одна и та же страница и там и там. Формы шлют
 * значения в движок от имени игрока. Выделенные слова — «На стену» самого устройства
 * (`useSelectionCard`): у корня страницы её адрес, у письма веб-почты — номер.
 */

type Resp = SitePage | { notFound: string };
type Send = (form: SiteFormId, values: Record<string, string>) => Promise<SiteFormResult | null>;

const md = (text: string) => (
  <Markdown remarkPlugins={[remarkGfm, remarkSites]} components={NO_LINKS}>
    {text}
  </Markdown>
);

export function CaseSite({
  address,
  letter,
  onGo,
}: {
  /** Адрес открытой страницы: `vaultline-program.com/cabinet`. */
  address: string;
  /** Письмо веб-почты, на котором открыть (выписка). */
  letter?: number;
  /** Переход по ссылке на странице — в этом же браузере. */
  onGo: (address: string) => void;
}) {
  const [page, setPage] = useState<Resp | null>(null);
  const reload = useCallback(async () => {
    const r = await getSitePage(address).catch(() => null);
    setPage(r ?? { notFound: 'Нет связи с сервером игры.' });
  }, [address]);

  useEffect(() => {
    setPage(null);
    void reload();
  }, [reload]);

  if (!page) return <div className="case-site site-loading">Загрузка…</div>;
  if ('notFound' in page)
    return (
      <div className="case-site site-plain" data-testid="site-404">
        <h1>Страница не найдена</h1>
        <p>{page.notFound}</p>
      </div>
    );
  return (
    <SiteNavContext.Provider value={onGo}>
      <Page page={page} address={address} letter={letter ?? null} reload={reload} onGo={onGo} />
    </SiteNavContext.Provider>
  );
}

function Page({
  page,
  address,
  letter,
  reload,
  onGo,
}: {
  page: SitePage;
  address: string;
  letter: number | null;
  reload: () => Promise<void>;
  onGo: (address: string) => void;
}) {
  const parts = useMemo(() => page.body.split(/\n\n(?=::form:)|(?<=::)\n\n/), [page.body]);
  const root = useRef<HTMLDivElement>(null);
  const to = (path: string) => onGo(`${page.domain}${path}`);
  const send: Send = (form, values) => sendSiteForm(address, form, values).catch(() => null);

  return (
    <div
      className="case-site site"
      ref={root}
      data-testid="site"
      data-domain={page.domain}
      data-site-address={address}
    >
      <header className="site-head">
        <div className="site-brand">
          <b>{page.domain}</b>
          {page.header && <span className="site-logo">{page.header}</span>}
        </div>
        {page.nav.length > 0 && <SiteNav nav={page.nav} body={page.body} root={root} />}
      </header>
      <main
        className="site-main"
        data-material={page.material}
        data-source={`${page.domain} · ${page.title}`}
      >
        {page.mailbox ? (
          <WebMail body={page.mailbox} letter={letter} />
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
                  Вы вошли: {page.cabinet} ·{' '}
                  <button type="button" className="site-a" onClick={() => to('/cabinet')}>
                    Кабинет сотрудника
                  </button>
                </p>
              );
            if (id === 'vl-forgot' && page.cabinet) return null;
            if (id === 'vl-forgot')
              return <VlForgot key={id} wait={page.wait} send={send} onIn={() => to('/cabinet')} />;
            // Почта уже открыта: повторный вход не нужен (F8) — как у кабинета VAULTLINE.
            if (id === 'mb-login' && page.mailOpen)
              return (
                <p key={id} className="site-in" data-testid="site-in">
                  Вы вошли ·{' '}
                  <button type="button" className="site-a" onClick={() => to('/mail')}>
                    Почта
                  </button>
                </p>
              );
            if (id === 'mb-forgot' && page.mailOpen) return null;
            if (id === 'mb-forgot')
              return <MailForgot key={id} wait={page.wait} send={send} onIn={() => to('/mail')} />;
            return (
              <SiteForm
                key={id}
                id={id}
                wait={page.wait[id] ?? 0}
                send={send}
                onDone={async (r) => {
                  if (r.opened.length) await refreshMaterials();
                  if (id === 'vl-login' && r.opened.includes('L620')) to('/cabinet');
                  else if (id === 'mb-login' && r.opened.includes('L453')) to('/mail');
                  else if (r.opened.length || !r.quiet) await reload();
                  return id === 'mb-login' && !r.opened.length
                    ? 'Неверный адрес или пароль.'
                    : r.reply;
                }}
              />
            );
          })
        )}
        {page.docs.length > 0 && <Docs docs={page.docs} domain={page.domain} />}
      </main>
    </div>
  );
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
  send,
  onDone,
  extra,
}: {
  id: SiteFormId;
  wait: number;
  send: Send;
  onDone: (r: SiteFormResult, values: Record<string, string>) => Promise<string> | string;
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
function SiteNav({
  nav,
  body,
  root,
}: {
  nav: string[];
  body: string;
  root: RefObject<HTMLDivElement | null>;
}) {
  const heads = [...body.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => (m[1] ?? '').trim());
  const low = (s: string) => s.toLowerCase();
  const target = (n: string) =>
    /^главная$/i.test(n)
      ? 'top'
      : (heads.find((h) => low(h).startsWith(low(n)) || low(n).startsWith(low(h))) ?? null);
  const go = (t: string) => {
    if (t === 'top') {
      root.current?.scrollIntoView({ block: 'start' });
      return;
    }
    const el = [...(root.current?.querySelectorAll('.site-main :is(h1, h2, h3)') ?? [])].find(
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
function VlForgot({ wait, send, onIn }: { wait: SitePage['wait']; send: Send; onIn: () => void }) {
  const [asked, setAsked] = useState<{ login: string; question: string } | null>(null);
  if (!asked)
    return (
      <SiteForm
        id="vl-forgot"
        wait={wait['vl-forgot'] ?? 0}
        send={send}
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
        send={send}
        extra={{ login: asked.login }}
        onDone={async (r) => {
          if (r.opened.length) await refreshMaterials();
          if (r.opened.includes('L620') || (!r.quiet && /Вход выполнен/.test(r.reply))) onIn();
          return r.reply;
        }}
      />
    </div>
  );
}

/** «Забыли пароль?» почты: адрес → контрольный вопрос → ответ (A-272, задание §3). */
function MailForgot({
  wait,
  send,
  onIn,
}: {
  wait: SitePage['wait'];
  send: Send;
  onIn: () => void;
}) {
  const [asked, setAsked] = useState<{ address: string; question: string } | null>(null);
  if (!asked)
    return (
      <SiteForm
        id="mb-forgot"
        wait={wait['mb-forgot'] ?? 0}
        send={send}
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
        send={send}
        extra={{ address: asked.address }}
        onDone={async (r) => {
          if (r.opened.length) await refreshMaterials();
          if (r.opened.includes('L453') || (!r.quiet && /Вход выполнен/.test(r.reply))) onIn();
          return r.reply;
        }}
      />
    </div>
  );
}

/** Документы, открытые на странице (учёт анкет, архив проекта): заголовок — раскрыть. */
function Docs({ docs, domain }: { docs: SitePage['docs']; domain: string }) {
  // Открыли выпиской — раскрыт документ, где она есть (найденное несёт материал, RV-26).
  const want = useGame((g) => g.find?.for);
  const [open, setOpen] = useState<string | null>(
    (want && docs.find((d) => d.id === want)?.id) || (docs.at(-1)?.id ?? null),
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
