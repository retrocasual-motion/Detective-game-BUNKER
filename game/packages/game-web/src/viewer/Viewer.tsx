import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useGame } from '../store.ts';

interface ViewerProps {
  materialId: string;
  /** «Прикрепить к доске» — подключает доска (Task 7). */
  onPin?(materialId: string): void;
}

/**
 * Просмотрщик материала на весь экран (TECH_PLAN 4.3). Серый прототип: текст пакета
 * дословно, как «бумага», с переносами строк как в файле пакета (remark-breaks): строки
 * шапок и пунктов в пакете стоят отдельно. HTML из текста не исполняется.
 */
export function Viewer({ materialId, onPin }: ViewerProps) {
  const material = useGame((g) => g.materials.find((m) => m.id === materialId));
  const close = useGame((g) => g.closeViewer);
  const [pinned, setPinned] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!material) return null;

  return (
    <div className="viewer" data-testid="viewer">
      <div className="viewer-bar">
        <span className="viewer-title">
          {material.id}. {material.title}
        </span>
        {pinned > 0 && <span className="viewer-note">Прикреплено к доске</span>}
        {onPin && (
          <button
            type="button"
            onClick={() => {
              onPin(material.id);
              setPinned((n) => n + 1);
            }}
          >
            Прикрепить к доске
          </button>
        )}
        <button type="button" onClick={close}>
          Закрыть
        </button>
      </div>
      <article className="viewer-paper" data-testid="viewer-paper">
        <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{material.body}</Markdown>
      </article>
    </div>
  );
}
