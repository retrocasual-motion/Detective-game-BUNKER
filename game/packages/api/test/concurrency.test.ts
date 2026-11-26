import type { AccessRules } from '@bunker/engine';
import type { Material } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { connectDb, type Db, migrateDb, playerProgress, playerState } from '../src/db/client.ts';

/** Два процесса сервера над одной базой (RV-58): действия одного игрока не затирают друг друга. */
const mat = (id: string): Material => ({
  id,
  title: id,
  placement: 'desk',
  kind: 'sheet',
  body: `# ${id}\n`,
  sourceFile: `${id}__x.md`,
});
const materials = [mat('01')];
const locked = Array.from({ length: 8 }, (_, i) => mat(`L90${i}`));
const rules: AccessRules = {
  version: 1,
  rules: locked.map((m, i) => ({
    id: `r${i}`,
    action: 'ОСМОТР',
    target: `предмет ${i}`,
    accept: ['.*'],
    release: [m.id],
    ok: 'Найдено.',
  })),
};
const engine = {
  locked,
  content: {
    rules,
    starting: new Map(materials.map((m) => [m.id, m.body])),
    locked: new Map(locked.map((m) => [m.id, m.body])),
  },
};

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(playerProgress);
  await db.delete(playerState);
});

const server = () => createApp({ db, materials, production: false, engine });
const act = (a: ReturnType<typeof server>, i: number) =>
  a.request('/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'ОСМОТР', target: `предмет ${i}`, value: 'смотреть' }),
  });

describe('действия при двух процессах сервера (RV-58)', () => {
  it('восемь действий одновременно через два сервера — всё открытое на месте', async () => {
    const [a, b] = [server(), server()];
    const res = await Promise.all(locked.map((_, i) => act(i % 2 ? a : b, i)));
    for (const r of res) expect(r.status).toBe(200);
    const [row] = await db.select().from(playerProgress);
    expect([...(row?.progress.released ?? [])].sort()).toEqual(locked.map((m) => m.id));
  });
});
