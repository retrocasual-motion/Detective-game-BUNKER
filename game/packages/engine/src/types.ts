/** Формат `gm/access.json` пакета игрока (собирает `gm/build_access.py`). */

export type ActionName = 'ОСМОТР' | 'АДРЕС' | 'ЗВОНОК' | 'ПАРОЛЬ' | 'РЕШИТЬ' | 'ФИНАЛ' | 'СТОП';

export const ACTIONS: readonly ActionName[] = [
  'ОСМОТР',
  'АДРЕС',
  'ЗВОНОК',
  'ПАРОЛЬ',
  'РЕШИТЬ',
  'ФИНАЛ',
  'СТОП',
];

export interface Rule {
  id: string;
  action: string;
  target: string;
  target_label?: string;
  accept?: string[];
  release: string[];
  requires?: string[];
  requires_reply?: string;
  ok?: string;
  fail?: string;
  refusal?: boolean;
  early?: boolean;
  again?: string;
  attempt_limit?: number;
  attempt_limit_reply?: string;
  fallback?: boolean;
}

export interface FinalForm {
  release: string;
  return_allowed?: boolean;
  before_reply?: string;
  after_reply?: string;
  same_round_reply?: string;
}

export interface AccessRules {
  version: number;
  final_form?: FinalForm;
  attempt_limit?: Partial<Record<string, number>>;
  attempt_limit_reply?: string;
  default_reply?: Partial<Record<string, string>>;
  rules: Rule[];
}

/**
 * Итог действия — те же слова, что у эталона `playtest.py walk`: «успех» (открыт материал),
 * «ответ», «отказ», «повтор», «нет доступа», «нет правила», «не оформлено», «лимит»,
 * «нет формы», «форма открыта», «конец», «после конца».
 */
export type Result =
  | 'успех'
  | 'ответ'
  | 'отказ'
  | 'повтор'
  | 'нет доступа'
  | 'нет правила'
  | 'не оформлено'
  | 'лимит'
  | 'нет формы'
  | 'форма открыта'
  | 'конец'
  | 'после конца';

export interface ActionInput {
  action: ActionName;
  target: string;
  /** Значение (пароль, адрес, действие осмотра, ответ «продолжить»). */
  value?: string;
}

/** Прогресс игрока, который ведёт движок (пишет только сервер). */
export interface Progress {
  /** Открытые закрытые материалы, по порядку открытия. */
  released: string[];
  /** Открытые материалы, которые уже доставлены игроку (для формы заключения). */
  seen: string[];
  /** Неверные попытки по полям: ключ — действие и поле. */
  fails: Record<string, { n: number; last: number }>;
  /** ФИНАЛ или СТОП принят — дело закрыто. */
  ended: boolean;
}

export const emptyProgress = (): Progress => ({
  released: [],
  seen: [],
  fails: {},
  ended: false,
});

export interface Outcome {
  result: Result;
  /** Правило, которое сработало или ответило (id) — для журнала. */
  rule: string;
  /** Текст ответа игроку. */
  reply: string;
  /** Материалы, открытые этим действием. */
  released: string[];
}

export interface EngineConfig {
  /** Пауза поля после исчерпания попыток, мс (T-11-A: 10 минут). */
  pauseMs: number;
  /**
   * Лимит неверных попыток по действию — поверх правил пакета (игра, LK-A: ПАРОЛЬ — 5 во всех
   * полях, и в архиве газеты). Нет — как в пакете.
   */
  limits?: Partial<Record<string, number>>;
  /**
   * Поля без лимита — поиск, а не отправка (DS-B, автор 19.11): шаблоны цели поля (как в
   * правилах, Python-регулярные). Ошибка поиска не считается неверной попыткой.
   */
  unlimited?: readonly string[];
}

export const DEFAULT_CONFIG: EngineConfig = { pauseMs: 10 * 60 * 1000 };
