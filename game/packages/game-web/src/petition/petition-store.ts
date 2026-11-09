import { type Card, type Draft, type DraftField, MAX_DRAFTS } from '@bunker/shared';
import { create } from 'zustand';
import { postPetition } from '../api.ts';
import { useGame } from '../store.ts';
import {
  addDraft,
  dropEmptyDrafts,
  emailIn,
  missingFields,
  removeDraft,
  setField,
  swapCards,
} from './drafts.ts';

/** Сколько видно штамп «Отправлено», прежде чем папка уедет, мс. */
export const STAMP_MS = 1400;
/** Сколько видна записка «Ответ придёт во «Входящие»», мс. */
const SENT_NOTE_MS = 6000;
/** Сколько можно «Вернуть» выброшенный черновик, мс. */
const UNDO_MS = 6000;

interface PetitionStore {
  /** Черновик в открытой папке. */
  activeId: string | null;
  /** Активное поле: сюда ляжет следующая карточка (K-A). */
  field: DraftField | null;
  /** Ошибка оформления (E-A, FORM-B) — под полями, письмо не ушло. */
  error: string | null;
  /** Общий отказ адресата пришёл сразу (PRE-B): письма нет, попытка засчитана. */
  refusal: string | null;
  /** Пустые поля при попытке отправить — подсвечены. */
  missing: DraftField[];
  /** Штамп «Отправлено № N» на бланке. */
  stamp: number | null;
  sending: boolean;
  /** Записка после отправки: ответ придёт во «Входящие». */
  sentNote: boolean;
  /** Над папкой тянут лист или письмо — поля «Прошу» и «На основании» ждут его. */
  dragging: boolean;
  /** Поле под курсором — подсвечено: сюда ляжет карточка. */
  dropTarget: DraftField | null;
  setDrag(dragging: boolean, target: DraftField | null): void;
  /** Выброшенный черновик — его можно «Вернуть» несколько секунд (UN-1). */
  discarded: Draft | null;
  restoreDraft(): void;
  /** Открыть папку: черновик по id, иначе первый, иначе новый. */
  open(id?: string): void;
  /** Новый черновик (не больше трёх). */
  create(): void;
  close(): void;
  toggle(id?: string): void;
  setActiveField(f: DraftField): void;
  /** Карточка — в активное поле (или в первое пустое «Прошу»/«На основании»); папка откроется. */
  addCard(card: Card): void;
  /** Адрес — в «Кому» (из книги или выделения). */
  setTo(address: string): void;
  clear(f: DraftField): void;
  /** Карточку перетащили в другое поле: переходит или меняется местами с той, что там. */
  moveCard(from: 'ask' | 'basis'): void;
  deleteDraft(): void;
  send(): Promise<void>;
}

const newId = () => crypto.randomUUID();

export const usePetition = create<PetitionStore>((set, get) => {
  const game = () => useGame.getState();
  const draft = () => game().state?.drafts.find((d) => d.id === get().activeId) ?? null;
  const firstEmpty = (): DraftField => {
    const d = draft();
    return !d?.to ? 'to' : !d.ask ? 'ask' : !d.basis ? 'basis' : 'ask';
  };

  return {
    activeId: null,
    field: null,
    error: null,
    refusal: null,
    missing: [],
    stamp: null,
    sending: false,
    sentNote: false,
    discarded: null,
    dragging: false,
    dropTarget: null,

    setDrag(dragging, target) {
      if (get().dragging !== dragging || get().dropTarget !== target)
        set({ dragging, dropTarget: target });
    },

    open(id) {
      const s = game().state;
      if (!s) return;
      let target = id ?? get().activeId ?? s.drafts[0]?.id ?? null;
      if (!target || !s.drafts.some((d) => d.id === target)) {
        if (s.drafts.length >= MAX_DRAFTS) target = s.drafts[0]?.id ?? null;
        else {
          target = newId();
          game().updateState(addDraft(target));
        }
      }
      set({ activeId: target, error: null, refusal: null, missing: [], stamp: null });
      set({ field: firstEmpty() });
      game().setPetitionOpen(true);
    },

    create() {
      const s = game().state;
      if (!s || s.drafts.length >= MAX_DRAFTS) return;
      const id = newId();
      game().updateState(addDraft(id));
      set({ activeId: id, field: 'to', error: null, refusal: null, missing: [], stamp: null });
      game().setPetitionOpen(true);
    },

    close() {
      game().setPetitionOpen(false);
      game().updateState(dropEmptyDrafts);
      set({ field: null, error: null, refusal: null, missing: [] });
    },

    toggle(id) {
      const open = game().petitionOpen;
      if (open && (!id || id === get().activeId)) get().close();
      else get().open(id);
    },

    setActiveField(f) {
      set({ field: f });
    },

    addCard(card) {
      if (!game().petitionOpen || !draft()) get().open();
      const id = get().activeId;
      if (!id) return;
      const f = get().field;
      const target: DraftField = f === 'ask' || f === 'basis' ? f : firstEmptyCard();
      game().updateState(setField(id, target, card));
      // Следующая карточка — в следующее пустое поле.
      const d = draft();
      const next: DraftField = d && !d.ask ? 'ask' : d && !d.basis ? 'basis' : target;
      set({ field: next, error: null, missing: get().missing.filter((m) => m !== target) });

      function firstEmptyCard(): DraftField {
        const d0 = draft();
        return d0 && !d0.ask ? 'ask' : d0 && !d0.basis ? 'basis' : 'ask';
      }
    },

    setTo(address) {
      if (!game().petitionOpen || !draft()) get().open();
      const id = get().activeId;
      if (!id) return;
      const a = emailIn(address) ?? address.trim().toLowerCase();
      game().updateState(setField(id, 'to', a));
      set({ field: firstEmpty(), error: null, missing: get().missing.filter((m) => m !== 'to') });
    },

    clear(f) {
      const id = get().activeId;
      if (id) game().updateState(setField(id, f, null));
      set({ field: f });
    },

    moveCard(from) {
      const id = get().activeId;
      if (!id) return;
      const to = from === 'ask' ? 'basis' : 'ask';
      game().updateState(swapCards(id, from));
      set({
        field: to,
        error: null,
        missing: get().missing.filter((m) => draft()?.[m] == null),
      });
    },

    deleteDraft() {
      const d = draft();
      if (d) game().updateState(removeDraft(d.id));
      set({ activeId: null, discarded: d });
      get().close();
      if (d) setTimeout(() => set((p) => (p.discarded === d ? { discarded: null } : p)), UNDO_MS);
    },

    restoreDraft() {
      const d = get().discarded;
      const s = game().state;
      if (!d || !s || s.drafts.length >= MAX_DRAFTS) return;
      game().updateState((st) => ({ ...st, drafts: [...st.drafts, d] }));
      set({ discarded: null });
      get().open(d.id);
    },

    async send() {
      const d = draft();
      if (!d || get().sending) return;
      const missing = missingFields(d);
      if (missing.length || !d.to || !d.ask || !d.basis) {
        set({ missing, error: 'Заполните все поля: Кому, Прошу, На основании.' });
        return;
      }
      set({ sending: true, error: null, refusal: null, missing: [] });
      const r = await postPetition(d.to, d.ask, d.basis).catch(() => ({
        ok: false as const,
        error: 'Нет связи с сервером — ходатайство не ушло. Попробуйте ещё раз.',
      }));
      if (!r.ok) {
        set({ sending: false, error: r.error });
        return;
      }
      if ('refused' in r) {
        // Черновик остаётся: игрок исправит карточки и отправит снова.
        set({ sending: false, refusal: r.refused });
        return;
      }
      set({ sending: false, stamp: r.n });
      game().checkMailIn(r.delayMs);
      setTimeout(() => {
        game().updateState(removeDraft(d.id));
        set({ stamp: null, activeId: null, sentNote: true });
        get().close();
        setTimeout(() => set({ sentNote: false }), SENT_NOTE_MS);
      }, STAMP_MS);
    },
  };
});
