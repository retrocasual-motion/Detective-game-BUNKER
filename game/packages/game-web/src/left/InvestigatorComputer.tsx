import { useState } from 'react';

const SECTIONS = ['Поступления', 'Почта', 'Приобщить страницу'] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Компьютер следователя (TECH_PLAN 4.7; LEFT-B): монитор на столе вещдоков, на экране — значки
 * разделов, а не вкладки сайта. Разделы наполнят этапы 3 (Почта — внутренний режим),
 * 4 (Поступления) и 6 (Приобщить страницу).
 */
export function InvestigatorComputer() {
  const [section, setSection] = useState<Section | null>(null);
  return (
    <section className="computer" data-testid="computer" aria-label="Компьютер следователя">
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
      </div>
      <div className="monitor-stand" aria-hidden />
    </section>
  );
}
