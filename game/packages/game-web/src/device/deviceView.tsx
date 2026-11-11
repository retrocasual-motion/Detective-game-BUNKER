import { type MouseEvent, useEffect, useState } from 'react';
import { emailIn, quoteCard } from '../petition/drafts.ts';
import { usePetition } from '../petition/petition-store.ts';
import { useGame } from '../store.ts';

/**
 * Общее у экранов устройств (ноутбук 4c-1, телефон 4c-2): устройство стоит в свободном месте
 * между папкой ходатайства и блокнотом (они лежат сверху — правка автора 11.11); выделенная
 * строка на экране — в ходатайство (PT-A).
 */

/** Свободное место по горизонтали: середина и ширина (обновляется, когда папка или блокнот выдвинуты). */
export function useFreeArea() {
  const folderShown = useGame((g) => g.petitionOpen);
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

/** Выделение на экране устройства — кнопка «В ходатайство» (или «В «Кому»» для адреса). */
export function useSelectionPetition(testId: string) {
  const [sel, setSel] = useState<{ text: string; material: string; x: number; y: number } | null>(
    null,
  );
  const folderShown = useGame((g) => g.petitionOpen);
  const toAddress = usePetition((p) => p.field === 'to');

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
  const toPetition = () => {
    if (!sel) return;
    const pet = usePetition.getState();
    const address = emailIn(sel.text);
    if (folderShown && toAddress && address) pet.setTo(address);
    else {
      const card = quoteCard(sel.material, sel.text);
      if (card) pet.addCard(card);
    }
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const button = sel && (
    <button
      type="button"
      className="to-petition"
      data-testid={testId}
      style={{ left: sel.x, top: sel.y + 6 }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={toPetition}
    >
      {folderShown && toAddress && emailIn(sel.text) ? 'В «Кому»' : 'В ходатайство'}
    </button>
  );
  return { onUp, button };
}
