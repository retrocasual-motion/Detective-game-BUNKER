import type { Card, Material, PlayerState } from '@bunker/shared';

async function check(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`${res.status} ${res.url}`);
  return res;
}

/** Предел тела запроса с keepalive в браузерах — 64 КБ, считается в байтах. */
const KEEPALIVE_LIMIT_BYTES = 60_000;

export const canKeepalive = (body: string): boolean =>
  new TextEncoder().encode(body).length < KEEPALIVE_LIMIT_BYTES;

export const getMaterials = async (): Promise<Material[]> =>
  (await check(await fetch('/api/materials'))).json();

export const getState = async (): Promise<PlayerState> =>
  (await check(await fetch('/api/state'))).json();

/** seq — номер версии сохранения: сервер не применит запрос старее уже сохранённого. */
export const putState = async (s: PlayerState, seq: number): Promise<void> => {
  const body = JSON.stringify(s);
  await check(
    await fetch('/api/state', {
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
}

/** Действие игрока над материалом (этап 4b): осмотр — перевернуть, увеличить, листать. */
export const postAction = async (
  action: 'ОСМОТР',
  target: string,
  value: string,
): Promise<ActionResult> => {
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, target, value }),
  });
  return (await check(res)).json();
};

/** Служебная строка действий — только в разработке (E2-CHECK-A). */
export const postActionLine = async (line: string): Promise<ActionResult> => {
  const res = await fetch('/api/dev/action-line', {
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

export const resetState = async (): Promise<void> => {
  await check(await fetch('/api/state', { method: 'DELETE' }));
};

/** Итог отправки ходатайства: номер и задержка ответа — или ошибка оформления (FORM-B). */
export type PetitionResult =
  | { ok: true; n: number; delayMs: number }
  /** Общий отказ адресата (PRE-B): ответ сразу, письма нет, попытка засчитана. */
  | { ok: true; refused: string }
  | { ok: false; error: string };

/** Отправить ходатайство из папки (этап 3). */
export const postPetition = async (to: string, ask: Card, basis: Card): Promise<PetitionResult> => {
  const res = await fetch('/api/petition', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, ask, basis }),
  });
  if (res.status === 422 || res.status === 400) {
    const { error } = (await res.json()) as { error: string };
    return { ok: false, error };
  }
  const r = (await check(res).then((x) => x.json())) as
    | { n: number; delayMs: number }
    | { refused: string };
  return 'refused' in r ? { ok: true, refused: r.refused } : { ok: true, ...r };
};

/** Письма в пути: через сколько мс каждое ляжет во «Входящие». */
export const getPendingMail = async (): Promise<number[]> =>
  ((await (await check(await fetch('/api/mail/pending'))).json()) as { inMs: number[] }).inMs;
