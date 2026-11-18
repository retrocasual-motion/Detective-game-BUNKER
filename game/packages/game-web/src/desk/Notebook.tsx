import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../store.ts';
import { canNext, LINE_PX, PAGE_LINES, pagesOf, withPage } from './notebookPages.ts';

/**
 * Блокнот следователя (правки автора 11.11, DV-A): файлы устройств на стену не переносятся — что
 * важно, игрок записывает сам. Язычок внизу справа, выезжает как папка запроса, поверх всего:
 * листа, вещи в руках, ноутбука. Пишут на любой строке (щёлкнул ниже записи — курсор на этой
 * строке); страница кончилась — листают, как настоящий блокнот. Игра записи не читает (P-1).
 * Клавиши остаются в блокноте: цифры не рисуют ключ ноутбука, стрелки не листают лист; Esc
 * закрывает только блокнот; PageUp / PageDown — страницы.
 */
export function Notebook() {
  const open = useGame((g) => g.notebookOpen);
  // Только записи блокнота: подписка на всё состояние перерисовывала блокнот на каждый сдвиг
  // стены и каждое сохранение (R2-09, R3-07).
  const notebook = useGame((g) => g.state?.notebook);
  const notebookPages = useGame((g) => g.state?.notebookPages);
  const hasState = useGame((g) => g.state !== null);
  const pages = pagesOf({ notebook, notebookPages });
  const [page, setPage] = useState<number | null>(null);
  // Открыли — на последней странице с записью.
  const at = Math.min(page ?? lastWritten(pages), pages.length);
  const text = pages[at] ?? '';
  const area = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) area.current?.focus({ preventScroll: true });
  }, [open]);
  // Перелистнули — сразу пишут на новой странице, курсор в конце записи.
  const turned = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: только при смене страницы
  useLayoutEffect(() => {
    if (!turned.current) return;
    turned.current = false;
    const a = area.current;
    a?.focus({ preventScroll: true });
    a?.setSelectionRange(a.value.length, a.value.length);
  }, [at]);

  if (!hasState) return null;
  const setOpen = (v: boolean) => useGame.getState().setNotebookOpen(v);
  const save = (t: string, i = at) =>
    useGame.getState().updateState((s) => ({
      ...s,
      notebook: undefined,
      notebookPages: withPage(pagesOf(s), i, t),
    }));

  /** Сколько строк займёт текст на странице (с переносом по словам). */
  const linesOf = (t: string) => {
    const m = mirror.current;
    if (!m) return t.split('\n').length;
    m.textContent = `${t}​`;
    return Math.round(m.scrollHeight / LINE_PX);
  };
  const go = (i: number) => {
    if (i < 0) return;
    if (i > at && !canNext(pages, at)) return;
    turned.current = true;
    setPage(i);
  };

  // Щелчок ниже записи — курсор на той строке, куда щёлкнули (как ручкой по бумаге).
  // Браузер, щёлкни ниже записи, ставит курсор куда придётся (в первую строку) — такой щелчок
  // разбирает блокнот сам.
  const onDown = (e: MouseEvent<HTMLTextAreaElement>) => {
    if (e.button !== 0 || e.shiftKey) return;
    const a = e.currentTarget;
    const row = Math.floor((e.clientY - a.getBoundingClientRect().top + a.scrollTop) / LINE_PX);
    const last = linesOf(a.value) - 1;
    if (row <= last || row >= PAGE_LINES) return;
    e.preventDefault();
    a.focus({ preventScroll: true });
    const next = a.value + '\n'.repeat(row - last);
    // Сразу в поле и курсор в конце — следующая буква ляжет на эту строку.
    a.value = next;
    a.setSelectionRange(next.length, next.length);
    save(next);
  };

  return (
    <div className={`notebook${open ? ' notebook-open' : ''}`}>
      <button
        type="button"
        className="notebook-tab"
        data-testid="notebook-tab"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Блокнот
      </button>
      <section
        className="notebook-pad"
        data-testid="notebook"
        aria-label="Блокнот следователя"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'PageDown') {
            e.preventDefault();
            go(at + 1);
          } else if (e.key === 'PageUp') {
            e.preventDefault();
            go(at - 1);
          }
        }}
      >
        <div className="notebook-rings" aria-hidden />
        {!open && (
          // Закрытый: торчащий край — открыть (как полоска папки запроса).
          <button
            type="button"
            className="notebook-cover"
            data-testid="notebook-peek"
            aria-label="Открыть блокнот"
            tabIndex={-1}
            onClick={() => setOpen(true)}
          />
        )}
        <div className="notebook-page" inert={!open} style={{ height: PAGE_LINES * LINE_PX }}>
          <textarea
            ref={area}
            key={at}
            className="notebook-text"
            data-testid="notebook-text"
            aria-label={`Записи, страница ${at + 1}`}
            spellCheck={false}
            value={text}
            onMouseDown={onDown}
            onKeyDown={(e) => {
              // Enter на последней строке — новая страница, как в настоящем блокноте.
              const a = e.currentTarget;
              if (
                e.key === 'Enter' &&
                a.selectionStart === a.value.length &&
                linesOf(`${a.value}\n`) > PAGE_LINES
              ) {
                e.preventDefault();
                go(at + 1);
              }
            }}
            onChange={(e) => {
              const t = e.target.value;
              // Страница полна — дальше не пишется (листают вперёд).
              if (t.length > text.length && linesOf(t) > PAGE_LINES) return;
              save(t);
            }}
          />
          <div ref={mirror} className="notebook-text notebook-mirror" aria-hidden />
        </div>
        <div className="notebook-foot" inert={!open}>
          <button
            type="button"
            className="notebook-turn"
            data-testid="notebook-prev"
            aria-label="Предыдущая страница"
            disabled={at === 0}
            onClick={() => go(at - 1)}
          >
            ‹
          </button>
          <span className="notebook-pageno" data-testid="notebook-page">
            {at + 1}
          </span>
          <button
            type="button"
            className="notebook-turn"
            data-testid="notebook-next"
            aria-label="Следующая страница"
            disabled={!canNext(pages, at)}
            onClick={() => go(at + 1)}
          >
            ›
          </button>
        </div>
      </section>
    </div>
  );
}

function lastWritten(pages: readonly string[]) {
  for (let i = pages.length - 1; i >= 0; i--) if (pages[i]) return i;
  return 0;
}
