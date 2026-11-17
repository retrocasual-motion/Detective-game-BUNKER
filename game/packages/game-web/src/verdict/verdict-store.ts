import {
  type Card,
  type FormQuestion,
  parseVerdictForm,
  VERDICT_QUESTIONS,
  type VerdictAnswer,
} from '@bunker/shared';
import { create } from 'zustand';
import { type CaseStatus, getCase, postAction, postVerdict } from '../api.ts';
import { useGame } from '../store.ts';

/** Экран «Проверьте заключение» — после пятого вопроса (RT-B). */
export const REVIEW = VERDICT_QUESTIONS;

interface VerdictStore {
  status: CaseStatus;
  /** Предупреждение «назад пути нет» на экране (L998). */
  warning: boolean;
  /** Папка заключения открыта. */
  open: boolean;
  sending: boolean;
  error: string | null;
  /** Узнать у сервера, где дело (при загрузке игры). */
  load(): Promise<void>;
  /** «Решить дело» — сначала предупреждение (A-243). */
  ask(): Promise<void>;
  /** «Вернуться к делу» — предупреждение ни к чему не обязывает. */
  back(): void;
  /** «Продолжить» — расследование закрыто, открывается форма (P-9). */
  proceed(): Promise<void>;
  toggle(): void;
  close(): void;
  go(step: number): void;
  answer(i: number, a: VerdictAnswer): void;
  /** Карточка из материала — в текущий вопрос о материале (как «В запрос», K-A). */
  addCard(card: Card): void;
  /** Карточка человека со стены — в текущий вопрос о человеке. */
  addPerson(id: string): void;
  send(): Promise<void>;
}

const game = () => useGame.getState();

/** Вопросы формы — из текста L999 (он у игрока после «Продолжить»). */
export function formQuestions(): FormQuestion[] {
  const body = game().materials.find((m) => m.id === 'L999')?.body;
  return body ? parseVerdictForm(body) : [];
}

const draft = () => game().state?.verdict ?? { answers: [], step: 0 };

const saveDraft = (fn: (d: { answers: VerdictAnswer[]; step: number }) => typeof d) =>
  game().updateState((s) => {
    const d = s.verdict ?? { answers: [], step: 0 };
    return { ...s, verdict: fn({ answers: [...d.answers], step: d.step }) };
  });

/** Форма открыта и ещё не отправлена: карточки идут в неё, а не в запрос. */
export const verdictActive = () => {
  const { status } = useVerdict.getState();
  return status.form && !status.sent;
};

export const useVerdict = create<VerdictStore>((set, get) => {
  /** Папка открыта — поля ждут листы со стены и стола, как у папки запроса. */
  const show = (open: boolean) => {
    set({ open });
    game().setPetitionOpen(open);
  };
  /** Материал, открытый действием, — в материалы игрока без записки «пришло»: это окно, не дело. */
  const take = (released: { id: string }[]) => {
    const g = game();
    const known = new Set(g.materials.map((m) => m.id));
    const fresh = (released as typeof g.materials).filter((m) => !known.has(m.id));
    if (fresh.length) useGame.setState({ materials: [...g.materials, ...fresh] });
  };
  return {
    status: { form: false, sent: false },
    warning: false,
    open: false,
    sending: false,
    error: null,

    async load() {
      try {
        set({ status: await getCase() });
      } catch {
        // Сервер ещё поднимается — дело считаем открытым; следующая загрузка уточнит.
      }
    },

    async ask() {
      const r = await postAction('РЕШИТЬ', 'дело', '');
      take(r.released);
      set({ warning: true });
    },

    back() {
      set({ warning: false });
    },

    async proceed() {
      const r = await postAction('РЕШИТЬ', 'дело', 'продолжить');
      take(r.released);
      set({ warning: false, status: { form: true, sent: false } });
      game().setPetitionOpen(false);
      show(true);
    },

    toggle() {
      show(!get().open);
    },

    close() {
      show(false);
    },

    go(step) {
      saveDraft((d) => ({ ...d, step: Math.max(0, Math.min(REVIEW, step)) }));
      set({ error: null });
    },

    answer(i, a) {
      saveDraft((d) => {
        const answers = Array.from({ length: VERDICT_QUESTIONS }, (_, k) => d.answers[k] ?? null);
        answers[i] = a;
        return { ...d, answers };
      });
      set({ error: null });
    },

    addCard(card) {
      if (!get().open) show(true);
      const { step } = draft();
      if (formQuestions()[step]?.kind === 'material') get().answer(step, { card });
    },

    addPerson(id) {
      if (!get().open) show(true);
      const { step } = draft();
      if (formQuestions()[step]?.kind === 'person') get().answer(step, { person: id });
    },

    async send() {
      if (get().sending) return;
      set({ sending: true, error: null });
      try {
        const answers = Array.from(
          { length: VERDICT_QUESTIONS },
          (_, k) => draft().answers[k] ?? null,
        );
        const r = await postVerdict(answers);
        if ('error' in r) {
          set({ error: r.error });
          return;
        }
        set({ status: { form: false, sent: true } });
        game().checkMailIn(r.delayMs);
      } catch {
        set({ error: 'Не отправлено: сервер не ответил. Попробуйте ещё раз.' });
      } finally {
        set({ sending: false });
      }
    },
  };
});

/** Подпись кнопки у выделения: пока форма открыта, карточка идёт в заключение. */
export const useToFolderLabel = (): string =>
  useVerdict((v) => v.status.form && !v.status.sent) ? 'В заключение' : 'В запрос';
