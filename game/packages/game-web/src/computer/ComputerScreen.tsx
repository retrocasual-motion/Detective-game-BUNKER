import { useEffect, useState } from 'react';
import { useGame } from '../store.ts';

const SECTIONS = ['Поступления', 'Почта', 'Приобщить страницу'] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Компьютер следователя крупно (TECH_PLAN 4.7): щелчок по монитору на столе — экран встаёт
 * по центру, на нём значки разделов. Закрыть — ✕, щелчок мимо экрана или Esc. Разделы
 * наполнят этапы 3 (Почта — внутренний режим), 4 (Поступления) и 6 (Приобщить страницу).
 */
export function ComputerScreen() {
  const open = useGame((g) => g.computerOpen);
  const setOpen = useGame((g) => g.setComputerOpen);
  const [section, setSection] = useState<Section | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <section className="computer" data-testid="computer" aria-label="Компьютер следователя">
      <button
        type="button"
        className="computer-backdrop"
        aria-label="Отойти от компьютера"
        onClick={() => setOpen(false)}
      />
      <div className="monitor">
        <div className="monitor-screen">
          <div className="desktop-icons">
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="desktop-icon"
                aria-pressed={s === section}
                data-testid={`computer-tab-${s}`}
                onClick={() => setSection(s)}
              >
                <span className="desktop-icon-image" aria-hidden />
                {s}
              </button>
            ))}
          </div>
          {section && (
            <div className="screen-window" role="dialog" aria-label={section}>
              <div className="screen-window-title">
                {section}
                <button type="button" aria-label="Закрыть окно" onClick={() => setSection(null)}>
                  ✕
                </button>
              </div>
              <div className="screen-window-body" data-testid="computer-panel">
                Пусто
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="tool tool-close computer-close"
          aria-label="Отойти от компьютера"
          data-testid="computer-close"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </div>
    </section>
  );
}
