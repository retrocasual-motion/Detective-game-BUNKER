import type { Material, PlayerState } from '@bunker/shared';

async function check(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`${res.status} ${res.url}`);
  return res;
}

/** Предел тела запроса с keepalive в браузерах — 64 КБ. */
const KEEPALIVE_LIMIT = 60_000;

export const getMaterials = async (): Promise<Material[]> =>
  (await check(await fetch('/api/materials'))).json();

export const getState = async (): Promise<PlayerState> =>
  (await check(await fetch('/api/state'))).json();

export const putState = async (s: PlayerState): Promise<void> => {
  const body = JSON.stringify(s);
  await check(
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
      // keepalive — чтобы запрос дошёл, даже если страницу закрывают.
      keepalive: body.length < KEEPALIVE_LIMIT,
    }),
  );
};

export const resetState = async (): Promise<void> => {
  await check(await fetch('/api/state', { method: 'DELETE' }));
};
