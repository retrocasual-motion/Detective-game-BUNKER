import { inboxIds, letterPetition, PERSONS } from '@bunker/shared';
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
import { emailIn, quoteCard, wholeCard } from '../petition/drafts.ts';
import { usePetition } from '../petition/petition-store.ts';
import { clearFind, highlightFind } from '../search/highlight.ts';
import { useGame } from '../store.ts';
import { isLetter, takeOutOfBin } from '../wall/wall-actions.ts';
import { isBundleListing, rowTarget } from './bundles.ts';
import { sameRange, snapToWords, unitRangeAt } from './selectUnit.ts';
import { unwrapLines } from './text.ts';
import { useSheet } from './useSheet.ts';

interface ViewerProps {
  materialId: string;
}

/** Щелчок сразу после открытия — второй щелчок двойного клика, а не «закрыть». */
const OPEN_GUARD_MS = 400;
const INSIDE =
  '.viewer-paper, .viewer-tools, .to-petition, .viewer-closeup, .viewer-stack-hit, .viewer-corner';

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
  // Карточка персонажа — посмотреть поближе (правка автора 09.11).
  const person = PERSONS.find((p) => p.id === materialId);
  const close = useGame((g) => g.closeViewer);
  const folderOpen = useGame((g) => g.petitionOpen);
  // Поиск открыт — панель справа поверх затемнения, лист левее (SR-D).
  const searchOpen = useGame((g) => g.searchOpen);
  const openedAt = useRef(Date.now());
  const downOutside = useRef(false);
  const inInbox = useGame((g) =>
    g.state ? inboxIds(g.state, g.materials).includes(materialId) : false,
  );
  const pinToWall = useGame((g) => g.pinToWall);
  const [pinned, setPinned] = useState(false);
  // Письмо-ответ (этап 3): повторить ходатайство (RP-A), выбросить или достать (TR-A).
  const letter = material && isLetter(material.id) ? material : null;
  const petition = useMemo(() => (letter ? letterPetition(letter.body) : null), [letter]);
  const inTrash = useGame((g) => g.state?.trash.includes(materialId) ?? false);
  const [noRoom, setNoRoom] = useState(false);

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
  // Выделенная строка листа — кнопка «В ходатайство» у её конца (K-A).
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const toAddress = usePetition((p) => p.field === 'to');
  const folderShown = useGame((g) => g.petitionOpen);

  // Выделение «для ходатайства» (SEL-C): щелчок отмечает строку целиком, протягивание — слова.
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

  /** Кнопка «В ходатайство» — у конца выделения, но всегда на экране. */
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

  const toPetition = () => {
    if (!sel) return;
    const pet = usePetition.getState();
    const address = emailIn(sel.text);
    if (folderShown && toAddress && address) pet.setTo(address);
    else {
      const card = quoteCard(materialId, sel.text);
      if (card) pet.addCard(card);
    }
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };
  // Разбор Markdown — один раз на материал, а не на каждое движение мыши (инструменты двигаются).
  const doc = useMemo(() => {
    // У описи пачки строка — своя цель крупного плана: «L985 лист 19–24» (FV-A).
    const components: Components | undefined =
      material && isBundleListing(material.id)
        ? {
            tr: ({ node, ...props }) => {
              const first = node?.children.find(
                (c): c is Extract<typeof c, { type: 'element' }> => c.type === 'element',
              );
              if (first?.tagName !== 'td') return <tr {...props} />;
              return <tr {...props} data-osmotr-target={rowTarget(material.id, textOf(first))} />;
            },
          }
        : undefined;
    return (
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {material ? unwrapLines(material.body) : ''}
      </Markdown>
    );
  }, [material]);

  const { goTo, page } = sheet;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Печатают в поле поиска рядом с листом — стрелки двигают курсор, а не страницы.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') close();
        return;
      }
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(page + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, goTo, page]);

  if (!material && !person) return null;

  const isOutside = (e: PointerEvent<HTMLElement>) =>
    !(e.target instanceof Element && e.target.closest(INSIDE));

  return (
    <div
      className={`viewer${folderOpen ? ' viewer-with-folder' : ''}${searchOpen ? ' viewer-with-search' : ''}`}
      data-testid="viewer"
      role="dialog"
      aria-label={material?.title ?? person?.name}
      onPointerDown={(e) => {
        // Средняя кнопка — как было: лицом, без приближения (как у вещей в руках).
        if (e.button === 1) {
          e.preventDefault();
          sheet.reset();
          return;
        }
        downOutside.current = e.button === 0 && isOutside(e);
      }}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onPointerUp={(e) => {
        // Выделение текста, начатое на листе и законченное снаружи, — не «закрыть».
        if (downOutside.current && isOutside(e) && Date.now() - openedAt.current > OPEN_GUARD_MS)
          close();
        downOutside.current = false;
      }}
      onWheel={(e) => sheet.onWheel(e.clientX, e.clientY, e.deltaY)}
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
        <div className="viewer-tools" data-testid="viewer-tools">
          <button
            type="button"
            className="tool tool-close"
            aria-label="Закрыть"
            title="Закрыть (Esc)"
            onClick={close}
          >
            ✕
          </button>
          {material && (
            <button
              type="button"
              className="tool"
              data-testid="viewer-whole-to-petition"
              title="Материал целиком — карточкой в ходатайство (для фото, аудио, видео, писем)"
              onClick={() => usePetition.getState().addCard(wholeCard(material))}
            >
              В ходатайство целиком
            </button>
          )}
          {petition && (
            <button
              type="button"
              className="tool"
              data-testid="viewer-repeat"
              title="Новый черновик с тем же адресом и карточками — замените ту, что не подошла"
              onClick={() => setNoRoom(!usePetition.getState().repeat(petition))}
            >
              Повторить ходатайство
            </button>
          )}
          {noRoom && (
            <p className="viewer-tools-note" data-testid="viewer-no-room">
              Все черновики заняты — отправьте или выбросьте один.
            </p>
          )}
          {letter && !inTrash && (
            <button
              type="button"
              className="tool"
              data-testid="viewer-to-trash"
              title="Убрать письмо в корзину у стола; в деле оно останется"
              onClick={() => {
                useGame.getState().throwAway(letter.id);
                close();
              }}
            >
              В корзину
            </button>
          )}
          {letter && inTrash && (
            <button
              type="button"
              className="tool"
              data-testid="viewer-from-trash"
              onClick={() => useGame.getState().updateState(takeOutOfBin(letter.id))}
            >
              Достать из корзины
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
      {sheet.closeup && (
        <aside className="viewer-closeup" data-testid="viewer-closeup">
          {sheet.closeup}
        </aside>
      )}
      {sel && material && (
        <button
          type="button"
          className="to-petition"
          data-testid="to-petition"
          style={{ left: sel.x, top: sel.y + 6 }}
          // Кнопка не снимает выделение, пока на неё нажимают.
          onMouseDown={(e) => e.preventDefault()}
          onClick={toPetition}
        >
          {folderShown && toAddress && emailIn(sel.text) ? 'В «Кому»' : 'В ходатайство'}
        </button>
      )}
    </div>
  );
}
