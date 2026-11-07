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

export const resetState = async (): Promise<void> => {
  await check(await fetch('/api/state', { method: 'DELETE' }));
};
