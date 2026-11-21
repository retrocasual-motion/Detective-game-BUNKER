/**
 * Формы на настоящих сайтах дела (A-272, AC-3; задание §3). Поля и подписи — по описаниям
 * страниц в материалах пакета (L101, L130, L249, L620, L735). Адресов сайтов здесь нет: какой
 * хост — какой сайт, знает только сервер (адрес хранилища — из кабинета, P-10). Значение
 * формы для движка собирает сервер (несколько полей — через « / »).
 */

export type SiteFormId =
  | 'vl-login'
  | 'vl-forgot'
  | 'vl-word'
  | 'vl-registry'
  | 'vl-docs'
  | 'hx-archive'
  | 'fr-death'
  | 'mb-login'
  | 'mb-forgot'
  | 'mb-answer';

export interface SiteField {
  name: string;
  label: string;
  password?: boolean;
  placeholder?: string;
}

export interface SiteForm {
  id: SiteFormId;
  /** Заголовок над формой (если в тексте страницы его нет). */
  title?: string;
  fields: SiteField[];
  submit: string;
  /**
   * Пустое поле не отправляется (UX-4, VF-5): игрок видит это у поля, попытка не тратится.
   * `some` — хватает одного заполненного поля (учёт анкет: программа — или код и дата).
   */
  some?: boolean;
}

export const SITE_FORMS: Readonly<Record<SiteFormId, SiteForm>> = {
  'vl-login': {
    id: 'vl-login',
    fields: [
      { name: 'login', label: 'Логин' },
      { name: 'password', label: 'Пароль', password: true },
    ],
    submit: 'Войти',
  },
  'vl-forgot': {
    id: 'vl-forgot',
    title: 'Забыли пароль?',
    fields: [{ name: 'login', label: 'Логин' }],
    submit: 'Войти по кодовому слову',
  },
  // PW-B (автор 20.11): второй вход — ответ на контрольный вопрос учётной записи.
  'vl-word': {
    id: 'vl-word',
    fields: [{ name: 'answer', label: 'Кодовое слово' }],
    submit: 'Войти',
  },
  'vl-registry': {
    id: 'vl-registry',
    fields: [
      { name: 'program', label: 'Программа' },
      // Поля «Дата выбытия» нет (DT-A, ручная проверка автора 21.11): прошлые этапы — по коду.
      { name: 'code', label: 'Код участника' },
    ],
    submit: 'Найти',
    some: true,
  },
  'vl-docs': {
    id: 'vl-docs',
    fields: [{ name: 'title', label: 'Название документа' }],
    submit: 'Найти',
  },
  'hx-archive': {
    id: 'hx-archive',
    fields: [{ name: 'password', label: 'Пароль владельца', password: true }],
    submit: 'Открыть',
  },
  'fr-death': {
    id: 'fr-death',
    title: 'Сообщить о смерти арендатора',
    fields: [
      { name: 'box', label: 'Номер ячейки' },
      { name: 'surname', label: 'Фамилия арендатора' },
      { name: 'date', label: 'Дата смерти', placeholder: 'ДД.ММ.ГГГГ' },
    ],
    submit: 'Отправить',
  },
  'mb-login': {
    id: 'mb-login',
    fields: [
      { name: 'address', label: 'Адрес ящика' },
      { name: 'password', label: 'Пароль', password: true },
    ],
    submit: 'Войти',
  },
  'mb-forgot': {
    id: 'mb-forgot',
    title: 'Забыли пароль?',
    fields: [{ name: 'address', label: 'Адрес ящика' }],
    submit: 'Восстановить доступ',
  },
  'mb-answer': {
    id: 'mb-answer',
    fields: [{ name: 'answer', label: 'Ответ' }],
    submit: 'Ответить',
  },
};

/** Метка формы в тексте страницы (сервер ставит её вместо описания «Форма: …»). */
export const formToken = (id: SiteFormId) => `::form:${id}::`;
export const FORM_TOKEN = /^::form:([a-z-]+)::$/;

/** Страница сайта, как её отдаёт сервер (только открытое игроком, P-10). */
export interface SitePage {
  /** Название сайта в шапке (домен). */
  domain: string;
  title: string;
  /** Строки «Шапка: …» и «Разделы: …» описания страницы. */
  header: string;
  nav: string[];
  /** Текст в Markdown; на месте форм — метки formToken. */
  body: string;
  /** Материал страницы (для выписок, §6). */
  material: string;
  /** Документы, открытые на этой странице (учёт анкет, архив): номер, название, текст. */
  docs: { id: string; title: string; body: string }[];
  /** Веб-почта (L453): текст ящика — письма разбирает страница. */
  mailbox?: string;
  /** Кабинет сотрудника открыт (вход выполнен): логин — от сервера, в коде страницы его нет (P-10). */
  cabinet?: string | null;
  /** Веб-почта уже открыта (вход выполнен раньше): вместо формы входа — «Вы вошли» (F8). */
  mailOpen?: boolean;
  /** Сколько мс ещё ждёт каждое поле (лимит неверных вводов). */
  wait: Partial<Record<SiteFormId, number>>;
}
