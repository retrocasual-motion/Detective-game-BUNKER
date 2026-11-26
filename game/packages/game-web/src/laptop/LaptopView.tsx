import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFindOnScreen, useSelectionCard } from '../device/deviceView.tsx';
import { useGame } from '../store.ts';
import { Desktop } from './Desktop.tsx';
import { buildLaptop } from './files.ts';
import { LockScreen, Welcome } from './LockScreen.tsx';
import './laptop.css';

/** Экран ноутбука, логические px (WXGA, как у ноутбуков 2008 года); на модели — масштабом. */
export const LAPTOP_PX: [number, number] = [1280, 800];

/**
 * Живой экран ноутбука руководителя (4c-1; WM-B — автор 17.11): разметка приклеена к экрану
 * 3D-ноутбука в руках (Held3D, useScreenAnchor) — щелчок по экрану, камера подъезжает, ноутбук
 * остаётся той же вещью. Esc, правая кнопка или щелчок мимо — снова вещь в руках. Внутри — экран
 * входа (графический ключ) и мини-ОС эпохи (UI-A). Выделили строку в окне — «На стену» (и «В заключение», пока открыта форма).
 * Сеанс живёт, пока экран вплотную: отошли — в следующий раз приветствие и «Войти».
 */
export function LaptopLive() {
  const material = useGame((g) => g.laptop?.material ?? null);
  const materials = useGame((g) => g.materials);
  const lap = useMemo(() => buildLaptop(materials), [materials]);
  // Сеанс: после первого входа ключ не нужен — экран приветствия и «Войти» (правка автора 10.11).
  // Открыт на файле (выписка, поиск) — сразу файл, без «Войти» (7.5, автор 21.11): файл уже открывали.
  const [session, setSession] = useState(() => !!useGame.getState().laptop?.material);
  const unlocked = !!lap && session;
  const { onUp, button } = useSelectionCard('laptop-to-folder', 'laptop');
  useFindOnScreen('.held-screen', true);
  const [w, h] = LAPTOP_PX;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: выделение текста мышью в окнах ноутбука
    <div
      className="lap-screen"
      data-testid="laptop-view"
      style={{ width: w, height: h }}
      onMouseUp={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {unlocked && lap ? (
        <Desktop lap={lap} material={material} onLogout={() => setSession(false)} />
      ) : lap ? (
        <Welcome onEnter={() => setSession(true)} />
      ) : (
        <LockScreen onUnlock={() => setSession(true)} />
      )}
      {/* Кнопки у выделения («На стену», «В заключение») — поверх страницы: внутри экрана их бы масштабировало. */}
      {button && createPortal(button, document.body)}
    </div>
  );
}
