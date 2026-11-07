import {
  defaultState,
  type Material,
  type PlayerState,
  PlayerStateSchema,
  reconcile,
} from '@bunker/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { type Db, playerState } from './db/client.ts';

/** На этапе 1 игрок один; вход и аккаунты — этап 6. */
const PLAYER_ID = 'local';

export interface AppDeps {
  db: Db;
  materials: Material[];
  production: boolean;
}

/** Состояние ссылается только на материалы, которые у игрока есть, и в своих местах. */
function invalidReference(s: PlayerState, materials: Material[]): string | null {
  const deskIds = new Set(materials.filter((m) => m.placement === 'desk').map((m) => m.id));
  const allIds = new Set(materials.map((m) => m.id));
  const badDesk = s.desk.items.find((i) => !deskIds.has(i.materialId));
  if (badDesk) return `на столе нет материала ${badDesk.materialId}`;
  const badBoard = s.board.items.find((i) => !allIds.has(i.materialId));
  if (badBoard) return `нет материала ${badBoard.materialId}`;
  return null;
}

export function createApp({ db, materials, production }: AppDeps): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/materials', (c) => c.json(materials));

  app.get('/api/state', async (c) => {
    const [row] = await db.select().from(playerState).where(eq(playerState.playerId, PLAYER_ID));
    const parsed = row ? PlayerStateSchema.safeParse(row.state) : null;
    const state = parsed?.success ? reconcile(parsed.data, materials) : defaultState(materials);
    return c.json(state);
  });

  app.put('/api/state', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = PlayerStateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'неверное состояние' }, 400);
    const bad = invalidReference(parsed.data, materials);
    if (bad) return c.json({ error: bad }, 400);
    await db
      .insert(playerState)
      .values({ playerId: PLAYER_ID, state: parsed.data })
      .onConflictDoUpdate({
        target: playerState.playerId,
        set: { state: parsed.data, updatedAt: new Date() },
      });
    return c.body(null, 204);
  });

  app.delete('/api/state', async (c) => {
    if (production) return c.notFound();
    await db.delete(playerState).where(eq(playerState.playerId, PLAYER_ID));
    return c.body(null, 204);
  });

  return app;
}
