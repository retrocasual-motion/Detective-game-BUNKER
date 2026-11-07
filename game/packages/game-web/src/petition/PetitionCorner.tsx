import { useGame } from '../store.ts';

const FIELDS = ['Кому', 'Прошу', 'На основании'] as const;

/**
 * Папка ходатайства (TECH_PLAN 4.11; PET-A, 07.11.2026): уголок внизу слева на всех видах.
 * Щелчок — папка выезжает вверх и остаётся слева, на треть экрана: стол, доска или
 * открытый документ рядом видны и работают. Наполнение (карточки, перетащить улику,
 * выделить текст, адресная книга, отправка) — этап 3; пока поля — пустые места под карточки.
 */
export function PetitionCorner() {
  const open = useGame((g) => g.petitionOpen);
  const setOpen = useGame((g) => g.setPetitionOpen);
  return (
    <div className={`petition${open ? ' petition-open' : ''}`}>
      <button
        type="button"
        className="petition-tab"
        data-testid="petition-corner"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Ходатайство
      </button>
      <section
        className="petition-folder"
        data-testid="petition-folder"
        aria-label="Папка ходатайства"
        inert={!open}
      >
        <button
          type="button"
          className="tool tool-close petition-close"
          aria-label="Закрыть"
          title="Закрыть папку"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
        {FIELDS.map((f) => (
          <fieldset key={f} className="petition-field">
            <legend className="petition-field-name">{f}</legend>
            <div className="petition-slot">сюда — карточка (этап 3)</div>
          </fieldset>
        ))}
      </section>
    </div>
  );
}
