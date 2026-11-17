import {
  type ActionInput,
  act,
  answerFits,
  type Content,
  type VerdictAnswer as EngineAnswer,
  emptyProgress,
  fieldWait,
  GENERAL_REFUSAL_IDS,
  NOBODY,
  type Progress,
  parseActionLine,
  petitionFormError,
  scoreVerdict,
  type VerdictRubric,
} from '@bunker/engine';
import {
  type Card,
  defaultState,
  EPILOGUE_ID,
  folderItemId,
  letterBody,
  type Material,
  PERSONS,
  CardSchema as PlayerCardSchema,
  type PlayerState,
  PlayerStateSchema,
  pieceItemId,
  reconcile,
  upgradeState,
  type VerdictAnswer,
  type VerdictResult,
  VerdictSchema,
} from '@bunker/shared';
import { serveStatic } from '@hono/node-server/serve-static';
import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { type Db, playerLetters, playerProgress, playerState } from './db/client.ts';

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
  engine?: { content: Content; locked: Material[]; verdict?: VerdictRubric };
  /** Часы (для лимитов попыток); в тестах — свои. */
  now?: () => number;
  /** Через сколько ответ на запрос ложится во «Входящие», мс (T-11-A; DELAY-A). */
  mailDelayMs?: number;
}

/** Письмо-ответ, каким оно хранится. */
interface Letter {
  n: number;
  title: string;
  body: string;
  released: string[];
  deliverAt: Date;
}

/** После «Решить дело» новых запросов нет (P-9). */
const CLOSED = 'Расследование закрыто: открыта форма заключения. Новые запросы не принимаются.';

/**
 * Эпилог (Ф-3; автор 17.11 — «газетная вырезка или письмо, приходит сам»): материал L997 на
 * столе конвертом после заключения. Текст — по слову автора (A6-D), пока заглушка.
 */
const EPILOGUE: Material = {
  id: EPILOGUE_ID,
  title: 'Эпилог',
  placement: 'desk',
  kind: 'sheet',
  body: [
    '# Эпилог',
    '',
    'Здесь будет эпилог дела — газетная вырезка: материал С. Грей в The Signal. Текст появится позже.',
  ].join('\n'),
  sourceFile: 'epilogue',
};

/** Строка с итогом заключения в таблице писем: игроку письмом не показывается (A-270). */
const VERDICT_ROW = '__verdict';

const letterId = (n: number) => `M${String(n).padStart(3, '0')}`;

/** Запрос из папки (этап 3): Кому, Прошу, На основании. */
const PetitionSchema = z.object({
  to: z.string().min(1).max(200),
  ask: PlayerCardSchema,
  basis: PlayerCardSchema,
});

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
  const own = new Set(materials.map((m) => m.id));
  const card = s.drafts
    .flatMap((d) => [d.ask, d.basis])
    .find((c) => c !== null && !own.has(c.file));
  if (card) return `нет материала ${card.file}`;
  const binned = s.trash.find((id) => !own.has(id));
  if (binned) return `нет материала ${binned}`;
  const allIds = new Set([
    ...materials.map((m) => m.id),
    ...PERSONS.map((p) => p.id),
    ...s.wall.notes.map((n) => n.id),
    // Папка, вынутая из пачки (RD-A): на стене — «F:П-02/18», если её и правда вынули.
    ...(s.taken ?? []).map(folderItemId),
    // Обрывок, вынутый из материала (SRC-A): «S:42/1», если его и правда вынули.
    ...(s.pieces ?? []).map(pieceItemId),
  ]);
  const refs = [...s.wall.items.map((i) => i.id), ...s.wall.threads.flatMap((t) => [t.from, t.to])];
  const bad = refs.find((id) => !allIds.has(id));
  return bad ? `нет материала ${bad}` : null;
}

/**
 * Лимит попыток в игре (LK-A, решение автора 09.11): во всех полях ввода — 5 неверных, потом поле
 * не принимает значение 2 минуты. Заменяет T-11-A пакета (3 → 10 мин; газета — 10 дат).
 */
const GAME_CONFIG = { pauseMs: 2 * 60 * 1000, limits: { ПАРОЛЬ: 5 } };

export function createApp({
  db,
  materials,
  production,
  isReady = () => true,
  webDist,
  engine,
  now = () => Date.now(),
  mailDelayMs = 12_000,
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

  async function loadLetters(): Promise<Letter[]> {
    return db
      .select()
      .from(playerLetters)
      .where(eq(playerLetters.playerId, PLAYER_ID))
      .orderBy(asc(playerLetters.n));
  }

  /**
   * Материалы игрока: стартовые, открытые им закрытые и доставленные письма-ответы с
   * вложениями (только они уходят в браузер, P-10). Вложения письма, которое ещё в пути, не
   * видны до его доставки. Порядок — по времени поступления: у письма вложения идут перед
   * ним (во «Входящих» письмо стоит впереди своих вложений).
   */
  const playerMaterials = (progress: Progress, letters: Letter[]): Material[] => {
    const t = now();
    const byLetter = new Set(letters.flatMap((l) => l.released));
    const loose = progress.released.filter((id) => !byLetter.has(id));
    const delivered = letters.filter((l) => l.deliverAt.getTime() <= t && l.title !== VERDICT_ROW);
    return [
      ...materials,
      ...loose.flatMap((id) => lockedById.get(id) ?? []),
      ...delivered.flatMap((l): Material[] => [
        ...l.released.flatMap((id) => lockedById.get(id) ?? []),
        {
          id: letterId(l.n),
          title: l.title,
          placement: 'desk',
          kind: 'letter',
          body: l.body,
          sourceFile: 'letter',
        },
      ]),
      // Заключение отправлено — эпилог конвертом на столе (автор 17.11).
      ...(progress.ended ? [EPILOGUE] : []),
    ];
  };
  const mine = async () => playerMaterials(await loadProgress(), await loadLetters());

  // Только чтение: «видено» отмечает сам движок на следующем действии (ответ уже доставил
  // открытое) — запись отсюда шла бы мимо очереди действий и могла затереть открытое.
  app.get('/api/materials', async (c) => c.json(await mine()));

  /** Письма в пути: через сколько мс каждое ляжет во «Входящие» — клиент заглянет тогда. */
  app.get('/api/mail/pending', async (c) => {
    const t = now();
    const inMs = (await loadLetters()).map((l) => l.deliverAt.getTime() - t).filter((ms) => ms > 0);
    return c.json({ inMs });
  });

  app.get('/api/state', async (c) => {
    const [row] = await db.select().from(playerState).where(eq(playerState.playerId, PLAYER_ID));
    const mine_ = await mine();
    // Старое сохранение поднимается до текущей версии, нечитаемое — заменяется начальным.
    const saved = row ? upgradeState(row.state, mine_) : null;
    const state = reconcile(saved ?? defaultState(mine_), mine_);
    return c.json(state);
  });

  /** Одно действие через движок: ответ правила и материалы, которые оно открыло. */
  async function runAction(input: ActionInput) {
    if (!engine) return null;
    // Действия идут по очереди: иначе два запроса подряд затёрли бы прогресс. Очередь — в
    // одном процессе; несколько процессов сервера (этап 6) — транзакция с блокировкой строки.
    const run = queue.then(async () => {
      const before = await loadProgress();
      const t = now();
      const { progress, outcome } = act(engine.content, before, input, t, GAME_CONFIG);
      await saveProgress(progress);
      // Повтор осмотра (этап 4b): игрок снова переворачивает тот же лист — на обороте то же,
      // а не служебное «уже выдано ранее».
      const again =
        outcome.result === 'повтор'
          ? engine.content.rules.rules.find((r) => r.id === outcome.rule)?.ok
          : undefined;
      return {
        // Вид итога («нет правила», «нет доступа»…) говорит об устройстве правил — только в
        // разработке (служебная строка); игроку хватает ответа и открытого.
        ...(production ? {} : { result: outcome.result }),
        reply: again ?? outcome.reply,
        // Пустой ответ (общее правило, отказ, нет правила): игра говорит своё («Оборот чистый.»),
        // а не текст бумажного прототипа со списком действий.
        quiet:
          !['успех', 'ответ', 'повтор'].includes(outcome.result) || /-other$/.test(outcome.rule),
        released: outcome.released.flatMap((id) => lockedById.get(id) ?? []),
        // Поле ввода не принимает значение ещё столько мс (LK-A): игра показывает отсчёт.
        ...(input.action === 'ПАРОЛЬ'
          ? {
              wait: fieldWait(engine.content, progress, input.action, input.target, t, GAME_CONFIG),
            }
          : {}),
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
    // Запрос игрок отправляет папкой (/api/petition): ответ — письмом через задержку.
    const a = parsed.data.action;
    if (production && (a === 'ФИНАЛ' || a === 'СТОП' || a === 'ХОДАТАЙСТВО')) {
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

  /**
   * Отправить запрос из папки (4.11; FORM-B, MAIL-B). Ошибка оформления — сразу ответом
   * (422), письмо не уходит и попытка не тратится; лимит отказов — тоже ответом. Общий отказ
   * адресата (PRE-B) — `{refused}` сразу, без письма, попытка засчитана. Иначе движок решает,
   * а ответ ложится письмом во «Входящие» через `mailDelayMs`.
   */
  app.post('/api/petition', bodyLimit({ maxSize: 64 * 1024 }), async (c) => {
    if (!engine) return c.notFound();
    const parsed = PetitionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Запрос не оформлен.' }, 400);
    const { to, ask, basis } = parsed.data;
    const run = queue.then(async () => {
      const before = await loadProgress();
      // После «Решить дело» запросов нет (P-9): папка запроса уступает место форме.
      if (caseOf(before).form || before.ended) return { form: CLOSED };
      const letters = await loadLetters();
      const own = new Set(playerMaterials(before, letters).map((m) => m.id));
      if (!own.has(ask.file) || !own.has(basis.file)) {
        return { form: 'Карточка не из материалов дела.' };
      }
      // Письма-ответы движок ведёт как один файл «почта» (из него тоже берут карточки).
      const toEngine = (cd: Card) => ({
        file: cd.file.startsWith('M') ? 'почта' : cd.file,
        quote: cd.quote,
      });
      const cards: [Card, Card] = [toEngine(ask), toEngine(basis)];
      const formError = petitionFormError(engine.content, before, to, cards);
      if (formError) return { form: formError };
      const t = now();
      const { progress, outcome } = act(
        engine.content,
        before,
        { action: 'ХОДАТАЙСТВО', target: to, cards },
        t,
      );
      if (outcome.result === 'лимит') return { form: outcome.reply };
      await saveProgress(progress);
      // Общий отказ адресата (PRE-B): ответ сразу в папке, письма нет, попытка засчитана.
      if (GENERAL_REFUSAL_IDS.has(outcome.rule)) return { refused: outcome.reply };
      const n = (letters.at(-1)?.n ?? 0) + 1;
      const titled = (id: string) => `${id} — ${lockedById.get(id)?.title ?? ''}`;
      const body = letterBody({
        n,
        to,
        reply: outcome.reply,
        attached: outcome.released.map(titled),
        ask,
        basis,
      });
      await db.insert(playerLetters).values({
        playerId: PLAYER_ID,
        n,
        title: `Ответ на запрос № ${n}`,
        body,
        released: outcome.released,
        sentAt: new Date(t),
        deliverAt: new Date(t + mailDelayMs),
      });
      return { n, delayMs: mailDelayMs };
    });
    queue = run.catch(() => undefined);
    const r = await run;
    if ('form' in r) return c.json({ error: r.form }, 422);
    return c.json(r);
  });

  /** Где дело: открыта ли форма заключения (после «Решить дело» → «Продолжить»), отправлено ли. */
  const caseOf = (p: Progress) => {
    const release = engine?.content.rules.final_form?.release ?? 'L999';
    return { form: p.released.includes(release) && !p.ended, sent: p.ended };
  };

  /** Итог отправленного заключения (по вопросам и по частям) — для ответа бюро на экране. */
  const verdictOf = (letters: Letter[]) => {
    const row = letters.find((l) => l.title === VERDICT_ROW);
    return row ? (JSON.parse(row.body) as VerdictResult) : null;
  };

  app.get('/api/case', async (c) =>
    c.json({ ...caseOf(await loadProgress()), result: verdictOf(await loadLetters()) }),
  );

  /**
   * Отправить заключение (A-270; FM-A, BA-A): пять ответов — человек, карточка материала или
   * вариант. Сервер сверяет с рубрикой пакета (P-10), закрывает дело (ФИНАЛ) и сразу отвечает
   * итогом — ответ бюро на экране (автор 17.11: «не нужно ждать»); эпилог — конвертом на столе.
   */
  app.post('/api/verdict', bodyLimit({ maxSize: 64 * 1024 }), async (c) => {
    const rubric = engine?.verdict;
    if (!engine || !rubric) return c.notFound();
    const parsed = VerdictSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Заключение не оформлено.' }, 400);
    const answers = parsed.data.answers;
    const run = queue.then(async () => {
      const before = await loadProgress();
      const st = caseOf(before);
      if (st.sent) return { error: 'Заключение уже отправлено.' };
      if (!st.form) return { error: 'Сначала откройте форму: «Решить дело».' };
      const letters = await loadLetters();
      const own = new Set(playerMaterials(before, letters).map((m) => m.id));
      const people = new Set([NOBODY, ...PERSONS.map((p) => p.id)]);
      const toEngine = (a: VerdictAnswer): EngineAnswer =>
        a === null ? null : 'card' in a ? { material: a.card.file } : a;
      for (const a of answers) {
        if (a && 'card' in a && !own.has(a.card.file))
          return { error: 'Карточка не из материалов дела.' };
        if (a && 'person' in a && !people.has(a.person))
          return { error: 'Такого человека в деле нет.' };
      }
      const given = answers.map(toEngine);
      if (given.some((a, i) => !rubric.questions[i] || !answerFits(rubric.questions[i], a)))
        return { error: 'Ответ не к тому вопросу.' };
      const t = now();
      const { progress, outcome } = act(
        engine.content,
        before,
        { action: 'ФИНАЛ', target: 'заключение' },
        t,
      );
      if (outcome.result !== 'конец') return { error: outcome.reply };
      await saveProgress(progress);
      const score = scoreVerdict(rubric, given);
      const result: VerdictResult = { answers, marks: score.marks, groups: score.groups };
      // Итог хранится строкой писем (игроку не письмом): после перезагрузки ответ бюро тот же.
      await db.insert(playerLetters).values({
        playerId: PLAYER_ID,
        n: (letters.at(-1)?.n ?? 0) + 1,
        title: VERDICT_ROW,
        body: JSON.stringify(result),
        released: [],
        sentAt: new Date(t),
        deliverAt: new Date(t),
      });
      return { result };
    });
    queue = run.catch(() => undefined);
    const r = await run;
    if ('error' in r) return c.json({ error: r.error }, 422);
    return c.json(r);
  });

  app.put('/api/state', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = PlayerStateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'неверное состояние' }, 400);
    const bad = invalidReference(parsed.data, await mine());
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
    await db.delete(playerLetters).where(eq(playerLetters.playerId, PLAYER_ID));
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
