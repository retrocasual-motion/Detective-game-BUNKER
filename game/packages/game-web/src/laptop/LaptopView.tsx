import { useEffect, useMemo, useState } from 'react';
import { useFreeArea, useSelectionPetition } from '../device/deviceView.tsx';
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
 * Выделили строку в окне — «В ходатайство» (PT-A): карточка из файла ноутбука. Папка
 * ходатайства и блокнот — сверху, ноутбук — в свободном месте между ними (правка автора 11.11).
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
  const area = useFreeArea();
  const scale = Math.min(
    (area.width - 40) / (SCREEN_W + BEZEL * 2),
    (area.height - 40) / (SCREEN_H + BEZEL * 2),
  );
  const { onUp, button } = useSelectionPetition('laptop-to-petition');

  useEffect(() => {
    if (!laptop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useGame.getState().closeLaptop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [laptop]);

  if (!laptop) return null;

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
          left: area.center || undefined,
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
      {button}
    </div>
  );
}
