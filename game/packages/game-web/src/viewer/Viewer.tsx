import { EPILOGUE_ID, inboxIds, PERSONS, PIECES } from '@bunker/shared';
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { trackReading } from '../dev/readingLog.ts';
import { wheelIntent } from '../input.ts';
import { useMenu } from '../menu/menu-store.ts';
import { NO_LINKS, remarkSites } from '../paperLinks.tsx';
import { MediaPlayer } from '../player/MediaPlayer.tsx';
import { EMBEDDED_MEDIA, MEDIA_IDS, splitEmbedded } from '../player/media.ts';
import { clearFind, highlightFind } from '../search/highlight.ts';
import { useGame } from '../store.ts';
import { quoteCard, toVerdict, useVerdictOpen, wholeCard } from '../verdict/cards.ts';
import { excerptBody, isBundleListing, rowTarget } from './bundles.ts';
import { splitSection } from './pieces.ts';
import { sameRange, snapToWords, unitRangeAt } from './selectUnit.ts';
import { unwrapLines } from './text.ts';
import { useSheet } from './useSheet.ts';

interface ViewerProps {
  materialId: string;
}

/** Щелчок сразу после открытия — второй щелчок двойного клика, а не «закрыть». */
const OPEN_GUARD_MS = 400;
const INSIDE =
  '.viewer-paper, .viewer-tools, .to-petition, .viewer-closeup, .viewer-stack-hit, .viewer-corner, .desk-run';

/** Текст узла разметки (первая ячейка строки описи пачки). */
type TextNode = { type: string; value?: string; children?: TextNode[] };
const textOf = (n: TextNode): string =>
  n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(textOf).join('');

/**
 * Просмотрщик материала (TECH_PLAN 4.3). Серый прототип: текст пакета дословно; строки внутри
 * абзаца склеены (unwrapLines, UX-C1), остальные переносы — как в файле (remark-breaks).
 * HTML из текста не исполняется.
 * Закрыть: щелчок мимо листа, крестик у верхнего правого угла листа (неподвижно —
 * правка автора 09.11: движущийся крестик отвлекал от чтения) или Esc. Лист из «Входящих» —
 * кнопка «На стену» под крестиком. App монтирует его заново для каждого материала (key).
 */
export function Viewer({ materialId }: ViewerProps) {
  const material = useGame((g) => g.materials.find((m) => m.id === materialId));
  // Папка, вытащенная из пачки, — только её листы из описи (до отдельного документа, DS-A).
  const excerpt = useGame((g) => g.excerpt);
  // Обрывок, вложенный в этот материал (SRC-A): лежит в листе отдельно, его можно вынуть.
  const piece = material ? PIECES.find((p) => p.from === material.id) : undefined;
  const pieceTaken = useGame((g) => !!piece && !!g.state?.pieces?.includes(piece.key));
  // Карточка персонажа — посмотреть поближе (правка автора 09.11).
  const person = PERSONS.find((p) => p.id === materialId);
  const close = useGame((g) => g.closeViewer);
  const folderOpen = useGame((g) => g.folderOpen);
  const verdictOpen = useVerdictOpen();
  const notebookOpen = useGame((g) => g.notebookOpen);
  // Поиск открыт — панель справа поверх затемнения, лист левее (SR-D).
  const searchOpen = useGame((g) => g.searchOpen);
  const openedAt = useRef(Date.now());
  const downOutside = useRef(false);
  // Читают стол подряд (DC-B): какой это лист по счёту, оставлен ли на столе.
  const run = useGame((g) => g.deskRun);
  const runAt = run ? run.ids.indexOf(materialId) : -1;
  const kept = !!run?.keep.includes(materialId);
  const inInbox = useGame((g) =>
    g.state ? inboxIds(g.state, g.materials).includes(materialId) : false,
  );
  const pinToWall = useGame((g) => g.pinToWall);
  const [pinned, setPinned] = useState(false);

  // Лист в руках (этап 4b): страницы, переворот, приближение — useSheet.
  const zoomRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => ({ zoom: zoomRef, pages: pagesRef, flow: flowRef }), []);
  const sheet = useSheet(material ? material.id : null, refs);
  const { showX } = sheet;

  // Открыт из поиска (RD-C): найденное подсвечено, лист — на странице с ним.
  const find = useGame((g) => g.find);
  useEffect(() => {
    const paper = document.querySelector('[data-testid="viewer-paper"]');
    if (find && paper) {
      const r = highlightFind(paper, find.q, find.k);
      if (r) requestAnimationFrame(() => showX(r.getBoundingClientRect().left + 1));
    }
    return clearFind;
  }, [find, showX]);

  // Время чтения (RD-A) — только в разработке.
  useEffect(() => (import.meta.env.DEV ? trackReading(materialId) : undefined), [materialId]);
  // Выделенная строка листа — кнопка «В заключение» у её конца, пока форма открыта (K-A, FM-A).
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);

  // Выделение строки (SEL-C): щелчок отмечает строку целиком, протягивание — слова.
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const marked = useRef<Range | null>(null);

  useEffect(() => {
    const onChange = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !s.toString().trim()) setSel(null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  /** Кнопка «В заключение» — у конца выделения, но всегда на экране. */
  const showButton = (paper: Element) => {
    const s = window.getSelection();
    const text = s?.toString() ?? '';
    if (!s || s.isCollapsed || !text.trim() || !paper.contains(s.anchorNode)) return;
    const r = s.getRangeAt(s.rangeCount - 1).getBoundingClientRect();
    const x = Math.min(Math.max(r.right, 80), window.innerWidth - 80);
    const y = Math.min(Math.max(r.bottom, 0), window.innerHeight - 48);
    setSel({ text, x, y });
  };

  const select = (r: Range) => {
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  };

  /** Протянули мышью — края выделения до целых слов. */
  const onPaperUp = (e: PointerEvent<HTMLElement>) => {
    const d = downAt.current;
    downAt.current = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    const s = window.getSelection();
    if (!s || s.isCollapsed || !e.currentTarget.contains(s.anchorNode)) return;
    const r = s.getRangeAt(0).cloneRange();
    snapToWords(r);
    select(r);
    marked.current = null;
    showButton(e.currentTarget);
  };

  /** Щелчок — строка целиком; щелчок по отмеченной строке снимает отметку. Двойной — слово. */
  const onPaperClick = (e: MouseEvent<HTMLElement>) => {
    const paper = e.currentTarget;
    if (e.detail > 1) {
      showButton(paper);
      return;
    }
    const s = window.getSelection();
    // Щелчок в конце протягивания — уже разобран в onPaperUp.
    if (s && !s.isCollapsed && !marked.current) return;
    const r = unitRangeAt(paper, e.clientX, e.clientY);
    if (!r || sameRange(marked.current, r)) {
      s?.removeAllRanges();
      marked.current = null;
      setSel(null);
      return;
    }
    select(r);
    marked.current = r;
    showButton(paper);
  };

  const toFolder = () => {
    if (!sel) return;
    toVerdict(quoteCard(materialId, sel.text));
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };
  // Разбор Markdown — один раз на материал, а не на каждое движение мыши (инструменты двигаются).
  const doc = useMemo(() => {
    // У описи пачки строка — своя цель крупного плана: «L985 лист 19–24» (FV-A).
    const components: Components =
      material && isBundleListing(material.id)
        ? {
            ...NO_LINKS,
            tr: ({ node, ...props }) => {
              const first = node?.children.find(
                (c): c is Extract<typeof c, { type: 'element' }> => c.type === 'element',
              );
              if (first?.tagName !== 'td') return <tr {...props} />;
              return <tr {...props} data-osmotr-target={rowTarget(material.id, textOf(first))} />;
            },
          }
        : NO_LINKS;
    const md = (text: string) => (
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks, remarkSites]} components={components}>
        {unwrapLines(text)}
      </Markdown>
    );
    if (!material) return md('');
    // Записи — плеером там, где лежат (4d, PL-A): фильм, ролики, голосовая почта, кассета.
    if (MEDIA_IDS.has(material.id) && !excerpt && !piece)
      return <MediaPlayer materialId={material.id} body={material.body} />;
    // Запись внутри страницы (L163 — фильм на сайте): страница как есть, раздел — плеером.
    const embedded = EMBEDDED_MEDIA[material.id];
    const parts = embedded && !excerpt && !piece ? splitEmbedded(material.body, embedded) : null;
    if (parts)
      return (
        <>
          {md(parts.before)}
          <MediaPlayer materialId={material.id} body={parts.section} />
          {md(parts.after)}
        </>
      );
    if (excerpt?.section !== undefined)
      return md(`# ${excerpt.title}\n\n${splitSection(material.body, excerpt.section).section}`);
    if (excerpt) return md(excerptBody(material.body, excerpt.title, excerpt.from, excerpt.to));
    if (!piece) return md(material.body);
    const { rest, section } = splitSection(material.body, piece.section);
    return (
      <>
        {md(rest)}
        {pieceTaken ? (
          <p className="sheet-piece-gone" data-testid="sheet-piece-gone">
            {piece.section}: вынут, висит на стене.
          </p>
        ) : (
          // biome-ignore lint/a11y/useSemanticElements: обрывок — бумага в листе, кнопка поверх текста
          <div
            className="sheet-piece"
            data-testid="sheet-piece"
            role="button"
            tabIndex={0}
            aria-label="Вынуть обрывок"
            title="Вынуть обрывок"
            onClick={() => useGame.getState().takePiece(piece.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') useGame.getState().takePiece(piece.key);
            }}
          >
            {md(section)}
          </div>
        )}
      </>
    );
  }, [material, excerpt, piece, pieceTaken]);

  const { goTo, page } = sheet;
  // Эпилог (автор 17.11): закрыть нельзя — только «Завершить дело»; вернуться к делу — из меню.
  const final = materialId === EPILOGUE_ID;
  const dismiss = useMemo(() => (final ? () => undefined : close), [final, close]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Печатают в поле поиска рядом с листом — стрелки двигают курсор, а не страницы.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') dismiss();
        return;
      }
      if (e.key === 'Escape') dismiss();
      // Последняя страница — дальше следующий лист стола (DC-B); первая — назад, предыдущий.
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (page < sheet.pages - 1 || runAt < 0) goTo(page + 1);
        else useGame.getState().deskStep(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (page > 0 || runAt < 0) goTo(page - 1);
        else useGame.getState().deskStep(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss, goTo, page, sheet.pages, runAt]);

  if (!material && !person) return null;

  const isOutside = (e: PointerEvent<HTMLElement>) =>
    !(e.target instanceof Element && e.target.closest(INSIDE));

  return (
    <div
      className={`viewer${final ? ' viewer-final' : ''}${folderOpen ? ' viewer-with-folder' : ''}${searchOpen ? ' viewer-with-search' : ''}${notebookOpen ? ' viewer-with-notebook' : ''}`}
      data-testid="viewer"
      role="dialog"
      aria-label={excerpt?.title ?? material?.title ?? person?.name}
      onPointerDown={(e) => {
        // Правая кнопка — как было, без приближения; зажатое колесо — сдвинуть приближённый лист
        // (правка автора 10.11, как у вещей в руках).
        if (e.button === 2) {
          e.preventDefault();
          sheet.reset();
          return;
        }
        if (e.button === 1) {
          e.preventDefault();
          let at = { x: e.clientX, y: e.clientY };
          const move = (ev: globalThis.PointerEvent) => {
            sheet.pan(ev.clientX - at.x, ev.clientY - at.y);
            at = { x: ev.clientX, y: ev.clientY };
          };
          const stop = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', stop);
          return;
        }
        downOutside.current = e.button === 0 && isOutside(e);
      }}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerUp={(e) => {
        // Выделение текста, начатое на листе и законченное снаружи, — не «закрыть».
        if (downOutside.current && isOutside(e) && Date.now() - openedAt.current > OPEN_GUARD_MS)
          dismiss();
        downOutside.current = false;
      }}
      onWheel={(e) => {
        // Тачпад (TP-C): два пальца — сдвинуть приближённый лист, щипок — приблизить.
        const intent = wheelIntent(e);
        if ('pan' in intent) sheet.pan(-intent.pan[0], -intent.pan[1]);
        else sheet.onWheel(e.clientX, e.clientY, intent.zoom);
      }}
    >
      <div className="viewer-stage">
        <div
          ref={zoomRef}
          className="viewer-zoom"
          style={{
            transform: `translate(${sheet.zoom.tx}px, ${sheet.zoom.ty}px) scale(${sheet.zoom.s})`,
          }}
        >
          <div
            className="viewer-flip"
            data-testid="viewer-flip"
            style={
              {
                transform: `rotateX(${sheet.tilt.x}deg) rotateY(${sheet.tilt.y}deg)`,
                // Блик там, где мышь; наклон к курсору — лист «живой», как карточка.
                '--gx': `${sheet.tilt.gx}%`,
                '--gy': `${sheet.tilt.gy}%`,
              } as CSSProperties
            }
          >
            {sheet.pages > 1 && (
              <div className="viewer-stack" aria-hidden>
                {/* Следующие страницы — справа, прочитанные — слева; ключ — номер страницы. */}
                {[1, 2, 3]
                  .filter((d) => sheet.page + d < sheet.pages)
                  .map((d) => (
                    <span
                      key={`next-${sheet.page + d}`}
                      className="viewer-stack-sheet"
                      style={{ '--k': d } as CSSProperties}
                    />
                  ))}
                {[1, 2, 3]
                  .filter((d) => sheet.page - d >= 0)
                  .map((d) => (
                    <span
                      key={`read-${sheet.page - d}`}
                      className="viewer-stack-sheet viewer-stack-read"
                      style={{ '--k': d } as CSSProperties}
                    />
                  ))}
              </div>
            )}
            {sheet.pages > 1 && sheet.page < sheet.pages - 1 && (
              <button
                type="button"
                className="viewer-stack-hit viewer-stack-next"
                data-testid="page-next"
                aria-label="Следующая страница"
                onClick={() => sheet.goTo(sheet.page + 1)}
              />
            )}
            {sheet.pages > 1 && sheet.page > 0 && (
              <button
                type="button"
                className="viewer-stack-hit viewer-stack-prev"
                data-testid="page-prev"
                aria-label="Предыдущая страница"
                onClick={() => sheet.goTo(sheet.page - 1)}
              />
            )}
            {person ? (
              <article className="viewer-paper viewer-person" data-testid="viewer-paper">
                <div className="viewer-person-photo" aria-hidden />
                <h1 className="viewer-person-name">{person.name}</h1>
                <p className="viewer-person-role">{person.role}</p>
              </article>
            ) : (
              // biome-ignore lint/a11y/useKeyWithClickEvents: щелчок отмечает строку мышью (SEL-C); с клавиатуры — обычное выделение Shift+стрелки
              <article
                className="viewer-paper"
                data-testid="viewer-paper"
                data-kind={material?.kind}
                onPointerDown={(e) => {
                  downAt.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerUp={onPaperUp}
                onClick={onPaperClick}
              >
                <div ref={pagesRef} className="viewer-pages">
                  <div ref={flowRef} className="viewer-flow">
                    {doc}
                  </div>
                </div>
                {sheet.pages > 1 && (
                  <span className="viewer-page-no" data-testid="page-no">
                    {sheet.page + 1} / {sheet.pages}
                  </span>
                )}
              </article>
            )}
            {/* Эпилог (A-271): прочитали — «Завершить дело» прямо под статьёй → титры → меню. */}
            {final && (
              <button
                type="button"
                className="finish-case"
                data-testid="finish-case"
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                  useMenu.getState().go('credits');
                }}
              >
                Завершить дело
              </button>
            )}
            {/* Уголки — вне листа: их зона щелчка выходит за край на торчащую стопку. */}
            {!person && (
              <>
                {sheet.page > 0 && (
                  <button
                    type="button"
                    className="viewer-corner viewer-corner-prev"
                    data-testid="page-corner-prev"
                    aria-label="Предыдущая страница"
                    onClick={(e) => {
                      e.stopPropagation();
                      sheet.goTo(sheet.page - 1);
                    }}
                  />
                )}
                {sheet.page < sheet.pages - 1 && (
                  <button
                    type="button"
                    className="viewer-corner viewer-corner-next"
                    data-testid="page-corner"
                    aria-label="Следующая страница"
                    onClick={(e) => {
                      e.stopPropagation();
                      sheet.goTo(sheet.page + 1);
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
        <div className="viewer-tools" data-testid="viewer-tools" hidden={final}>
          <button
            type="button"
            className="tool tool-close"
            aria-label="Закрыть"
            title="Закрыть (Esc)"
            onClick={close}
          >
            ✕
          </button>
          {verdictOpen && material && materialId !== EPILOGUE_ID && (
            <button
              type="button"
              className="tool"
              data-testid="viewer-whole-to-folder"
              title="Материал целиком — карточкой в заключение (для фото, аудио, видео)"
              onClick={() => toVerdict(wholeCard(material))}
            >
              В заключение целиком
            </button>
          )}
          {(inInbox || pinned) && (
            <button
              type="button"
              className="tool"
              data-testid="viewer-to-wall"
              disabled={pinned}
              onClick={() => {
                pinToWall(materialId);
                setPinned(true);
              }}
            >
              {pinned ? 'На стене' : 'На стену'}
            </button>
          )}
        </div>
      </div>
      {run && runAt >= 0 && (
        <div className="desk-run" data-testid="desk-run">
          <span className="desk-run-count" data-testid="desk-run-count">
            Со стола · {runAt + 1} из {run.ids.length}
          </span>
          <span className="desk-run-nav">
            <button
              type="button"
              className="tool"
              data-testid="desk-prev"
              aria-label="Предыдущий лист"
              title="Предыдущий лист (←)"
              disabled={runAt === 0}
              onClick={() => useGame.getState().deskStep(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="tool"
              data-testid="desk-next"
              aria-label="Следующий лист"
              title="Следующий лист (→)"
              disabled={runAt === run.ids.length - 1}
              onClick={() => useGame.getState().deskStep(1)}
            >
              ›
            </button>
          </span>
          <button
            type="button"
            className="tool"
            data-testid="desk-keep"
            aria-pressed={kept}
            onClick={() => useGame.getState().toggleKeep()}
          >
            {kept ? 'Остаётся на столе' : 'Оставить на столе'}
          </button>
          <small className="desk-run-hint">
            {kept ? 'Лист останется на столе.' : 'Закроете — прочитанное повиснет на стене.'}
          </small>
        </div>
      )}
      {sheet.closeup && (
        <aside className="viewer-closeup" data-testid="viewer-closeup">
          {sheet.closeup}
        </aside>
      )}
      {sel && material && verdictOpen && (
        <button
          type="button"
          className="to-petition"
          data-testid="to-folder"
          style={{ left: sel.x, top: sel.y + 6 }}
          // Кнопка не снимает выделение, пока на неё нажимают.
          onMouseDown={(e) => e.preventDefault()}
          onClick={toFolder}
        >
          В заключение
        </button>
      )}
    </div>
  );
}
