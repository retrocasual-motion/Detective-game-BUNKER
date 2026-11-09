import { inboxIds, PERSONS } from '@bunker/shared';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { emailIn, quoteCard, wholeCard } from '../petition/drafts.ts';
import { usePetition } from '../petition/petition-store.ts';
import { useGame } from '../store.ts';
import { unwrapLines } from './text.ts';

interface ViewerProps {
  materialId: string;
}

/** Щелчок сразу после открытия — второй щелчок двойного клика, а не «закрыть». */
const OPEN_GUARD_MS = 400;
const INSIDE = '.viewer-paper, .viewer-tools, .to-petition';

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
  const openedAt = useRef(Date.now());
  const downOutside = useRef(false);
  const inInbox = useGame((g) =>
    g.state ? inboxIds(g.state, g.materials).includes(materialId) : false,
  );
  const pinToWall = useGame((g) => g.pinToWall);
  const [pinned, setPinned] = useState(false);
  // Выделенная строка листа — кнопка «В ходатайство» у её конца (K-A).
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const toAddress = usePetition((p) => p.field === 'to');
  const folderShown = useGame((g) => g.petitionOpen);

  useEffect(() => {
    const onChange = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !s.toString().trim()) setSel(null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  const onPaperUp = (e: PointerEvent<HTMLElement>) => {
    const s = window.getSelection();
    const text = s?.toString() ?? '';
    if (!s || s.isCollapsed || !text.trim() || !e.currentTarget.contains(s.anchorNode)) return;
    const r = s.getRangeAt(s.rangeCount - 1).getBoundingClientRect();
    // Кнопка — у конца выделения, но всегда на экране.
    const x = Math.min(Math.max(r.right, 80), window.innerWidth - 80);
    const y = Math.min(Math.max(r.bottom, 0), window.innerHeight - 48);
    setSel({ text, x, y });
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
  const doc = useMemo(
    () => (
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>
        {material ? unwrapLines(material.body) : ''}
      </Markdown>
    ),
    [material],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!material && !person) return null;

  const isOutside = (e: PointerEvent<HTMLElement>) =>
    !(e.target instanceof Element && e.target.closest(INSIDE));

  return (
    <div
      className={`viewer${folderOpen ? ' viewer-with-folder' : ''}`}
      data-testid="viewer"
      onPointerDown={(e) => {
        downOutside.current = isOutside(e);
      }}
      onPointerUp={(e) => {
        // Выделение текста, начатое на листе и законченное снаружи, — не «закрыть».
        if (downOutside.current && isOutside(e) && Date.now() - openedAt.current > OPEN_GUARD_MS)
          close();
        downOutside.current = false;
      }}
    >
      <div className="viewer-stage">
        {person ? (
          <article className="viewer-paper viewer-person" data-testid="viewer-paper">
            <div className="viewer-person-photo" aria-hidden />
            <h1 className="viewer-person-name">{person.name}</h1>
            <p className="viewer-person-role">{person.role}</p>
          </article>
        ) : (
          <article className="viewer-paper" data-testid="viewer-paper" onPointerUp={onPaperUp}>
            {doc}
          </article>
        )}
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
