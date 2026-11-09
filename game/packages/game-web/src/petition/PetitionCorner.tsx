import { type Card, type Draft, type DraftField, MAX_DRAFTS } from '@bunker/shared';
import { useMemo } from 'react';
import { useGame } from '../store.ts';
import { addressBook } from './drafts.ts';
import { usePetition } from './petition-store.ts';

/** Шаг язычков папок в стопке, px. */
const TAB_STEP = 122;
/** Ширина язычка папки, px (совпадает с .folder-tab в app.css). */
const TAB_W = 150;

const LABEL: Record<DraftField, string> = {
  to: 'Кому',
  ask: 'Прошу',
  basis: 'На основании',
};

/** Пустое активное поле подсказывает, как его заполнить (это интерфейс, не подсказка по делу). */
const HINT: Record<DraftField, string> = {
  to: 'выберите адрес из книги ниже или выделите адрес в документе',
  ask: 'выделите строку в документе и нажмите «В ходатайство» или перетащите сюда лист со стены',
  basis: 'выделите строку в документе и нажмите «В ходатайство» или перетащите сюда лист со стены',
};

function CardView({ card }: { card: Card }) {
  return (
    <span className="petition-card" data-testid="petition-card">
      <span className="petition-card-file">{card.file}</span>
      <span className="petition-card-quote">«{card.quote}»</span>
    </span>
  );
}

function Field({ draft, f }: { draft: Draft; f: DraftField }) {
  const active = usePetition((p) => p.field === f);
  const missing = usePetition((p) => p.missing.includes(f));
  const target = usePetition((p) => p.dropTarget === f && f !== 'to');
  const droppable = usePetition((p) => p.dragging && f !== 'to');
  const setActiveField = usePetition((p) => p.setActiveField);
  const clear = usePetition((p) => p.clear);
  const value = draft[f];
  return (
    <div
      className={`petition-field${active ? ' petition-field-active' : ''}${missing ? ' petition-field-missing' : ''}${droppable ? ' petition-field-droppable' : ''}${target ? ' petition-field-target' : ''}`}
      data-petition-field={f}
      data-testid={`petition-field-${f}`}
    >
      <button
        type="button"
        className="petition-line"
        aria-pressed={active}
        onClick={() => setActiveField(f)}
      >
        <span className="petition-field-name">{LABEL[f]}:</span>
        {value ? (
          typeof value === 'string' ? (
            <span className="petition-address">{value}</span>
          ) : (
            <CardView card={value} />
          )
        ) : (
          <span className="petition-blank">{active ? HINT[f] : ''}</span>
        )}
      </button>
      {value && (
        <button
          type="button"
          className="petition-clear"
          aria-label={`Убрать из поля «${LABEL[f]}»`}
          data-testid={`petition-clear-${f}`}
          onClick={() => clear(f)}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Адресная книга (4.7): открывается из поля «Кому»; адреса — из материалов игрока. */
function AddressBook() {
  const materials = useGame((g) => g.materials);
  const setTo = usePetition((p) => p.setTo);
  const book = useMemo(() => addressBook(materials), [materials]);
  return (
    <ul className="address-book" data-testid="address-book" aria-label="Адресная книга">
      {book.map((a) => (
        <li key={a}>
          <button type="button" onClick={() => setTo(a)}>
            {a}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Папка ходатайства (TECH_PLAN 4.11; PET-A; этап 3): уголки внизу слева — по черновику
 * (до трёх). Открытая папка — бланк: «Кому» (адресная книга или выделенный адрес), «Прошу»,
 * «На основании» (карточки K-A: выделить строку → «В ходатайство», или перетащить лист со
 * стены). Номер дела ставится сам. «Отправить» — штамп «Отправлено № N», ответ придёт
 * письмом во «Входящие» на столе (MAIL-B). Ошибка оформления — тут же, письмо не уходит (E-A).
 */
export function PetitionCorner() {
  const open = useGame((g) => g.petitionOpen);
  const drafts = useGame((g) => g.state?.drafts ?? []);
  const activeId = usePetition((p) => p.activeId);
  const field = usePetition((p) => p.field);
  const error = usePetition((p) => p.error);
  const stamp = usePetition((p) => p.stamp);
  const sending = usePetition((p) => p.sending);
  const sentNote = usePetition((p) => p.sentNote);
  const discarded = usePetition((p) => p.discarded);
  const { toggle, close, create, send, deleteDraft, restoreDraft } = usePetition.getState();
  const draft = drafts.find((d) => d.id === activeId) ?? null;

  // Стопка папок (правка автора 09.11): черновики лежат лесенкой за передней папкой, у каждой
  // свой язычок; наведение приподнимает папку, щелчок — достаёт её вперёд.
  const slots = drafts.length ? drafts : [null];
  const frontIndex = Math.max(
    0,
    slots.findIndex((d) => d?.id === activeId),
  );
  const tab = (d: (typeof slots)[number], i: number) => (
    <button
      type="button"
      className={`folder-tab${i === frontIndex ? ' folder-tab-front' : ''}`}
      data-testid={i === 0 ? 'petition-corner' : `petition-corner-${i + 1}`}
      aria-expanded={open && i === frontIndex}
      style={{ left: i * TAB_STEP }}
      onClick={() => toggle(d?.id)}
    >
      {i === 0 ? 'Ходатайство' : `Черновик ${i + 1}`}
    </button>
  );
  const backs = slots
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i !== frontIndex)
    .map(({ d, i }, k) => ({ d, i, depth: k + 1 }));
  return (
    <>
      <div className={`petition${open ? ' petition-open' : ''}`}>
        <div className="petition-stack">
          {backs.map(({ d, i, depth }) => (
            <div
              key={d?.id ?? 'new'}
              className="folder folder-back"
              style={{ ['--depth' as string]: depth, zIndex: 10 - depth }}
            >
              {tab(d, i)}
            </div>
          ))}
          {drafts.length > 0 && drafts.length < MAX_DRAFTS && (
            <button
              type="button"
              className="folder-tab folder-tab-new"
              data-testid="petition-new"
              aria-label="Новое ходатайство"
              title="Новое ходатайство (ещё одна папка в стопке)"
              style={{ left: (drafts.length - 1) * TAB_STEP + TAB_W + 6 }}
              onClick={create}
            >
              +
            </button>
          )}
          <div className="folder folder-front" style={{ ['--depth' as string]: 0, zIndex: 20 }}>
            {tab(slots[frontIndex] ?? null, frontIndex)}
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
                title="Закрыть папку (черновик сохранится)"
                onClick={close}
              >
                ✕
              </button>
              <header className="petition-head">
                <span className="petition-head-title">Ходатайство</span>
                <span className="petition-head-case">дело № 09-1128</span>
              </header>
              {draft && (
                <>
                  {(['to', 'ask', 'basis'] as const).map((f) => (
                    <Field key={f} draft={draft} f={f} />
                  ))}
                  {field === 'to' && <AddressBook />}
                  {error && (
                    <p className="petition-error" data-testid="petition-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="petition-actions">
                    <button
                      type="button"
                      className="petition-send"
                      data-testid="petition-send"
                      disabled={sending || stamp !== null}
                      onClick={() => void send()}
                    >
                      Отправить
                    </button>
                    <button
                      type="button"
                      className="petition-discard"
                      data-testid="petition-discard"
                      onClick={deleteDraft}
                    >
                      Выбросить черновик
                    </button>
                  </div>
                </>
              )}
              {stamp !== null && (
                <div className="petition-stamp" data-testid="petition-stamp" aria-live="polite">
                  Отправлено · № {stamp}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      {discarded && (
        <div className="petition-sent-note" data-testid="petition-discarded" role="status">
          Черновик выброшен
          <button type="button" onClick={restoreDraft}>
            Вернуть
          </button>
        </div>
      )}
      {sentNote && (
        <div className="petition-sent-note" data-testid="petition-sent-note" role="status">
          Ходатайство отправлено. Ответ придёт письмом во «Входящие» на столе.
        </div>
      )}
    </>
  );
}
