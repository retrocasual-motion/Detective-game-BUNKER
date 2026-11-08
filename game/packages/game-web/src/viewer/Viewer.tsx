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
 * Инструменты листа идут за курсором по высоте, пока курсор над листом (UX-D1, MS-1): дочитал
 * низ — кнопка рядом. Когда курсор уходит с листа к кнопкам, они стоят на месте (GAG: точные
 * цели неподвижны, пока к ним ведут курсор).
 */
function useToolsTop() {
  const [top, setTop] = useState(0);
  const onPaperMove = (e: PointerEvent<HTMLElement>) => {
    const stage = e.currentTarget.closest('.viewer-stage');
    const tools = stage?.querySelector('.viewer-tools');
    if (!stage || !tools) return;
    const s = stage.getBoundingClientRect();
    const h = tools.getBoundingClientRect().height;
    const want = e.clientY - s.top - h / 2;
    setTop(Math.round(Math.min(Math.max(0, want), Math.max(0, s.height - h))));
  };
  return { top, onPaperMove };
}

/**
 * Просмотрщик материала (TECH_PLAN 4.3). Серый прототип: текст пакета дословно; строки внутри
 * абзаца склеены (unwrapLines, UX-C1), остальные переносы — как в файле (remark-breaks).
 * HTML из текста не исполняется.
 * Закрыть: щелчок мимо листа, крестик у края листа или Esc. Кнопки — у края листа на высоте
 * курсора (UX-D1), чтобы мышь ездила как можно меньше. App монтирует его заново для каждого материала (key).
 */
export function Viewer({ materialId }: ViewerProps) {
  const material = useGame((g) => g.materials.find((m) => m.id === materialId));
  const close = useGame((g) => g.closeViewer);
  const folderOpen = useGame((g) => g.petitionOpen);
  const openedAt = useRef(Date.now());
  const downOutside = useRef(false);
  const tools = useToolsTop();
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
        <article
          className="viewer-paper"
          data-testid="viewer-paper"
          onPointerMove={tools.onPaperMove}
        >
          {doc}
        </article>
        <div className="viewer-tools" data-testid="viewer-tools" style={{ top: tools.top }}>
          <button
            type="button"
            className="tool tool-close"
            aria-label="Закрыть"
            title="Закрыть (Esc)"
            onClick={close}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
