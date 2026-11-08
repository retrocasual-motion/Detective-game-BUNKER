import {
  type ActionInput,
  act,
  type Content,
  emptyProgress,
  type Progress,
  parseActionLine,
} from '@bunker/engine';
import {
  defaultState,
  type Material,
  type PlayerState,
  PlayerStateSchema,
  reconcile,
  upgradeState,
} from '@bunker/shared';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { type Db, playerProgress, playerState } from './db/client.ts';

/** На этапе 1 игрок один; вход и аккаунты — этап 6. */
const PLAYER_ID = 'local';

export interface AppDeps {
  db: Db;
  materials: Material[];
  production: boolean;
  /** Готова ли база (миграции применены); до этого health отвечает 503. */
  isReady?: () => boolean;
  /** Папка собранного клиента (production, Docker): сервер отдаёт и игру, и API. */
  webDist?: string;
  /**
   * Движок правил (этап 2): правила и тексты всех материалов, закрытые материалы.
   * Только на сервере — в браузер уходят лишь открытые игроком (P-10).
   */
  engine?: { content: Content; locked: Material[] };
  /** Часы (для лимитов попыток); в тестах — свои. */
  now?: () => number;
}

/**
 * Действие игрока, которое может что-то открыть (TECH_PLAN 6.1). ЗВОНОК — не здесь: телефонные
 * линии — свои сценарии (TECH_PLAN 4.14, этап 6).
 */
const CardSchema = z.object({
  file: z.string().min(1).max(10),
  quote: z.string().min(1).max(2000),
});
const ActionSchema = z.object({
  action: z.enum(['ОСМОТР', 'ХОДАТАЙСТВО', 'АДРЕС', 'ПАРОЛЬ', 'РЕШИТЬ', 'ФИНАЛ', 'СТОП']),
  target: z.string().max(300),
  value: z.string().max(2000).optional(),
  cards: z.tuple([CardSchema, CardSchema]).optional(),
});

/** Состояние ссылается только на материалы, которые у игрока есть (P-10). */
function invalidReference(s: PlayerState, materials: Material[]): string | null {
  const allIds = new Set(materials.map((m) => m.id));
  const refs = [
    ...s.wall.items.map((i) => i.materialId),
    ...s.wall.threads.flatMap((t) => [t.from, t.to]),
    ...s.wall.arrivals.flatMap((a) => a.ids),
  ];
  const bad = refs.find((id) => !allIds.has(id));
  return bad ? `нет материала ${bad}` : null;
}

export function createApp({
  db,
  materials,
  production,
  isReady = () => true,
  webDist,
  engine,
  now = () => Date.now(),
}: AppDeps): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => (isReady() ? c.json({ ok: true }) : c.json({ ok: false }, 503)));

  // Пока миграции не применены, данные недоступны — клиент повторит запрос.
  app.use('/api/*', async (c, next) => {
    if (!isReady()) return c.json({ error: 'база не готова' }, 503);
    await next();
  });

  const lockedById = new Map((engine?.locked ?? []).map((m) => [m.id, m]));

  async function loadProgress(): Promise<Progress> {
    const [row] = await db
      .select()
      .from(playerProgress)
      .where(eq(playerProgress.playerId, PLAYER_ID));
    return row?.progress ?? emptyProgress();
  }

  async function saveProgress(progress: Progress) {
    await db
      .insert(playerProgress)
      .values({ playerId: PLAYER_ID, progress })
      .onConflictDoUpdate({
        target: playerProgress.playerId,
        set: { progress, updatedAt: new Date() },
      });
  }

  /** Материалы игрока: стартовые + открытые им закрытые (только они уходят в браузер). */
  const playerMaterials = (progress: Progress): Material[] => [
    ...materials,
    ...progress.released.flatMap((id) => lockedById.get(id) ?? []),
  ];

  // Только чтение: «видено» отмечает сам движок на следующем действии (ответ уже доставил
  // открытое) — запись отсюда шла бы мимо очереди действий и могла затереть открытое.
  app.get('/api/materials', async (c) => c.json(playerMaterials(await loadProgress())));

  app.get('/api/state', async (c) => {
    const [row] = await db.select().from(playerState).where(eq(playerState.playerId, PLAYER_ID));
    const mine = playerMaterials(await loadProgress());
    // Старое сохранение поднимается до текущей версии, нечитаемое — заменяется начальным.
    const saved = row ? upgradeState(row.state, mine) : null;
    const state = reconcile(saved ?? defaultState(mine), mine);
    return c.json(state);
  });

  /** Одно действие через движок: ответ правила и материалы, которые оно открыло. */
  async function runAction(input: ActionInput) {
    if (!engine) return null;
    // Действия идут по очереди: иначе два запроса подряд затёрли бы прогресс. Очередь — в
    // одном процессе; несколько процессов сервера (этап 6) — транзакция с блокировкой строки.
    const run = queue.then(async () => {
      const before = await loadProgress();
      const { progress, outcome } = act(engine.content, before, input, now());
      await saveProgress(progress);
      return {
        // Вид итога («нет правила», «нет доступа»…) говорит об устройстве правил — только в
        // разработке (служебная строка); игроку хватает ответа и открытого.
        ...(production ? {} : { result: outcome.result }),
        reply: outcome.reply,
        released: outcome.released.flatMap((id) => lockedById.get(id) ?? []),
      };
    });
    queue = run.catch(() => undefined);
    return run;
  }
  let queue: Promise<unknown> = Promise.resolve();

  app.post('/api/action', bodyLimit({ maxSize: 64 * 1024 }), async (c) => {
    if (!engine) return c.notFound();
    const parsed = ActionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'неверное действие' }, 400);
    // «Решить дело» до конца (ФИНАЛ, СТОП) — этап 5: пока в production закрывать дело нельзя.
    if (production && (parsed.data.action === 'ФИНАЛ' || parsed.data.action === 'СТОП')) {
      return c.json({ error: 'неверное действие' }, 400);
    }
    return c.json(await runAction(parsed.data));
  });

  // Служебная строка действий — только в разработке (E2-CHECK-A): «ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ».
  app.post('/api/dev/action-line', bodyLimit({ maxSize: 64 * 1024 }), async (c) => {
    if (production || !engine) return c.notFound();
    const body = (await c.req.json().catch(() => null)) as { line?: unknown } | null;
    const input = typeof body?.line === 'string' ? parseActionLine(body.line) : null;
    if (!input) {
      return c.json({ error: 'Не разобрано. Формат: ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ' }, 400);
    }
    const ok = ActionSchema.safeParse(input);
    if (!ok.success) return c.json({ error: 'Звонки — по телефонной линии (этап 6).' }, 400);
    return c.json(await runAction(ok.data));
  });

  app.put('/api/state', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = PlayerStateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'неверное состояние' }, 400);
    const bad = invalidReference(parsed.data, playerMaterials(await loadProgress()));
    if (bad) return c.json({ error: bad }, 400);
    const seqHeader = Number(c.req.header('x-state-seq'));
    const seq = Number.isSafeInteger(seqHeader) && seqHeader > 0 ? seqHeader : Date.now() * 1000;
    await db
      .insert(playerState)
      .values({ playerId: PLAYER_ID, state: parsed.data, seq })
      .onConflictDoUpdate({
        target: playerState.playerId,
        set: { state: parsed.data, seq, updatedAt: new Date() },
        setWhere: sql`${playerState.seq} < ${seq}`,
      });
    return c.body(null, 204);
  });

  app.delete('/api/state', async (c) => {
    if (production) return c.notFound();
    await db.delete(playerState).where(eq(playerState.playerId, PLAYER_ID));
    await db.delete(playerProgress).where(eq(playerProgress.playerId, PLAYER_ID));
    return c.body(null, 204);
  });

  if (webDist) {
    const isApi = (path: string) => path === '/api' || path.startsWith('/api/');
    const files = serveStatic({ root: webDist });
    const index = serveStatic({ root: webDist, path: 'index.html' });
    app.use('/*', (c, next) => (isApi(c.req.path) ? next() : files(c, next)));
    // Любой другой путь страницы — та же игра (одна страница).
    app.use('*', (c, next) => (isApi(c.req.path) ? next() : index(c, next)));
  }

  return app;
}
