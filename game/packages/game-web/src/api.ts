import type { Material, PlayerState } from '@bunker/shared';

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
  result: string;
  reply: string;
  /** Материалы, которые действие открыло. */
  released: Material[];
}

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
