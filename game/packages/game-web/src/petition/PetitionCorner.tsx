import { useGame } from '../store.ts';

const FIELDS = ['Кому', 'Прошу', 'На основании'] as const;

/** Уголок папки ходатайства — всегда внизу экрана (TECH_PLAN 4.11). Наполнение — этап 3. */
export function PetitionCorner() {
  const open = useGame((g) => g.petitionOpen);
  const setOpen = useGame((g) => g.setPetitionOpen);
  return (
    <>
      <button
        type="button"
        className="petition-corner"
        data-testid="petition-corner"
        onClick={() => setOpen(true)}
      >
        Ходатайство
      </button>
      {open && (
        <div className="overlay">
          <div className="petition-folder" data-testid="petition-folder">
            {FIELDS.map((f) => (
              <label key={f}>
                {f}
                <input disabled aria-label={f} />
              </label>
            ))}
            <button type="button" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </>
  );
}
