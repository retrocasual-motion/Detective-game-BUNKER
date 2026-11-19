import { type MouseEvent, useEffect, useState } from 'react';
import { useGame } from '../store.ts';
import { quoteCard, toVerdict, useVerdictOpen } from '../verdict/cards.ts';

/**
 * Общее у экранов устройств (ноутбук 4c-1, телефон 4c-2): устройство стоит в свободном месте
 * между папкой заключения и блокнотом (они лежат сверху — правка автора 11.11); выделенная
 * строка на экране — в заключение, пока открыта его форма (PT-A, FM-A).
 */

/** Свободное место по горизонтали: середина и ширина (обновляется, когда папка или блокнот выдвинуты). */
export function useFreeArea() {
  const folderShown = useGame((g) => g.folderOpen);
  const notebookShown = useGame((g) => g.notebookOpen);
  const [area, setArea] = useState(() => ({
    center: window.innerWidth / 2,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const fitArea = () => {
      const edge = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const left = folderShown ? (edge('.petition')?.right ?? 0) : 0;
      const right = notebookShown
        ? (edge('.notebook')?.left ?? window.innerWidth)
        : window.innerWidth;
      setArea({ center: (left + right) / 2, width: right - left, height: window.innerHeight });
    };
    fitArea();
    window.addEventListener('resize', fitArea);
    return () => window.removeEventListener('resize', fitArea);
  }, [folderShown, notebookShown]);
  return area;
}

/** Выделение на экране устройства — кнопка «В заключение», пока форма открыта. */
export function useSelectionCard(testId: string) {
  const [sel, setSel] = useState<{ text: string; material: string; x: number; y: number } | null>(
    null,
  );
  const verdictOpen = useVerdictOpen();

  useEffect(() => {
    const onChange = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !s.toString().trim()) setSel(null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  const onUp = (e: MouseEvent) => {
    const s = window.getSelection();
    const text = s?.toString() ?? '';
    if (!s || s.isCollapsed || !text.trim()) return;
    const holder = (
      s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement
    )?.closest('[data-material]');
    const material = holder?.getAttribute('data-material');
    if (!material || !e.currentTarget.contains(holder ?? null)) return;
    const r = s.getRangeAt(s.rangeCount - 1).getBoundingClientRect();
    setSel({
      text: text.trim(),
      material,
      x: Math.min(Math.max(r.right, 80), window.innerWidth - 80),
      y: Math.min(Math.max(r.bottom, 0), window.innerHeight - 48),
    });
  };
  const toFolder = () => {
    if (!sel) return;
    toVerdict(quoteCard(sel.material, sel.text));
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const button = sel && verdictOpen && (
    <button
      type="button"
      className="to-petition"
      data-testid={testId}
      style={{ left: sel.x, top: sel.y + 6 }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={toFolder}
    >
      В заключение
    </button>
  );
  return { onUp, button };
}
