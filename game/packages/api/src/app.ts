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
import { and, asc, eq, isNotNull, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  type Db,
  loginTokens,
  playerLetters,
  playerProgress,
  playerState,
  players,
  sessions,
} from './db/client.ts';
import { authRoutes, LOCAL_PLAYER, newKey, SESSION_COOKIE, sessionPlayer } from './login.ts';
import { formPage, notePage, replyLetter } from './mail/letters.ts';
import type { Mailer } from './mail/mailer.ts';

/** Переменные запроса: игрок из сессии (6a-1). */
type Env = { Variables: { player: string } };

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
  /**
   * Вход (6a-1): `link` — по ссылке на почту, у каждого игрока своё дело; `off` — один игрок
   * без входа (как до этапа 6; тесты сервера).
   */
  auth?: 'off' | 'link';
  /** Исходящая почта (ML-A); без неё ответы — только во «Входящие» на столе. */
  mailer?: Mailer;
  /** Адрес игры для ссылок в письмах (в разработке — Vite). */
  publicUrl?: string;
}

/** Письмо-ответ, каким оно хранится. */
interface Letter {
  n: number;
  title: string;
  body: string;
  released: string[];
  deliverAt: Date;
  addedAt: Date | null;
}

/** Куда идут ответы на запросы (6.6, P-14): на почту игрока или сразу во «Входящие». */
type Channel = 'real' | 'internal';

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
    '## Голосовое сообщение',
    '',
    'Запись будет позже: С. Грей благодарит специалиста за правду и говорит, что статья вышла.',
    '',
    '## The Signal',
    '',
    'Газетная страница со статьёй С. Грей — текст появится позже.',
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
/**
 * Лимит попыток (LK-A): 5 неверных → 2 минуты. Запросы в бюро — та же пауза (L6-B, автор 18.11):
 * прежде у них были свои 3 отказа / 10 минут из пакета, и любое другое действие через 2 минуты
 * стирало их счётчик (R1-06). Пакет (access.json) — при пересборке, как у LK-A.
 */
const GAME_CONFIG = { pauseMs: 2 * 60 * 1000, limits: { ПАРОЛЬ: 5, ХОДАТАЙСТВО: 5 } };

/** «м:сс» до конца паузы (секунды — вверх). */
const mmss = (ms: number) => {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function createApp({
  db,
  materials,
  production,
  isReady = () => true,
  webDist,
  engine,
  now = () => Date.now(),
  mailDelayMs = 12_000,
  auth = 'off',
  mailer,
  publicUrl = 'http://localhost:5173',
}: AppDeps): Hono<Env> & { sweepMail: () => Promise<number> } {
  const app = new Hono<Env>();

  // Заголовки безопасности (R1-11): страницу нельзя встроить в чужой сайт (clickjacking на
  // «Новое дело»), браузер не угадывает тип файла и т. п. Политика содержимого (CSP) — при
  // переезде на сервер, вместе с проверкой собранной игры.
  app.use('*', secureHeaders());
  // Предел тела запроса для всех маршрутов (R1-12); у отдельных — свой, меньше.
  app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 }));

  app.get('/api/health', (c) => (isReady() ? c.json({ ok: true }) : c.json({ ok: false }, 503)));

  // Пока миграции не применены, данные недоступны — клиент повторит запрос.
  app.use('/api/*', async (c, next) => {
    if (!isReady()) return c.json({ error: 'база не готова' }, 503);
    await next();
  });

  // Вход по ссылке и «Добавить в дело» из письма — без сессии (6a-1).
  authRoutes(app, { db, auth, mailer, publicUrl, production, materials, now });
  // Ссылка из письма — страница с кнопкой; в дело — только по нажатию (R1-01, M-C).
  app.get('/api/case/add', (c) => addToCase(c.req.query('l') ?? '', false));
  app.post('/api/case/add', bodyLimit({ maxSize: 4096 }), async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    return addToCase(typeof form.l === 'string' ? form.l : '', true);
  });

  // Остальное — дело игрока из сессии; без входа — 401 (клиент покажет экран входа).
  app.use('/api/*', async (c, next) => {
    if (auth === 'off') {
      c.set('player', LOCAL_PLAYER);
      return next();
    }
    const pid = await sessionPlayer(db, getCookie(c, SESSION_COOKIE), now());
    if (!pid) return c.json({ error: 'нужен вход' }, 401);
    c.set('player', pid);
    return next();
  });

  type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
  const lockedById = new Map((engine?.locked ?? []).map((m) => [m.id, m]));

  async function loadProgress(pid: string): Promise<Progress> {
    const [row] = await db.select().from(playerProgress).where(eq(playerProgress.playerId, pid));
    return row?.progress ?? emptyProgress();
  }

  async function saveProgress(pid: string, progress: Progress, q: Db | Tx = db) {
    await q
      .insert(playerProgress)
      .values({ playerId: pid, progress })
      .onConflictDoUpdate({
        target: playerProgress.playerId,
        set: { progress, updatedAt: new Date() },
      });
  }

  async function loadLetters(pid: string): Promise<Letter[]> {
    return db
      .select()
      .from(playerLetters)
      .where(eq(playerLetters.playerId, pid))
      .orderBy(asc(playerLetters.n));
  }

  /** Канал почты игрока: без входа и без почты — всё во «Входящие» на столе. */
  async function channelOf(pid: string): Promise<Channel> {
    if (auth === 'off' || !mailer) return 'internal';
    const [p] = await db
      .select({ ch: players.mailChannel })
      .from(players)
      .where(eq(players.id, pid));
    return p?.ch ?? 'internal';
  }

  /**
   * Материалы игрока: стартовые, открытые им закрытые и доставленные письма-ответы с
   * вложениями (только они уходят в браузер, P-10). Вложения письма, которое ещё в пути, не
   * видны до его доставки. Порядок — по времени поступления: у письма вложения идут перед
   * ним (во «Входящих» письмо стоит впереди своих вложений).
   */
  const playerMaterials = (progress: Progress, letters: Letter[], channel: Channel): Material[] => {
    const t = now();
    const byLetter = new Set(letters.flatMap((l) => l.released));
    const loose = progress.released.filter((id) => !byLetter.has(id));
    // Настоящая почта: письмо в деле только после «Добавить в дело» в самом письме (M-C).
    const delivered = letters.filter(
      (l) =>
        l.deliverAt.getTime() <= t &&
        l.title !== VERDICT_ROW &&
        (channel === 'internal' || l.addedAt !== null),
    );
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
  const mine = async (pid: string) =>
    playerMaterials(await loadProgress(pid), await loadLetters(pid), await channelOf(pid));

  // Только чтение: «видено» отмечает сам движок на следующем действии (ответ уже доставил
  // открытое) — запись отсюда шла бы мимо очереди действий и могла затереть открытое.
  app.get('/api/materials', async (c) => c.json(await mine(c.get('player'))));

  /**
   * Письма в пути: через сколько мс каждое ляжет во «Входящие» — клиент заглянет тогда.
   * `waiting` — сколько ответов ждёт «Добавить в дело» на почте (настоящая почта): пока они
   * есть, клиент заглядывает сам.
   */
  app.get('/api/mail/pending', async (c) => {
    const pid = c.get('player');
    const t = now();
    const letters = (await loadLetters(pid)).filter((l) => l.title !== VERDICT_ROW);
    const real = (await channelOf(pid)) === 'real';
    const inMs = real ? [] : letters.map((l) => l.deliverAt.getTime() - t).filter((ms) => ms > 0);
    const waiting = real ? letters.filter((l) => l.addedAt === null).length : 0;
    return c.json({ inMs, waiting });
  });

  app.get('/api/state', async (c) => {
    const pid = c.get('player');
    const [row] = await db.select().from(playerState).where(eq(playerState.playerId, pid));
    const mine_ = await mine(pid);
    // Старое сохранение поднимается до текущей версии, нечитаемое — заменяется начальным.
    const saved = row ? upgradeState(row.state, mine_) : null;
    const state = reconcile(saved ?? defaultState(mine_), mine_);
    return c.json(state);
  });

  /** Одно действие через движок: ответ правила и материалы, которые оно открыло. */
  async function runAction(pid: string, input: ActionInput) {
    if (!engine) return null;
    // Действия игрока идут по очереди: иначе два запроса подряд затёрли бы прогресс.
    const run = serial(pid, async () => {
      const before = await loadProgress(pid);
      const t = now();
      const { progress, outcome } = act(engine.content, before, input, t, GAME_CONFIG);
      await saveProgress(pid, progress);
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
    return run;
  }
  /**
   * Действия одного игрока — по очереди, разных игроков — параллельно (R1-08): прежде одна
   * очередь на весь процесс задерживала всех из-за одного. Несколько процессов сервера — нужна
   * блокировка строки в базе (при переезде, если понадобится).
   */
  const chains = new Map<string, Promise<unknown>>();
  function serial<T>(pid: string, fn: () => Promise<T>): Promise<T> {
    const run = (chains.get(pid) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => undefined);
    chains.set(pid, tail);
    void tail.then(() => {
      if (chains.get(pid) === tail) chains.delete(pid);
    });
    return run;
  }

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
    return c.json(await runAction(c.get('player'), parsed.data));
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
    return c.json(await runAction(c.get('player'), ok.data));
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
    const pid = c.get('player');
    const run = serial(pid, async () => {
      const before = await loadProgress(pid);
      // После «Решить дело» запросов нет (P-9): папка запроса уступает место форме.
      if (caseOf(before).form || before.ended) return { form: CLOSED };
      const letters = await loadLetters(pid);
      const channel = await channelOf(pid);
      const own = new Set(playerMaterials(before, letters, channel).map((m) => m.id));
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
        GAME_CONFIG,
      );
      if (outcome.result === 'лимит') {
        const wait = fieldWait(engine.content, before, 'ХОДАТАЙСТВО', to, t, GAME_CONFIG);
        return {
          form: `Адресат ответил отказом на ${GAME_CONFIG.limits.ХОДАТАЙСТВО} запросов подряд. Новый запрос он рассмотрит через ${mmss(wait)}.`,
        };
      }
      // Общий отказ адресата (PRE-B): ответ сразу в папке, письма нет, попытка засчитана.
      if (GENERAL_REFUSAL_IDS.has(outcome.rule)) {
        await saveProgress(pid, progress);
        return { refused: outcome.reply };
      }
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
      // Прогресс и письмо — одной транзакцией (R1-07): иначе между ними вложения на миг (а при
      // сбое — навсегда) уходили игроку без письма, мимо задержки доставки (P-10).
      await db.transaction(async (tx) => {
        await saveProgress(pid, progress, tx);
        await tx.insert(playerLetters).values({
          playerId: pid,
          n,
          title: `Ответ на запрос № ${n}`,
          body,
          released: outcome.released,
          sentAt: new Date(t),
          deliverAt: new Date(t + mailDelayMs),
          // Ссылка «Добавить в дело» — у каждого письма: игрок мог переключить канал на почту, пока
          // письмо в пути, — тогда оно уйдёт на почту в срок, а не пропадёт (R1-05).
          token: newKey(),
        });
      });
      // Настоящая почта: письмо уйдёт в срок доставки (sweepMail); в игре — «направлен на почту».
      if (channel === 'real') setTimeout(() => void sweepMail(), mailDelayMs + 50).unref();
      return { n, delayMs: mailDelayMs, ...(channel === 'real' ? { toMail: true } : {}) };
    });
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

  app.get('/api/case', async (c) => {
    const pid = c.get('player');
    return c.json({
      ...caseOf(await loadProgress(pid)),
      result: verdictOf(await loadLetters(pid)),
    });
  });

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
    const pid = c.get('player');
    const run = serial(pid, async () => {
      const before = await loadProgress(pid);
      const st = caseOf(before);
      if (st.sent) return { error: 'Заключение уже отправлено.' };
      if (!st.form) return { error: 'Сначала откройте форму: «Решить дело».' };
      const letters = await loadLetters(pid);
      const own = new Set(playerMaterials(before, letters, await channelOf(pid)).map((m) => m.id));
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
      const score = scoreVerdict(rubric, given);
      const result: VerdictResult = { answers, marks: score.marks, groups: score.groups };
      // Итог хранится строкой писем (игроку не письмом): после перезагрузки ответ бюро тот же.
      // Конец дела и итог — одной транзакцией (R1-07): иначе «отправлено, ответа нет».
      await db.transaction(async (tx) => {
        await saveProgress(pid, progress, tx);
        await tx.insert(playerLetters).values({
          playerId: pid,
          n: (letters.at(-1)?.n ?? 0) + 1,
          title: VERDICT_ROW,
          body: JSON.stringify(result),
          released: [],
          sentAt: new Date(t),
          deliverAt: new Date(t),
        });
      });
      return { result };
    });
    const r = await run;
    if ('error' in r) return c.json({ error: r.error }, 422);
    return c.json(r);
  });

  app.put('/api/state', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = PlayerStateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'неверное состояние' }, 400);
    const pid = c.get('player');
    const bad = invalidReference(parsed.data, await mine(pid));
    if (bad) return c.json({ error: bad }, 400);
    const seqHeader = Number(c.req.header('x-state-seq'));
    const seq = Number.isSafeInteger(seqHeader) && seqHeader > 0 ? seqHeader : Date.now() * 1000;
    await db
      .insert(playerState)
      .values({ playerId: pid, state: parsed.data, seq })
      .onConflictDoUpdate({
        target: playerState.playerId,
        set: { state: parsed.data, seq, updatedAt: new Date() },
        setWhere: sql`${playerState.seq} < ${seq}`,
      });
    return c.body(null, 204);
  });

  // Одной транзакцией: сбой посередине не оставит дело наполовину сброшенным (R1-07).
  const resetCase = (pid: string) =>
    db.transaction(async (tx) => {
      await tx.delete(playerState).where(eq(playerState.playerId, pid));
      await tx.delete(playerProgress).where(eq(playerProgress.playerId, pid));
      await tx.delete(playerLetters).where(eq(playerLetters.playerId, pid));
    });

  app.delete('/api/state', async (c) => {
    if (production) return c.notFound();
    await resetCase(c.get('player'));
    return c.body(null, 204);
  });

  /**
   * «Новое дело» из главного меню (MM-A): прогресс, раскладка и письма — с начала. Работает и в
   * production: игрок подтверждает в меню. Пока игрок один (этап 1); с входом (этап 6) — свой.
   */
  app.post('/api/new-case', async (c) => {
    // В очереди игрока: действие, начатое раньше, не запишет старый прогресс поверх сброса (R1-08).
    const pid = c.get('player');
    await serial(pid, () => resetCase(pid));
    return c.body(null, 204);
  });

  /**
   * Канал почты (P-14, «письмо не пришло»): `internal` — ответы сразу во «Входящие» на столе.
   * Обратно на настоящую почту: всё уже доставленное остаётся в деле.
   */
  app.put('/api/me/channel', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { channel?: unknown } | null;
    const ch = body?.channel;
    if (auth === 'off') return c.json({ error: 'без входа почты нет' }, 400);
    if (ch !== 'real' && ch !== 'internal') return c.json({ error: 'неверный канал' }, 400);
    const pid = c.get('player');
    const t = new Date(now());
    if (ch === 'real') {
      await db
        .update(playerLetters)
        .set({ addedAt: t })
        .where(
          and(
            eq(playerLetters.playerId, pid),
            isNull(playerLetters.addedAt),
            lte(playerLetters.deliverAt, t),
          ),
        );
    }
    await db.update(players).set({ mailChannel: ch }).where(eq(players.id, pid));
    return c.body(null, 204);
  });

  /**
   * «Добавить в дело» из письма (M-C): ключ письма — сам пропуск, вход не нужен (ссылку
   * открывают и с телефона). Письмо и вложения ложатся во «Входящие» на столе.
   */
  async function addToCase(token: string, confirmed: boolean): Promise<Response> {
    const html = (body: string, status = 200) =>
      new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
    const page = (title: string, text: string, status = 200) =>
      html(notePage(title, text, { label: 'Открыть дело', href: `${publicUrl}/` }), status);
    const t = new Date(now());
    const [l] =
      token.length >= 20
        ? await db
            .select()
            .from(playerLetters)
            .where(and(eq(playerLetters.token, token), lte(playerLetters.deliverAt, t)))
        : [];
    if (!l) return page('Ссылка не работает', 'Письмо не найдено.', 404);
    if (!confirmed && !l.addedAt)
      return html(
        formPage(
          'Добавить в дело?',
          `Ответ на запрос № ${l.n}${l.released.length ? ' и вложения' : ''} появится во «Входящих» на столе.`,
          { action: '/api/case/add', field: 'l', value: token, button: 'Добавить в дело' },
        ),
      );
    if (!l.addedAt) {
      await db
        .update(playerLetters)
        .set({ addedAt: t })
        .where(and(eq(playerLetters.playerId, l.playerId), eq(playerLetters.n, l.n)));
    }
    return page(
      'Добавлено в дело',
      `Ответ на запрос № ${l.n}${l.released.length ? ' и вложения' : ''} — во «Входящих» на столе. Вернитесь к компьютеру.`,
    );
  }

  /**
   * Разослать ответы, срок доставки которых наступил (настоящая почта): письмо со ссылкой
   * «Добавить в дело». Не ушло (почта не ответила) — повтор при следующем проходе.
   */
  let sweeping = false;
  let purgedAt = 0;
  async function sweepMail(): Promise<number> {
    if (!mailer || auth === 'off' || sweeping) return 0;
    sweeping = true;
    let sent = 0;
    try {
      // Раз в час — убрать истёкшие сессии и ссылки входа: иначе копятся вечно (R1-14).
      if (now() - purgedAt > 3_600_000) {
        purgedAt = now();
        const t = new Date(now());
        await db.delete(sessions).where(lt(sessions.expiresAt, t));
        await db.delete(loginTokens).where(lt(loginTokens.expiresAt, t));
      }
      const due = await db
        .select({ l: playerLetters, email: players.email })
        .from(playerLetters)
        .innerJoin(players, eq(players.id, playerLetters.playerId))
        .where(
          and(
            isNull(playerLetters.mailedAt),
            isNull(playerLetters.addedAt),
            isNotNull(playerLetters.token),
            ne(playerLetters.title, VERDICT_ROW),
            lte(playerLetters.deliverAt, new Date(now())),
            eq(players.mailChannel, 'real'),
          ),
        );
      for (const { l, email } of due) {
        const link = `${publicUrl}/api/case/add?l=${l.token}`;
        try {
          await mailer.send(replyLetter(email, l, link));
          await db
            .update(playerLetters)
            .set({ mailedAt: new Date(now()) })
            .where(and(eq(playerLetters.playerId, l.playerId), eq(playerLetters.n, l.n)));
          sent++;
        } catch (e) {
          console.error(`почта: ответ № ${l.n} не ушёл — ${(e as Error).message}`);
        }
      }
    } catch (e) {
      // База недоступна (перезапуск, сеть): проход пропущен, следующий — через 5 с. Без catch
      // отказ ронял процесс сервера (R4-03).
      console.error(`почта: проход не удался — ${(e as Error).message}`);
    } finally {
      sweeping = false;
    }
    return sent;
  }

  if (webDist) {
    const isApi = (path: string) => path === '/api' || path.startsWith('/api/');
    const files = serveStatic({ root: webDist });
    const index = serveStatic({ root: webDist, path: 'index.html' });
    app.use('/*', (c, next) => (isApi(c.req.path) ? next() : files(c, next)));
    // Любой другой путь страницы — та же игра (одна страница).
    app.use('*', (c, next) => (isApi(c.req.path) ? next() : index(c, next)));
  }

  return Object.assign(app, { sweepMail });
}
