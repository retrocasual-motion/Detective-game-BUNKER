import { useEffect, useState } from 'react';

const SECTIONS = ['Поступления', 'Почта', 'Приобщить страницу'] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Компьютер следователя (TECH_PLAN 4.7; PC-A): монитор стоит в дальнем углу стола вещдоков.
 * Щелчок по монитору — камера «наезжает»: экран встаёт крупно по центру, на нём значки
 * разделов. Закрыть — ✕, щелчок мимо экрана или Esc. Разделы наполнят этапы 3 (Почта —
 * внутренний режим), 4 (Поступления) и 6 (Приобщить страницу).
 */
export function InvestigatorComputer() {
  const [near, setNear] = useState(false);
  const [section, setSection] = useState<Section | null>(null);

  useEffect(() => {
    if (!near) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNear(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [near]);

  return (
    <section
      className={`computer${near ? ' computer-near' : ''}`}
      data-testid="computer"
      aria-label="Компьютер следователя"
    >
      {near && (
        <button
          type="button"
          className="computer-backdrop"
          aria-label="Отойти от компьютера"
          onClick={() => setNear(false)}
        />
      )}
      <div className="monitor">
        {!near && (
          <button
            type="button"
            className="monitor-approach"
            data-testid="computer-monitor"
            aria-label="Компьютер следователя"
            onClick={() => setNear(true)}
          />
        )}
        <div className="monitor-screen" inert={!near}>
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
        {near && (
          <button
            type="button"
            className="tool tool-close computer-close"
            aria-label="Отойти от компьютера"
            data-testid="computer-close"
            onClick={() => setNear(false)}
          >
            ✕
          </button>
        )}
      </div>
    </section>
  );
}
