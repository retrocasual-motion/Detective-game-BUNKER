import { useState } from 'react';

const SECTIONS = ['Поступления', 'Почта', 'Приобщить страницу'] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Компьютер следователя (TECH_PLAN 4.7). Пока каркас: разделы наполнят этапы 2
 * (Поступления), 3 (Почта — внутренний режим) и 6 (Приобщить страницу).
 */
export function InvestigatorComputer() {
  const [section, setSection] = useState<Section>('Поступления');
  return (
    <section className="computer" data-testid="computer" aria-label="Компьютер следователя">
      <div className="computer-tabs" role="tablist">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === section}
            data-testid={`computer-tab-${s}`}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="computer-panel" role="tabpanel" data-testid="computer-panel">
        Пусто
      </div>
    </section>
  );
}
