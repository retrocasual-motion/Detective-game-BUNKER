import type { Material, PlayerState } from '@bunker/shared';

async function check(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`${res.status} ${res.url}`);
  return res;
}

export const getMaterials = async (): Promise<Material[]> =>
  (await check(await fetch('/api/materials'))).json();

export const getState = async (): Promise<PlayerState> =>
  (await check(await fetch('/api/state'))).json();

export const putState = async (s: PlayerState): Promise<void> => {
  await check(
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
    }),
  );
};

export const resetState = async (): Promise<void> => {
  await check(await fetch('/api/state', { method: 'DELETE' }));
};
