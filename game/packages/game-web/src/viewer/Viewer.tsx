import { type PointerEvent, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useGame } from '../store.ts';

interface ViewerProps {
  materialId: string;
  /** «Прикрепить к доске». */
  onPin?(materialId: string): void;
}

/** Щелчок сразу после открытия — второй щелчок двойного клика, а не «закрыть». */
const OPEN_GUARD_MS = 400;
const INSIDE = '.viewer-paper, .viewer-tools';

/**
 * Просмотрщик материала (TECH_PLAN 4.3). Серый прототип: текст пакета дословно, с переносами
 * строк как в файле (remark-breaks). HTML из текста не исполняется.
 * Закрыть: щелчок мимо листа, крестик у угла листа или Esc. Кнопки — рядом с листом,
 * чтобы мышь ездила как можно меньше. App монтирует его заново для каждого материала (key).
 */
export function Viewer({ materialId, onPin }: ViewerProps) {
  const material = useGame((g) => g.materials.find((m) => m.id === materialId));
  const close = useGame((g) => g.closeViewer);
  const folderOpen = useGame((g) => g.petitionOpen);
  const [pinned, setPinned] = useState(0);
  const openedAt = useRef(Date.now());
  const downOutside = useRef(false);

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
          <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{material.body}</Markdown>
        </article>
        <div className="viewer-tools">
          <button
            type="button"
            className="tool tool-close"
            aria-label="Закрыть"
            title="Закрыть (Esc)"
            onClick={close}
          >
            ✕
          </button>
          {onPin && (
            <button
              type="button"
              className="tool"
              onClick={() => {
                onPin(material.id);
                setPinned((n) => n + 1);
              }}
            >
              Прикрепить к доске
            </button>
          )}
          {pinned > 0 && <span className="viewer-note">Прикреплено</span>}
        </div>
      </div>
    </div>
  );
}
