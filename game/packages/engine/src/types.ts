/** Формат `gm/access.json` пакета игрока (собирает `gm/build_access.py`). */

export type ActionName =
  | 'ОСМОТР'
  | 'ХОДАТАЙСТВО'
  | 'АДРЕС'
  | 'ЗВОНОК'
  | 'ПАРОЛЬ'
  | 'РЕШИТЬ'
  | 'ФИНАЛ'
  | 'СТОП';

export const ACTIONS: readonly ActionName[] = [
  'ОСМОТР',
  'ХОДАТАЙСТВО',
  'АДРЕС',
  'ЗВОНОК',
  'ПАРОЛЬ',
  'РЕШИТЬ',
  'ФИНАЛ',
  'СТОП',
];

/** Вариант карточки: шаблон номера файла и шаблон цитаты. */
export interface CardSpec {
  file?: string;
  quote?: string;
}

export interface Rule {
  id: string;
  action: string;
  target: string;
  target_label?: string;
  accept?: string[];
  cards?: CardSpec[][];
  not_cards?: CardSpec[];
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
  address_book?: boolean;
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

/** Карточка ходатайства: номер файла (01…51, L…, «почта») и цитата из него. */
export interface Card {
  file: string;
  quote: string;
}

export interface ActionInput {
  action: ActionName;
  target: string;
  /** Значение (пароль, адрес, действие осмотра, ответ «продолжить»). */
  value?: string;
  /** Для ХОДАТАЙСТВО: «Прошу» и «На основании». */
  cards?: [Card, Card];
}

/** Прогресс игрока, который ведёт движок (пишет только сервер). */
export interface Progress {
  /** Открытые закрытые материалы, по порядку открытия. */
  released: string[];
  /** Открытые материалы, которые уже доставлены игроку (для формы заключения). */
  seen: string[];
  /** Неверные попытки по полям: ключ — действие и поле. */
  fails: Record<string, { n: number; last: number }>;
  /** Почта специалиста: ответы на ходатайства (из неё тоже берут карточки). */
  mail: string;
  /** ФИНАЛ или СТОП принят — дело закрыто. */
  ended: boolean;
}

export const emptyProgress = (): Progress => ({
  released: [],
  seen: [],
  fails: {},
  mail: '',
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
}

export const DEFAULT_CONFIG: EngineConfig = { pauseMs: 10 * 60 * 1000 };
