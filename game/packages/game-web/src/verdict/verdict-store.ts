import {
  type Card,
  EPILOGUE_ID,
  type FormQuestion,
  parseVerdictForm,
  VERDICT_QUESTIONS,
  type VerdictAnswer,
  type VerdictResult,
} from '@bunker/shared';
import { create } from 'zustand';
import { type CaseStatus, getCase, getMaterials, postAction, postVerdict } from '../api.ts';
import { reducedMotion } from '../motion.ts';
import { useGame } from '../store.ts';

/** Экран «Проверьте заключение» — после пятого вопроса (RT-B). */
export const REVIEW = VERDICT_QUESTIONS;
/** Сколько виден штамп «Отправлено», прежде чем бюро ответит, мс. */
const STAMP_MS = 1200;

interface VerdictStore {
  status: CaseStatus;
  /** Предупреждение «назад пути нет» на экране (L998). */
  warning: boolean;
  /** Папка заключения открыта. */
  open: boolean;
  sending: boolean;
  /** Штамп «Отправлено» на бланке — бюро вот-вот ответит. */
  stamped: boolean;
  /** Ответ бюро на экране (автор 17.11: сразу, без ожидания и без «Входящих»). */
  showResult: boolean;
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
  /** Ответ бюро снова (из папки «Заключение»). */
  openResult(): void;
  /** «Дальше» после ответа бюро: стол, на нём конверт с эпилогом. */
  finish(): void;
}

const game = () => useGame.getState();

/** Вопросы формы — из текста L999 (он у игрока после «Продолжить»). */
export function formQuestions(): FormQuestion[] {
  const body = game().materials.find((m) => m.id === 'L999')?.body;
  return body ? parseVerdictForm(body) : [];
}

const draft = () => game().state?.verdict ?? { answers: [], step: 0 };

type Draft = NonNullable<ReturnType<typeof game>['state']>['verdict'] & object;

const saveDraft = (fn: (d: Draft) => Draft) =>
  game().updateState((s) => {
    const d = s.verdict ?? { answers: [], step: 0 };
    return { ...s, verdict: fn({ ...d, answers: [...d.answers] }) };
  });

/** Эпилог открыли — конверт на столе больше не подсвечен. */
export const markEpilogueRead = () => saveDraft((d) => ({ ...d, epilogueRead: true }));

/** Форма открыта и ещё не отправлена: карточки идут в неё, а не в запрос. */
export const verdictActive = () => {
  const { status } = useVerdict.getState();
  return status.form && !status.sent;
};

/** Материалы, которых у игрока ещё нет, — без записки «пришло»: это окна и стол, не «Входящие». */
const take = (released: { id: string }[]) => {
  const g = game();
  const known = new Set(g.materials.map((m) => m.id));
  const fresh = (released as typeof g.materials).filter((m) => !known.has(m.id));
  if (fresh.length) useGame.setState({ materials: [...g.materials, ...fresh] });
};

export const useVerdict = create<VerdictStore>((set, get) => {
  /** Папка открыта — поля ждут листы со стены и стола, как у папки запроса. */
  const show = (open: boolean) => {
    set({ open });
    game().setFolderOpen(open);
  };
  return {
    status: { form: false, sent: false, result: null },
    warning: false,
    open: false,
    sending: false,
    stamped: false,
    showResult: false,
    error: null,

    async load() {
      // Сервер ещё поднимается или связь пропала — повторять, пока не ответит: иначе игрок с уже
      // отправленным заключением видел бы «Решить дело» и папку запроса (R2-05).
      for (let wait = 1000; ; wait = Math.min(wait * 2, 30_000)) {
        try {
          set({ status: await getCase() });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, wait));
        }
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
      set({ warning: false, status: { form: true, sent: false, result: null } });
      game().setFolderOpen(false);
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
      /** Заключение принято: штамп, эпилог на стол (конвертом), ответ бюро — после штампа. */
      const sent = (status: CaseStatus) => {
        set({ status, stamped: true });
        getMaterials()
          .then((all) => take(all.filter((m) => m.id === EPILOGUE_ID)))
          .catch(() => undefined);
        setTimeout(() => set({ stamped: false, showResult: true }), reducedMotion() ? 0 : STAMP_MS);
      };
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
        sent({ form: false, sent: true, result: r.result });
      } catch {
        // Ответ не дошёл, но сервер мог заключение принять (RV-43): спросить, где дело, — и показать
        // итог, а не «Не отправлено» и потом «уже отправлено».
        const now = await getCase().catch(() => null);
        if (now?.sent) sent(now);
        else set({ error: 'Не отправлено: сервер не ответил. Попробуйте ещё раз.' });
      } finally {
        set({ sending: false });
      }
    },

    openResult() {
      set({ showResult: true });
    },

    finish() {
      set({ showResult: false });
      show(false);
      game().closeViewer();
      game().setView('desk');
    },
  };
});

/** Итог отправленного заключения (null — ещё не отправлено). */
export const useVerdictResult = (): VerdictResult | null => useVerdict((v) => v.status.result);

/** Подпись кнопки у выделения: пока форма открыта, карточка идёт в заключение. */
export const useToFolderLabel = (): string =>
  useVerdict((v) => v.status.form && !v.status.sent) ? 'В заключение' : 'В запрос';
