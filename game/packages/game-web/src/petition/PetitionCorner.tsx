import { type Card, type Draft, type DraftField, deviceOf, MAX_DRAFTS } from '@bunker/shared';
import { type PointerEvent, useMemo } from 'react';
import { startGhostDrag } from '../canvas/ghostDrag.ts';
import { buildLaptop, fileOfQuote } from '../laptop/files.ts';
import { useGame, useVisibleMaterials } from '../store.ts';
import { addressBook } from './drafts.ts';
import { petitionFieldAt } from './fieldAt.ts';
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
  ask: 'выделите строку в документе и нажмите «В запрос» или перетащите сюда лист со стены',
  basis: 'выделите строку в документе и нажмите «В запрос» или перетащите сюда лист со стены',
};

/**
 * Карточку в поле можно взять мышью и перетащить в другое поле карточек (правка автора 09.11):
 * в пустое — переходит, с занятым — меняются местами.
 */
function dragCard(e: PointerEvent, card: Card, source: string, from: 'ask' | 'basis') {
  const other = from === 'ask' ? 'basis' : 'ask';
  const pet = usePetition.getState();
  startGhostDrag(e.nativeEvent, {
    label: `${source} · «${card.quote}»`,
    className: 'drag-ghost-paper',
    canDrop: (pt) => {
      const ok = petitionFieldAt(pt.x, pt.y) === other;
      pet.setDrag(true, ok ? other : null);
      return ok;
    },
    onDrop: () => pet.moveCard(from),
    onEnd: () => pet.setDrag(false, null),
    onClick: () => pet.setActiveField(from),
  });
}

/** Откуда карточка: файл на ноутбуке называем файлом, а не служебным номером материала. */
function useCardSource(card: Card): string {
  const materials = useGame((g) => g.materials);
  return useMemo(() => {
    if (deviceOf(card.file) !== '47') return card.file;
    if (card.file === 'L562') return 'Ноутбук · журнал печати';
    const lap = buildLaptop(materials);
    const f = lap && fileOfQuote(lap, card.file, card.quote);
    return f ? `Ноутбук · ${f.name}` : 'Ноутбук';
  }, [card, materials]);
}

function CardView({ card, from }: { card: Card; from: 'ask' | 'basis' }) {
  const source = useCardSource(card);
  return (
    <span
      className="petition-card"
      data-testid="petition-card"
      title="Перетащите в другое поле — карточки поменяются местами"
      onPointerDown={(e) => dragCard(e, card, source, from)}
    >
      <span className="petition-card-file">{source}</span>
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
            <CardView card={value} from={f === 'ask' ? 'ask' : 'basis'} />
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
  // Адреса — только из того, что игрок видит (невскрытые конверты — нет, A-260).
  const materials = useVisibleMaterials();
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
 * Папка запроса (TECH_PLAN 4.11; PET-A; этап 3): уголки внизу слева — по черновику
 * (до трёх). Открытая папка — бланк: «Кому» (адресная книга или выделенный адрес), «Прошу»,
 * «На основании» (карточки K-A: выделить строку → «В запрос», или перетащить лист со
 * стены). Номер дела ставится сам. «Отправить» — штамп «Отправлено № N», ответ придёт
 * письмом во «Входящие» на столе (MAIL-B). Ошибка оформления — тут же, письмо не уходит (E-A).
 */
export function PetitionCorner() {
  const open = useGame((g) => g.petitionOpen);
  const drafts = useGame((g) => g.state?.drafts ?? []);
  const activeId = usePetition((p) => p.activeId);
  const field = usePetition((p) => p.field);
  const error = usePetition((p) => p.error);
  const refusal = usePetition((p) => p.refusal);
  const stamp = usePetition((p) => p.stamp);
  const sending = usePetition((p) => p.sending);
  const sentNote = usePetition((p) => p.sentNote);
  const toMail = usePetition((p) => p.toMail);
  const discarded = usePetition((p) => p.discarded);
  const { toggle, close, create, send, deleteDraft, restoreDraft } = usePetition.getState();
  const draft = drafts.find((d) => d.id === activeId) ?? null;

  // Стопка папок (правка автора 09.11): черновики лежат лесенкой в постоянном порядке — первый
  // спереди, каждый следующий выше и правее. Щелчок по язычку показывает черновик в бланке
  // спереди, папки не переставляются (правка автора 09.11, вечер); язычок выбранного отмечен.
  const slots = drafts.length ? drafts : [null];
  const last = slots.length - 1;
  const canAdd = drafts.length > 0 && drafts.length < MAX_DRAFTS;
  const tab = (d: (typeof slots)[number], i: number) => {
    const active = open && (d?.id ?? null) === (draft?.id ?? null);
    return (
      <button
        type="button"
        className={`folder-tab${active ? ' folder-tab-active' : ''}`}
        data-testid={i === 0 ? 'petition-corner' : `petition-corner-${i + 1}`}
        aria-expanded={active}
        style={{ left: i * TAB_STEP }}
        onClick={() => toggle(d?.id)}
      >
        {i === 0 ? 'Запрос' : `Черновик ${i + 1}`}
      </button>
    );
  };
  const plus = canAdd && (
    <button
      type="button"
      className="folder-tab folder-tab-new"
      data-testid="petition-new"
      aria-label="Новый запрос"
      title="Новый запрос (ещё одна папка в стопке)"
      style={{ left: last * TAB_STEP + TAB_W + 6 }}
      onClick={create}
    >
      +
    </button>
  );
  return (
    <>
      <div className={`petition${open ? ' petition-open' : ''}`}>
        <div className="petition-stack">
          {slots.slice(1).map((d, k) => {
            const i = k + 1;
            return (
              <div
                key={d?.id ?? i}
                className="folder folder-back"
                style={{ ['--depth' as string]: i, zIndex: 20 - i }}
              >
                {tab(d, i)}
                {i === last && plus}
              </div>
            );
          })}
          <div className="folder folder-front" style={{ ['--depth' as string]: 0, zIndex: 20 }}>
            {tab(slots[0] ?? null, 0)}
            {last === 0 && plus}
            <section
              className="petition-folder"
              data-testid="petition-folder"
              aria-label="Папка запроса"
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
                <span className="petition-head-title">
                  {/* На папке — полностью, на ярлычке — коротко «Запрос» (A-265). */}
                  Запрос документов
                  {drafts.length > 1 && draft && (
                    <span className="petition-head-draft" data-testid="petition-head-draft">
                      {drafts.indexOf(draft) + 1} из {drafts.length}
                    </span>
                  )}
                </span>
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
                  {refusal && (
                    <div className="petition-refusal" data-testid="petition-refusal" role="alert">
                      <span className="petition-refusal-mark">Отказ</span>
                      <p>{refusal}</p>
                      <p className="petition-refusal-note">
                        Ответ пришёл сразу, письма не будет. Попытка засчитана.
                      </p>
                    </div>
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
          {toMail
            ? 'Запрос отправлен. Ответ придёт на вашу почту — «Добавить в дело» в письме кладёт его на стол.'
            : 'Запрос отправлен. Ответ придёт письмом во «Входящие» на столе.'}
        </div>
      )}
    </>
  );
}
