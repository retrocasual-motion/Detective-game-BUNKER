import { inboxIds } from '@bunker/shared';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useGame } from '../store.ts';
import { unwrapLines } from './text.ts';

interface ViewerProps {
  materialId: string;
}

/** Щелчок сразу после открытия — второй щелчок двойного клика, а не «закрыть». */
const OPEN_GUARD_MS = 400;
const INSIDE = '.viewer-paper, .viewer-tools';

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
  const close = useGame((g) => g.closeViewer);
  const folderOpen = useGame((g) => g.petitionOpen);
  const openedAt = useRef(Date.now());
  const downOutside = useRef(false);
  const inInbox = useGame((g) =>
    g.state ? inboxIds(g.state, g.materials).includes(materialId) : false,
  );
  const pinToWall = useGame((g) => g.pinToWall);
  const [pinned, setPinned] = useState(false);
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

  if (!material) return null;

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
        <article className="viewer-paper" data-testid="viewer-paper">
          {doc}
        </article>
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
    </div>
  );
}
