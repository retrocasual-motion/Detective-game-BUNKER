import type { Material, PlayerState, VerdictAnswer, VerdictResult } from '@bunker/shared';

/**
 * Запрос с пределом ожидания (R2-07): завис сервер — через 15 с ошибка, как при обрыве связи,
 * а не «проверяю…» на минуты.
 */
const TIMEOUT_MS = 15_000;
const call = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) });

/** Сервер ответил отказом (не сбой сети): код ответа — в status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`${status} ${url}`);
  }
}

/** Сессии нет (вышли в другой вкладке, истекла): игра показывает экран входа (R2-03). */
let onSignedOut: (() => void) | null = null;
export const setOnSignedOut = (fn: () => void) => {
  onSignedOut = fn;
};

async function check(res: Response): Promise<Response> {
  if (!res.ok) {
    if (res.status === 401) onSignedOut?.();
    throw new HttpError(res.status, res.url);
  }
  return res;
}

/** Предел тела запроса с keepalive в браузерах — 64 КБ, считается в байтах. */
const KEEPALIVE_LIMIT_BYTES = 60_000;

export const canKeepalive = (body: string): boolean =>
  new TextEncoder().encode(body).length < KEEPALIVE_LIMIT_BYTES;

export const getMaterials = async (): Promise<Material[]> =>
  (await check(await call('/api/materials'))).json();

export const getState = async (): Promise<PlayerState> =>
  (await check(await call('/api/state'))).json();

/** seq — номер версии сохранения: сервер не применит запрос старее уже сохранённого. */
export const putState = async (s: PlayerState, seq: number): Promise<void> => {
  const body = JSON.stringify(s);
  await check(
    await call('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-state-seq': String(seq) },
      body,
      // keepalive — чтобы запрос дошёл, даже если страницу закрывают.
      keepalive: canKeepalive(body),
    }),
  );
};

/** Ответ движка правил на действие (TECH_PLAN 6.1). */
export interface ActionResult {
  /** Вид итога — только в разработке (служебная строка). */
  result?: string;
  reply: string;
  /** Пустой ответ (общее правило, отказ) — игра говорит своё (этап 4b). */
  quiet?: boolean;
  /** Материалы, которые действие открыло. */
  released: Material[];
  /** Поле ввода не примет значение ещё столько мс (LK-A); 0 — принимает. */
  wait?: number;
}

/** Действие игрока над материалом (этап 4b): осмотр — перевернуть, увеличить, листать. */
export const postAction = async (
  action: 'ОСМОТР' | 'ПАРОЛЬ' | 'АДРЕС' | 'РЕШИТЬ',
  target: string,
  value: string,
): Promise<ActionResult> => {
  const res = await call('/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, target, value }),
  });
  return (await check(res)).json();
};

/** Служебная строка действий — только в разработке (E2-CHECK-A). */
export const postActionLine = async (line: string): Promise<ActionResult> => {
  const res = await call('/api/dev/action-line', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ line }),
  });
  if (res.status === 400) {
    const { error } = (await res.json()) as { error: string };
    return { result: 'не разобрано', reply: error, released: [] };
  }
  return (await check(res)).json();
};

/** «Новое дело» из главного меню: всё с начала (работает и у игрока). */
export const newCase = async (): Promise<void> => {
  await check(await call('/api/new-case', { method: 'POST' }));
};

export const resetState = async (): Promise<void> => {
  await check(await call('/api/state', { method: 'DELETE' }));
};

/** Кто вошёл (6a-1): без входа (`off`) или по ссылке — почта. */
export type Me =
  | { auth: 'off' }
  | { auth: 'link'; email: string }
  | { auth: 'link'; email?: undefined };

/** null — сервер не ответил; `{auth:'link'}` без почты — нужен вход. */
export const getMe = async (): Promise<Me | null> => {
  const res = await call('/api/me').catch(() => null);
  if (!res || (res.status !== 200 && res.status !== 401)) return null;
  return res.json();
};

/** Письмо со ссылкой для входа. */
export const requestLogin = async (
  email: string,
): Promise<{ sent: true; again?: boolean } | { error: string }> => {
  const res = await call('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }).catch(() => null);
  if (!res) return { error: 'Нет связи с сервером. Попробуйте ещё раз.' };
  const body = (await res.json().catch(() => ({}))) as { error?: string; sent?: true };
  return res.ok && body.sent
    ? { sent: true, again: (body as { again?: boolean }).again }
    : { error: body.error ?? 'Письмо не отправлено.' };
};

export const logout = async (): Promise<void> => {
  await call('/api/logout', { method: 'POST' });
};

/** Где дело (A-270): открыта ли форма заключения, отправлено ли заключение. */
export interface CaseStatus {
  form: boolean;
  sent: boolean;
  /** Итог отправленного заключения — ответ бюро на экране. */
  result: VerdictResult | null;
}

export const getCase = async (): Promise<CaseStatus> =>
  (await check(await call('/api/case'))).json();

/** Отправить заключение: бюро отвечает сразу — итогом по вопросам (автор 17.11). */
export const postVerdict = async (
  answers: VerdictAnswer[],
): Promise<{ result: VerdictResult } | { error: string }> => {
  const res = await call('/api/verdict', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (res.status === 422) return res.json();
  return (await check(res)).json();
};
