import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { emailIn, quoteCard } from '../petition/drafts.ts';
import { usePetition } from '../petition/petition-store.ts';
import { useGame } from '../store.ts';
import { Desktop } from './Desktop.tsx';
import { buildLaptop } from './files.ts';
import { LockScreen, Welcome } from './LockScreen.tsx';
import './laptop.css';

/** Экран ноутбука, логические px (WXGA, как у ноутбуков 2008 года); на окне — масштабом. */
const SCREEN_W = 1280;
const SCREEN_H = 800;
const BEZEL = 34;

/**
 * Ноутбук руководителя экраном к игроку (4c-1, SCR-C — решения автора 09–10.11): щелчок по
 * экрану ноутбука в руках — он разворачивается и приближается, экран живой. Esc или щелчок мимо
 * ноутбука — снова вещь в руках. Внутри — экран входа (графический ключ) и мини-ОС эпохи (UI-A).
 * Выделили строку в окне — «В ходатайство» (PT-A): карточка из файла ноутбука.
 */
export function LaptopView() {
  const laptop = useGame((g) => g.laptop);
  const materials = useGame((g) => g.materials);
  const lap = useMemo(() => buildLaptop(materials), [materials]);
  // Сеанс: после первого входа ключ не нужен — экран приветствия и «Войти» (правка автора 10.11).
  const [session, setSession] = useState(false);
  // Отошли от ноутбука — сеанс закрыт: в следующий раз снова приветствие и «Войти».
  useEffect(() => {
    if (!laptop) setSession(false);
  }, [laptop]);
  const unlocked = !!lap && session;
  const [scale, setScale] = useState(1);
  const [sel, setSel] = useState<{ text: string; material: string; x: number; y: number } | null>(
    null,
  );
  const folderShown = useGame((g) => g.petitionOpen);
  const toAddress = usePetition((p) => p.field === 'to');

  const notebookShown = useGame((g) => g.notebookOpen);
  // Ноутбук — в свободном месте: папка ходатайства и блокнот лежат сверху и его не закрывают
  // (правка автора 11.11).
  const [centerX, setCenterX] = useState<number | null>(null);
  useEffect(() => {
    const fitScreen = () => {
      const edge = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const left = folderShown ? (edge('.petition')?.right ?? 0) : 0;
      const right = notebookShown
        ? (edge('.notebook')?.left ?? window.innerWidth)
        : window.innerWidth;
      setCenterX((left + right) / 2);
      setScale(
        Math.min(
          (right - left - 40) / (SCREEN_W + BEZEL * 2),
          (window.innerHeight - 40) / (SCREEN_H + BEZEL * 2),
        ),
      );
    };
    fitScreen();
    window.addEventListener('resize', fitScreen);
    return () => window.removeEventListener('resize', fitScreen);
  }, [folderShown, notebookShown]);

  useEffect(() => {
    if (!laptop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useGame.getState().closeLaptop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [laptop]);

  useEffect(() => {
    const onChange = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !s.toString().trim()) setSel(null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  if (!laptop) return null;

  // Выделили текст в окне — кнопка «В ходатайство» у конца выделения (как у листа, K-A).
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

  return (
    <div className="laptop-view" data-testid="laptop-view">
      <button
        type="button"
        className="laptop-backdrop"
        aria-label="Отвести взгляд от экрана"
        data-testid="laptop-away"
        onClick={() => useGame.getState().closeLaptop()}
      />
      <div
        className="laptop-frame"
        style={{
          width: SCREEN_W + BEZEL * 2,
          height: SCREEN_H + BEZEL * 2,
          left: centerX ?? undefined,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <div className="laptop-cam" aria-hidden />
        {/* biome-ignore lint/a11y/noStaticElementInteractions: выделение текста мышью в окнах ноутбука */}
        <div
          className="lap-screen"
          style={{ width: SCREEN_W, height: SCREEN_H }}
          onMouseUp={onUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          {unlocked && lap ? (
            <Desktop lap={lap} material={laptop.material} onLogout={() => setSession(false)} />
          ) : lap ? (
            <Welcome onEnter={() => setSession(true)} />
          ) : (
            <LockScreen onUnlock={() => setSession(true)} />
          )}
        </div>
      </div>
      {sel && (
        <button
          type="button"
          className="to-petition"
          data-testid="laptop-to-petition"
          style={{ left: sel.x, top: sel.y + 6 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toPetition}
        >
          {folderShown && toAddress && emailIn(sel.text) ? 'В «Кому»' : 'В ходатайство'}
        </button>
      )}
    </div>
  );
}
