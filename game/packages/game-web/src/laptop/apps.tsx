import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { postAction } from '../api.ts';
import { OFFLINE } from '../lock.ts';
import { NO_LINKS } from '../paperLinks.tsx';
import { useGame } from '../store.ts';
import type { LapFile, Laptop } from './files.ts';

/**
 * Программы ноутбука (4c-1, UI-A): проводник, блокнот, документ, таблица, проигрыватель,
 * браузер, принтер, свойства. Всё — внутри ноутбука (LW-A); текст выделяется для запроса:
 * у содержимого — материал дела (data-material).
 */

const md = (text: string) => (
  <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={NO_LINKS}>
    {text}
  </Markdown>
);

/** Значок файла или папки (рисованный, своего вида). */
export function FileIcon({ type, size = 32 }: { type: string; size?: number }) {
  return (
    <span className={`lap-ico lap-ico-${type}`} style={{ width: size, height: size }} aria-hidden />
  );
}

const TYPE_NAME: Record<string, string> = {
  folder: 'Папка с файлами',
  txt: 'Текстовый документ',
  doc: 'Документ',
  xls: 'Таблица',
  wav: 'Звук (WAV)',
  htm: 'Веб-страница',
};

// ── Проводник ────────────────────────────────────────────────────────────────

export interface ExplorerProps {
  lap: Laptop;
  /** Путь папки: '' — рабочий стол, «Корзина», «Тревога», «Отчёты»… */
  path: string;
  go: (path: string) => void;
  open: (f: LapFile) => void;
  props: (f: LapFile) => void;
}

export function Explorer({ lap, path, go, open, props }: ExplorerProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ f: LapFile; x: number; y: number } | null>(null);
  // История папок окна: «Назад» и «Вперёд», как в проводнике того времени.
  const [hist, setHist] = useState<{ back: string[]; fwd: string[] }>({ back: [], fwd: [] });
  const trash = path === 'Корзина';
  const folder = trash ? null : path ? lap.desktop.find((f) => f.path === path) : null;
  const list: LapFile[] = trash ? lap.trash : path ? (folder?.children ?? []) : lap.desktop;
  const personal = path === 'Личные дела VL-31';
  const crumbs = ['Рабочий стол', ...(path ? [path] : [])];
  const picked = list.find((f) => f.path === sel) ?? null;

  const to = (next: string) => {
    if (next === path) return;
    setHist((h) => ({ back: [...h.back, path], fwd: [] }));
    setSel(null);
    go(next);
  };
  const back = () => {
    const prev = hist.back[hist.back.length - 1];
    if (prev === undefined) return;
    setHist((h) => ({ back: h.back.slice(0, -1), fwd: [path, ...h.fwd] }));
    setSel(null);
    go(prev);
  };
  const fwd = () => {
    const next = hist.fwd[0];
    if (next === undefined) return;
    setHist((h) => ({ back: [...h.back, path], fwd: h.fwd.slice(1) }));
    setSel(null);
    go(next);
  };
  const openHere = (f: LapFile) => (f.type === 'folder' ? to(f.path) : open(f));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: щелчок мимо закрывает меню (мышь; Esc — у окна)
    // biome-ignore lint/a11y/useKeyWithClickEvents: то же — меню мышью, клавиатура закрывает его Esc
    <div className="lap-explorer" onClick={() => setMenu(null)}>
      <MenuBar items={['Файл', 'Правка', 'Вид', 'Избранное', 'Сервис', 'Справка']} />
      <div className="lap-toolbar">
        <button type="button" disabled={!hist.back.length} onClick={back} data-testid="lap-back">
          ← Назад
        </button>
        <button type="button" disabled={!hist.fwd.length} onClick={fwd}>
          →
        </button>
        <button type="button" disabled={!path} onClick={() => to('')} data-testid="lap-up">
          ↑ Вверх
        </button>
      </div>
      <div className="lap-toolbar">
        <span className="lap-label">Адрес</span>
        <div className="lap-address" data-testid="lap-address">
          {crumbs.join(' › ')}
        </div>
      </div>
      <div className="lap-explorer-main">
        <aside className="lap-taskpane">
          <section>
            <h4>Другие места</h4>
            {path !== '' && (
              <button type="button" onClick={() => to('')}>
                <FileIcon type="folder" size={14} /> Рабочий стол
              </button>
            )}
            {!trash && (
              <button type="button" onClick={() => to('Корзина')}>
                <FileIcon type="trash" size={14} /> Корзина
              </button>
            )}
          </section>
          <section>
            <h4>Подробно</h4>
            {picked ? (
              <div className="lap-detail" data-testid="lap-detail">
                <b>{picked.name}</b>
                <span>{TYPE_NAME[picked.type]}</span>
                {picked.modified && <span>Изменён: {picked.modified}</span>}
                {picked.opened && <span>Открыт: {picked.opened}</span>}
                {picked.deleted && <span>Удалён: {picked.deleted}</span>}
              </div>
            ) : (
              <div className="lap-detail">
                <b>{crumbs[crumbs.length - 1]}</b>
                <span>Папка</span>
              </div>
            )}
          </section>
        </aside>
        <div className="lap-files-wrap">
          <table className="lap-files" data-testid="lap-files">
            <thead>
              <tr>
                <th>Имя</th>
                {trash ? (
                  <>
                    <th>Исходное расположение</th>
                    <th>Изменён</th>
                    <th>Удалён</th>
                  </>
                ) : (
                  <>
                    <th>Тип</th>
                    <th>{personal ? 'Открыт' : 'Изменён'}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr
                  key={f.path}
                  className={sel === f.path ? 'lap-row-sel' : undefined}
                  data-testid={`lap-file-${f.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSel(f.path);
                    setMenu(null);
                  }}
                  onDoubleClick={() => openHere(f)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSel(f.path);
                    setMenu({ f, x: e.nativeEvent.offsetX, y: e.currentTarget.offsetTop + 20 });
                  }}
                >
                  <td>
                    <FileIcon type={f.type} size={16} /> {f.name}
                  </td>
                  {trash ? (
                    <>
                      <td>{f.origin}</td>
                      <td>{f.modified}</td>
                      <td>{f.deleted}</td>
                    </>
                  ) : (
                    <>
                      <td>{TYPE_NAME[f.type]}</td>
                      <td>{personal ? f.opened : f.modified}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {menu && (
            <div
              className="lap-menu"
              style={{ left: menu.x + 20, top: menu.y }}
              data-testid="lap-context"
            >
              <button type="button" onClick={() => openHere(menu.f)}>
                <b>Открыть</b>
              </button>
              {/* Свойства — только у медиафайлов (A-251). */}
              {menu.f.type === 'wav' && (
                <button type="button" data-testid="lap-props" onClick={() => props(menu.f)}>
                  Свойства
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="lap-status">Объектов: {list.length}</div>
    </div>
  );
}

// ── Файлы ─────────────────────────────────────────────────────────────────────

export function Notepad({ f }: { f: LapFile }) {
  return (
    <div className="lap-notepad">
      <MenuBar items={['Файл', 'Правка', 'Формат', 'Вид', 'Справка']} />
      <pre className="lap-text" data-material={f.material} data-testid="lap-notepad">
        {f.body}
      </pre>
    </div>
  );
}

export function DocView({ f }: { f: LapFile }) {
  return (
    <div className="lap-docview">
      <MenuBar
        items={['Файл', 'Правка', 'Вид', 'Вставка', 'Формат', 'Сервис', 'Таблица', 'Справка']}
      />
      <div className="lap-ruler" aria-hidden />
      <div className="lap-doc-scroll">
        <div className="lap-page" data-material={f.material} data-testid="lap-doc">
          {md(f.body)}
        </div>
      </div>
    </div>
  );
}

/** Таблица: Markdown — в сетку с буквами столбцов и номерами строк; абзац — строкой поверх ячеек. */
function sheetRows(body: string): string[][] {
  const rows: string[][] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length)
      rows.push([
        para
          .join(' ')
          .replace(/^#+\s*/, '')
          .replace(/\*\*/g, ''),
      ]);
    para = [];
  };
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    if (!l) {
      flush();
      continue;
    }
    if (l.startsWith('|')) {
      flush();
      if (/^\|[\s:|-]+\|$/.test(l)) continue;
      rows.push(
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim()),
      );
    } else para.push(l);
  }
  flush();
  return rows;
}

export function SheetView({ f }: { f: LapFile }) {
  const rows = sheetRows(f.body);
  const cols = Math.max(6, ...rows.map((r) => r.length));
  const letter = (k: number) => String.fromCharCode(65 + k);
  // Выбранная ячейка: имя — в поле слева, содержимое — в строке формул (как в таблицах тех лет).
  const [cell, setCell] = useState({ r: 0, c: 0 });
  const value = rows[cell.r]?.[rows[cell.r]?.length === 1 ? 0 : cell.c] ?? '';
  return (
    <div className="lap-sheetview">
      <MenuBar
        items={[
          'Файл',
          'Правка',
          'Вид',
          'Вставка',
          'Формат',
          'Сервис',
          'Данные',
          'Окно',
          'Справка',
        ]}
      />
      <div className="lap-formula">
        <span className="lap-namebox" data-testid="lap-namebox">
          {letter(cell.c)}
          {cell.r + 1}
        </span>
        <span className="lap-fx">fx</span>
        <span className="lap-formula-text">{value}</span>
      </div>
      <div className="lap-sheet-scroll">
        <table className="lap-grid" data-material={f.material} data-testid="lap-sheet">
          <thead>
            <tr>
              <th />
              {Array.from({ length: cols }, (_, k) => (
                <th key={letter(k)} className={k === cell.c ? 'lap-head-on' : undefined}>
                  {letter(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: строки таблицы — по порядку, не меняются
              <tr key={i}>
                <th className={i === cell.r ? 'lap-head-on' : undefined}>{i + 1}</th>
                {r.length === 1 ? (
                  // Текст строкой поверх ячеек, как в таблицах того времени.
                  <td
                    colSpan={cols}
                    className={`lap-cell-wide${i === cell.r ? ' lap-cell-on' : ''}`}
                    onPointerDown={() => setCell({ r: i, c: 0 })}
                  >
                    {r[0]}
                  </td>
                ) : (
                  Array.from({ length: cols }, (_, k) => (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: столбцы — по порядку
                      key={k}
                      className={i === cell.r && k === cell.c ? 'lap-cell-on' : undefined}
                      onPointerDown={() => setCell({ r: i, c: k })}
                    >
                      {r[k] ?? ''}
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lap-sheettabs" aria-hidden>
        <span className="lap-sheettab lap-sheettab-on">Лист1</span>
        <span className="lap-sheettab">Лист2</span>
        <span className="lap-sheettab">Лист3</span>
      </div>
    </div>
  );
}

const secs = (d = '0:00') => {
  const [m, s] = d.split(':').map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
};
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Проигрыватель: шкала и «Пуск/Пауза»; звука пока нет — под шкалой расшифровка (L561). */
export function Player({ f }: { f: LapFile }) {
  const total = secs(f.duration);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setT((v) => {
        const next = v + (now - last.current) / 1000;
        last.current = now;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);
  return (
    <div className="lap-player" data-testid="lap-player">
      <div className="lap-player-screen">
        <FileIcon type="wav" size={48} />
        <div>{f.name}</div>
      </div>
      <input
        className="lap-seek"
        type="range"
        min={0}
        max={total}
        step={0.1}
        value={t}
        aria-label="Шкала записи"
        onChange={(e) => setT(Number(e.target.value))}
      />
      <div className="lap-player-ctl">
        <button type="button" data-testid="lap-play" onClick={() => setPlaying((p) => !p)}>
          {playing ? '❚❚ Пауза' : '▶ Пуск'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setT(0);
          }}
        >
          ■ Стоп
        </button>
        <span className="lap-time">
          {clock(t)} / {f.duration}
        </span>
      </div>
      <div className="lap-transcript" data-material={f.material}>
        <div className="lap-transcript-note">Звука в сборке пока нет — расшифровка записи:</div>
        {md(f.body)}
      </div>
    </div>
  );
}

/** Свойства файла (только медиа, A-251). */
export function Properties({ f }: { f: LapFile }) {
  return (
    <div className="lap-props" data-testid="lap-properties">
      <div className="lap-props-head">
        <FileIcon type={f.type} size={32} /> {f.name}
      </div>
      <dl>
        <dt>Тип</dt>
        <dd>{TYPE_NAME[f.type]}</dd>
        <dt>Расположение</dt>
        <dd>{f.path.split('/').slice(0, -1).join('/') || 'Рабочий стол'}</dd>
        <dt>Длительность</dt>
        <dd>{f.duration}</dd>
        <dt>Создан</dt>
        <dd>{f.created}</dd>
        <dt>Изменён</dt>
        <dd>{f.modified}</dd>
      </dl>
    </div>
  );
}

/** Принтер кабинета руководителя — журнал печати (L562). */
export function Printer({ lap }: { lap: Laptop }) {
  return (
    <div className="lap-printer" data-material="L562" data-testid="lap-printer">
      <MenuBar items={['Принтер', 'Документ', 'Вид', 'Справка']} />
      <div className="lap-doc-scroll lap-printlog">{md(lap.printLog)}</div>
    </div>
  );
}

// ── Браузер ───────────────────────────────────────────────────────────────────

/**
 * Браузер ноутбука: адресная строка и «Избранное» (четыре закладки, L560). Страница — та же,
 * что у браузера компьютера дела (движок «АДРЕС»); сохранённая страница — без сети.
 */
export function Browser({
  lap,
  saved,
  url: start,
  onUrl,
}: {
  lap: Laptop;
  saved?: LapFile;
  /** Открытый адрес (из сохранения): страница загружается снова. */
  url?: string;
  onUrl?: (url: string) => void;
}) {
  const [url, setUrl] = useState(saved ? `file:///${saved.path}` : '');
  const [page, setPage] = useState<{ body: string; material: string | null } | null>(
    saved ? { body: saved.body, material: saved.material } : null,
  );
  const [typed, setTyped] = useState(url);
  // История страниц: круглые «назад» и «вперёд» слева от адреса (браузеры 2007–2008).
  const [hist, setHist] = useState<{ back: string[]; fwd: string[] }>({ back: [], fwd: [] });
  const visit = (address: string) => {
    if (url) setHist((h) => ({ back: [...h.back, url], fwd: [] }));
    void go(address);
  };

  // Окно из сохранения — та же страница.
  // biome-ignore lint/correctness/useExhaustiveDependencies: только при открытии окна
  useEffect(() => {
    if (start && !saved) void go(start);
  }, []);

  const go = async (address: string) => {
    setUrl(address);
    onUrl?.(address);
    setTyped(address);
    const r = await postAction('АДРЕС', 'браузер', address).catch(() => null);
    const g = useGame.getState();
    if (r?.released.length) g.addFound(r.released, '47', []);
    // Уже открытая страница — из дела: сайт по названию («Сайт vaultline-program.com»); сайт
    // газеты — его архив номеров (закладка, файл 17).
    const host = (address.replace(/^https?:\/\//, '').split('/')[0] ?? address).replace(
      /^www\./,
      '',
    );
    const mats = useGame.getState().materials;
    const m =
      r?.released[0] ??
      mats.find((x) => x.title.includes(host)) ??
      (host === 'silverridge-chronicle.com' ? mats.find((x) => x.id === '17') : undefined);
    if (m) setPage({ body: m.body, material: m.id });
    else
      setPage({
        body: !r ? `${OFFLINE}.` : r.reply && !r.quiet ? r.reply : 'Не удаётся открыть страницу.',
        material: null,
      });
  };

  return (
    <div className="lap-browser" data-testid="lap-browser">
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
        <input
          className="lap-url"
          data-testid="lap-url"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Адрес"
        />
        <button type="submit">Переход</button>
      </form>
      <MenuBar items={['Файл', 'Правка', 'Вид', 'Избранное', 'Сервис', 'Справка']} />
      <div className="lap-favbar">
        <span className="lap-label">Избранное</span>
        {lap.bookmarks.map((b) => (
          <button
            key={b.url}
            type="button"
            className={url === b.url ? 'lap-fav-on' : undefined}
            data-testid={`lap-fav-${b.url.split('/')[0]}`}
            title={b.url}
            onClick={() => visit(b.url)}
          >
            {b.title}
          </button>
        ))}
      </div>
      <div className="lap-tabs" aria-hidden>
        <span className="lap-tab-on">
          {url
            ? url
                .replace(/^file:\/\/\//, '')
                .split('/')
                .pop()
            : 'Пустая страница'}
        </span>
      </div>
      <div className="lap-web" data-material={page?.material ?? undefined} data-testid="lap-web">
        {page ? md(page.body) : <p className="lap-blank">Пустая страница</p>}
      </div>
    </div>
  );
}

function MenuBar({ items }: { items: string[] }) {
  return (
    <div className="lap-menubar" aria-hidden>
      {items.map((i) => (
        <span key={i}>{i}</span>
      ))}
    </div>
  );
}
