import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type ActionInput,
  act,
  answerFits,
  type Content,
  type VerdictAnswer as EngineAnswer,
  emptyProgress,
  fieldWait,
  NOBODY,
  type Progress,
  parseActionLine,
  scoreVerdict,
  type VerdictRubric,
} from '@bunker/engine';
import {
  defaultState,
  EPILOGUE_ID,
  ExcerptSchema,
  type Material,
  MEDIA,
  PERSONS,
  readSaved,
  reconcile,
  type SiteFormId,
  type SitePage,
  type VerdictAnswer,
  type VerdictResult,
  VerdictSchema,
} from '@bunker/shared';
import { serveStatic } from '@hono/node-server/serve-static';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import {
  type Db,
  loginTokens,
  pendingExcerpts,
  playerProgress,
  playerState,
  playerStateBackups,
  playerVerdicts,
  sessions,
} from './db/client.ts';
import { authRoutes, LOCAL_PLAYER, renewSession, SESSION_COOKIE, sessionPlayer } from './login.ts';
import type { Mailer } from './mail/mailer.ts';
import { phoneLine } from './phone.ts';
import { formAction, pageOf, readPass, signPass, siteByHost, siteOf, siteUrl } from './sites.ts';

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
  /** Папка медиа `bunker-media` (T-…): файлы из списка MEDIA — по `/api/media/<имя>`. */
  mediaDir?: string;
  /**
   * Движок правил (этап 2): правила и тексты всех материалов, закрытые материалы.
   * Только на сервере — в браузер уходят лишь открытые игроком (P-10).
   */
  engine?: { content: Content; locked: Material[]; verdict?: VerdictRubric };
  /** Часы (для лимитов попыток); в тестах — свои. */
  now?: () => number;
  /**
   * Вход (6a-1): `link` — по ссылке на почту, у каждого игрока своё дело; `off` — один игрок
   * без входа (как до этапа 6; тесты сервера).
   */
  auth?: 'off' | 'link';
  /** Исходящая почта (ML-A): ссылка входа и письмо бюро новому игроку. */
  mailer?: Mailer;
  /** Адрес игры для ссылок в письмах (в разработке — Vite). */
  publicUrl?: string;
  /** Ключ подписи пропусков на сайты дела (A-272); в production — из окружения. */
  siteSecret?: string;
}

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

/**
 * Действие игрока, которое может что-то открыть (TECH_PLAN 6.1). ЗВОНОК — не здесь: телефонные
 * линии — свои сценарии (TECH_PLAN 4.14, этап 6).
 */
const ActionSchema = z.object({
  action: z.enum(['ОСМОТР', 'АДРЕС', 'ПАРОЛЬ', 'РЕШИТЬ', 'ФИНАЛ', 'СТОП']),
  target: z.string().max(300),
  value: z.string().max(2000).optional(),
});

/** Набор на телефоне стола: номер (цифры, +, пробелы, скобки, дефисы) и цифры в разговоре. */
const PhoneSchema = z.object({
  number: z
    .string()
    .max(40)
    .regex(/^[\d+*#\s()-]*$/),
  keys: z
    .string()
    .max(40)
    .regex(/^[\d*#]*$/)
    .optional(),
});

/**
 * Номер страницы игры, что пишет дело (волна 1, RV-48, DEV-A). Без него — сборка до волны 1: её
 * сохранения не принимаются (409), иначе старая вкладка затёрла бы дело.
 */
const WRITER_RE = /^[\w-]{8,64}$/;
const writerOf = (c: Context) => {
  const w = c.req.header('x-state-writer');
  return w && WRITER_RE.test(w) ? w : null;
};

/**
 * Предел тела сохранения — с запасом над пределами схемы (RV-53): блокнот 300 страниц по 4000 знаков
 * кириллицей — уже 2,4 МБ; при 1 МБ полный блокнот получал 413.
 */
const STATE_BODY_LIMIT = 4 * 1024 * 1024;

/**
 * Лимиты попыток — из пакета (A-272, AC-5): ПАРОЛЬ — три неверных подряд, дата газеты — десять
 * (LM-A, автор 19.11); после — пауза поля 2 минуты (настройка; в задании «2–3 минуты»).
 * Поиск — не отправка, промахи не считаются (DS-B, автор 19.11): «Документы программы» в
 * кабинете VAULTLINE. Без паузы и архив номеров газеты, и коды сеансов программы сервера
 * (ручная проверка автора 21.11, NP-A): там перебирают даты и коды — это поиск, не угадывание
 * пароля. Пакет playtest не меняется: у ИИ-игрока лимит раунда прежний.
 */
const GAME_CONFIG = {
  pauseMs: 2 * 60 * 1000,
  unlimited: [
    'документ\\w* программ|поиск документ',
    // Поле игры — «архив номеров газеты»; форма банка («номер ячейки») сюда не попадает.
    'газет|вестник|chronicle',
    'сеанс\\w* пользовател|сервер\\w* объект',
  ],
};

export function createApp({
  db,
  materials,
  production,
  isReady = () => true,
  webDist,
  mediaDir,
  engine,
  now = () => Date.now(),
  auth = 'off',
  mailer,
  publicUrl = 'http://localhost:5173',
  siteSecret = 'bunker-dev-site-secret',
}: AppDeps): Hono<Env> & { purge: () => Promise<void> } {
  const app = new Hono<Env>();

  // Заголовки безопасности (R1-11): страницу нельзя встроить в чужой сайт (clickjacking на
  // «Новое дело»), браузер не угадывает тип файла и т. п. Политика содержимого (CSP) — при
  // переезде на сервер, вместе с проверкой собранной игры.
  app.use('*', secureHeaders());
  // Предел тела запроса для всех маршрутов (R1-12); у отдельных — свой, меньше. У сохранения — свой,
  // больше (RV-53): общий 1 МБ меньше, чем разрешает схема.
  const commonLimit = bodyLimit({ maxSize: 1024 * 1024 });
  app.use('/api/*', (c, next) =>
    c.req.method === 'PUT' && c.req.path === '/api/state' ? next() : commonLimit(c, next),
  );

  app.get('/api/health', (c) => (isReady() ? c.json({ ok: true }) : c.json({ ok: false }, 503)));

  // Пока миграции не применены, данные недоступны — клиент повторит запрос.
  app.use('/api/*', async (c, next) => {
    if (!isReady()) return c.json({ error: 'база не готова' }, 503);
    await next();
  });

  // Вход по ссылке — без сессии (6a-1).
  authRoutes(app, { db, auth, mailer, publicUrl, production, materials, now });

  // Остальное — дело игрока из сессии; без входа — 401 (клиент покажет экран входа). Сайты дела
  // (/api/site/…) узнают игрока сами: у сайта свой домен и своя cookie (A-272).
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/site/')) return next();
    if (auth === 'off') {
      c.set('player', LOCAL_PLAYER);
      return next();
    }
    const key = getCookie(c, SESSION_COOKIE);
    const pid = await sessionPlayer(db, key, now());
    if (!pid || !key) return c.json({ error: 'нужен вход' }, 401);
    await renewSession(c, db, key, now(), publicUrl.startsWith('https://'));
    c.set('player', pid);
    return next();
  });

  // Медиа (T-…): только файлы из списка MEDIA; нет папки или файла — 404 (игра рисует заглушку).
  app.get('/api/media/:name', async (c) => {
    const m = Object.hasOwn(MEDIA, c.req.param('name')) ? MEDIA[c.req.param('name')] : undefined;
    if (!m || !mediaDir) return c.notFound();
    const body = await readFile(join(mediaDir, m.path)).catch(() => null);
    if (!body) return c.notFound();
    return c.body(new Uint8Array(body), 200, {
      'content-type': m.type,
      'cache-control': 'private, max-age=3600',
    });
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

  /**
   * Материалы игрока: стартовые и открытые им закрытые, по порядку открытия (только они уходят в
   * браузер, P-10); после заключения — эпилог.
   */
  const playerMaterials = (progress: Progress): Material[] => [
    ...materials,
    ...progress.released.flatMap((id) => lockedById.get(id) ?? []),
    // Заключение отправлено — эпилог конвертом на столе (автор 17.11).
    ...(progress.ended ? [EPILOGUE] : []),
  ];
  const mine = async (pid: string) => playerMaterials(await loadProgress(pid));

  // Только чтение: «видено» отмечает сам движок на следующем действии (ответ уже доставил
  // открытое) — запись отсюда шла бы мимо очереди действий и могла затереть открытое.
  app.get('/api/materials', async (c) => c.json(await mine(c.get('player'))));

  /** Выписки с сайтов, что ждут стены (A-272): вкладка игры забирает их, когда к ней вернулись. */
  app.get('/api/excerpts', async (c) => {
    const rows = await db
      .select()
      .from(pendingExcerpts)
      .where(eq(pendingExcerpts.playerId, c.get('player')));
    return c.json(rows.map((r) => r.data));
  });
  /** Выписки повешены и сохранены — убрать из очереди. */
  app.post('/api/excerpts/ack', bodyLimit({ maxSize: 16 * 1024 }), async (c) => {
    const body = (await c.req.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 300)
      : [];
    if (ids.length)
      await db
        .delete(pendingExcerpts)
        .where(
          and(eq(pendingExcerpts.playerId, c.get('player')), inArray(pendingExcerpts.id, ids)),
        );
    return c.body(null, 204);
  });

  app.get('/api/state', async (c) => {
    const pid = c.get('player');
    const writer = writerOf(c);
    const [row] = await db.select().from(playerState).where(eq(playerState.playerId, pid));
    const mine_ = await mine(pid);
    // Старое сохранение поднимается до текущей версии; нечитаемое читается по частям (RV-49).
    const read = row ? readSaved(row.state, mine_) : { state: null, dropped: [] };
    const state = reconcile(read.state ?? defaultState(mine_), mine_);
    // Что-то выпало — копия прежнего сохранения остаётся, а прочитанное записывается сразу: копия
    // делается один раз, и прежнее не затирается молча.
    if (row && read.dropped.length) {
      await db
        .insert(playerStateBackups)
        .values({ playerId: pid, state: row.state, dropped: read.dropped.slice(0, 200) });
      await db
        .update(playerState)
        .set({ state, updatedAt: new Date() })
        .where(eq(playerState.playerId, pid));
    }
    // Кто писал до этой страницы: недосланное при выходе из входа дошлётся, только если с тех пор
    // дело никто не писал (RV-57).
    c.header('x-state-last-writer', row?.writer ?? '');
    // Дело занимает эта страница (DEV-A): пишет она, прежняя получит 409.
    if (writer)
      await db
        .insert(playerState)
        .values({ playerId: pid, state, writer, seq: 0 })
        .onConflictDoUpdate({
          target: playerState.playerId,
          set: {
            writer,
            seq: sql`case when ${playerState.writer} = ${writer} then ${playerState.seq} else 0 end`,
          },
        });
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
    // ФИНАЛ и СТОП в production — только формой заключения (/api/verdict).
    const a = parsed.data.action;
    if (production && (a === 'ФИНАЛ' || a === 'СТОП')) {
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
   * Телефон на столе (6a-3, PH-B): номер набран, трубку сняли — что слышно; цифры в разговоре —
   * ответ линии (`phone.ts`). Попыток не тратит, ничего не открывает (PH-1).
   */
  app.post('/api/phone', bodyLimit({ maxSize: 4 * 1024 }), async (c) => {
    if (!engine) return c.notFound();
    const parsed = PhoneSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'неверный номер' }, 400);
    const progress = await loadProgress(c.get('player'));
    return c.json(phoneLine(engine.content, progress, parsed.data.number, parsed.data.keys));
  });

  /** Где дело: открыта ли форма заключения (после «Решить дело» → «Продолжить»), отправлено ли. */
  const caseOf = (p: Progress) => {
    const release = engine?.content.rules.final_form?.release ?? 'L999';
    return { form: p.released.includes(release) && !p.ended, sent: p.ended };
  };

  /** Итог отправленного заключения (по вопросам и по частям) — для ответа бюро на экране. */
  const verdictOf = async (pid: string) => {
    const [row] = await db.select().from(playerVerdicts).where(eq(playerVerdicts.playerId, pid));
    return row ? (row.result as VerdictResult) : null;
  };

  app.get('/api/case', async (c) => {
    const pid = c.get('player');
    return c.json({
      ...caseOf(await loadProgress(pid)),
      result: await verdictOf(pid),
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
    // Пустые ответы не принимаются (VER-A, A-288): форма называет незаполненные вопросы.
    const empty = answers.flatMap((a, k) => (a === null ? [k + 1] : []));
    if (empty.length) return c.json({ error: `Не заполнены вопросы: ${empty.join(', ')}.` }, 422);
    const pid = c.get('player');
    const run = serial(pid, async () => {
      const before = await loadProgress(pid);
      const st = caseOf(before);
      if (st.sent) return { error: 'Заключение уже отправлено.' };
      if (!st.form) return { error: 'Сначала откройте форму: «Решить дело».' };
      const own = new Set(playerMaterials(before).map((m) => m.id));
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
      // Итог хранится: после перезагрузки ответ бюро тот же. Конец дела и итог — одной
      // транзакцией (R1-07): иначе «отправлено, ответа нет».
      await db.transaction(async (tx) => {
        await saveProgress(pid, progress, tx);
        await tx.insert(playerVerdicts).values({ playerId: pid, result, sentAt: new Date(t) });
      });
      return { result };
    });
    const r = await run;
    if ('error' in r) return c.json({ error: r.error }, 422);
    return c.json(r);
  });

  app.put('/api/state', bodyLimit({ maxSize: STATE_BODY_LIMIT }), async (c) => {
    const pid = c.get('player');
    const writer = writerOf(c);
    const seq = Number(c.req.header('x-state-seq'));
    if (!writer || !Number.isSafeInteger(seq) || seq <= 0)
      return c.json({ error: 'elsewhere' }, 409);
    const body = await c.req.json().catch(() => null);
    const mine_ = await mine(pid);
    // Сервер приводит сохранение к допустимому сам (RV-50, RV-55): неверное выпадает, ссылки на
    // чужое и снятое — тоже (P-10). Отказ — только если это вовсе не сохранение.
    const { state } = readSaved(body, mine_);
    if (!state) return c.json({ error: 'неверное состояние' }, 400);
    const clean = reconcile(state, mine_);
    const done = await db
      .update(playerState)
      .set({ state: clean, seq, updatedAt: new Date() })
      .where(
        and(
          eq(playerState.playerId, pid),
          eq(playerState.writer, writer),
          lt(playerState.seq, seq),
        ),
      )
      .returning({ seq: playerState.seq });
    if (done.length) return c.body(null, 204);
    // Не записалось: опоздавший запрос той же страницы (новее уже записан) — не ошибка; дело занято
    // другой страницей или сброшено «Новым делом» — 409 (RV-48, RV-51).
    const [row] = await db
      .select({ writer: playerState.writer })
      .from(playerState)
      .where(eq(playerState.playerId, pid));
    if (row?.writer === writer) return c.body(null, 204);
    return c.json({ error: 'elsewhere' }, 409);
  });

  // Одной транзакцией: сбой посередине не оставит дело наполовину сброшенным (R1-07).
  const resetCase = (pid: string) =>
    db.transaction(async (tx) => {
      await tx.delete(playerState).where(eq(playerState.playerId, pid));
      await tx.delete(playerProgress).where(eq(playerProgress.playerId, pid));
      await tx.delete(playerVerdicts).where(eq(playerVerdicts.playerId, pid));
      await tx.delete(pendingExcerpts).where(eq(pendingExcerpts.playerId, pid));
    });

  app.delete('/api/state', async (c) => {
    if (production) return c.notFound();
    await resetCase(c.get('player'));
    return c.body(null, 204);
  });

  /**
   * «Новое дело» из главного меню (MM-A): прогресс, раскладка и заключение — с начала. Работает и в
   * production: игрок подтверждает в меню. Пока игрок один (этап 1); с входом (этап 6) — свой.
   */
  app.post('/api/new-case', async (c) => {
    // В очереди игрока: действие, начатое раньше, не запишет старый прогресс поверх сброса (R1-08).
    const pid = c.get('player');
    await serial(pid, () => resetCase(pid));
    return c.body(null, 204);
  });

  /** Раз в час — убрать истёкшие сессии и ссылки входа: иначе копятся вечно (R1-14). */
  async function purge(): Promise<void> {
    const t = new Date(now());
    await db.delete(sessions).where(lt(sessions.expiresAt, t));
    await db.delete(loginTokens).where(lt(loginTokens.expiresAt, t));
  }

  // ── Сайты дела (A-272, AC-3; T-1, ST-A) ──────────────────────────────────────────
  const SITE_COOKIE = 'bunker_site';
  const SITE_PASS_MS = 30 * 86_400_000;
  const gameHost = new URL(publicUrl).hostname;
  const siteSecure = publicUrl.startsWith('https://');
  const hostSite = (c: Context) => siteByHost(c.req.header('host'), gameHost);
  /** Игрок на сайте: по cookie сайта (без входа — один игрок). */
  const sitePlayer = (c: Context) =>
    auth === 'off' ? LOCAL_PLAYER : readPass(siteSecret, getCookie(c, SITE_COOKIE), now());
  /** Игрок из игры (сессия) или с другого сайта дела (cookie сайта). */
  const anyPlayer = async (c: Context) =>
    auth === 'off'
      ? LOCAL_PLAYER
      : ((await sessionPlayer(db, getCookie(c, SESSION_COOKIE), now())) ?? sitePlayer(c));

  /**
   * Перейти по адресу (ссылка в материале, адресная строка компьютера, ссылка на сайте): движок
   * АДРЕС; открылось — адрес сайта с пропуском, иначе — ответ (404 и т. п.).
   */
  app.post('/api/site/open', bodyLimit({ maxSize: 4096 }), async (c) => {
    const pid = await anyPlayer(c);
    if (!pid) return c.json({ error: 'нужен вход' }, 401);
    const body = (await c.req.json().catch(() => null)) as { address?: unknown } | null;
    const address = typeof body?.address === 'string' ? body.address.trim().slice(0, 300) : '';
    if (!address) return c.json({ error: 'нет адреса' }, 400);
    const at = siteOf(address);
    // Уже открытый сайт — без движка (F2): после «Решить дело» новые действия закрыты, а
    // перечитать открытое можно (P-9).
    const known = at ? (await loadProgress(pid)).released.includes(at.site.page) : false;
    if (!known) {
      const r = await runAction(pid, { action: 'АДРЕС', target: 'браузер', value: address });
      if (!r) return c.notFound();
      if (r.quiet || !at) return c.json({ reply: r.reply });
    }
    if (!at) return c.notFound();
    const pass = signPass(siteSecret, pid, now() + 10 * 60_000);
    return c.json({ url: `${siteUrl(publicUrl, at.site, at.path)}?enter=${pass}` });
  });

  /** Пропуск из ссылки → своя cookie сайта (хост — сайт дела). */
  app.post('/api/site/enter', bodyLimit({ maxSize: 4096 }), async (c) => {
    if (!hostSite(c)) return c.notFound();
    const body = (await c.req.json().catch(() => null)) as { pass?: unknown } | null;
    const pid = readPass(siteSecret, typeof body?.pass === 'string' ? body.pass : '', now());
    if (!pid) return c.json({ error: 'пропуск недействителен' }, 403);
    setCookie(c, SITE_COOKIE, signPass(siteSecret, pid, now() + SITE_PASS_MS), {
      httpOnly: true,
      sameSite: 'Lax',
      secure: siteSecure,
      path: '/',
      maxAge: SITE_PASS_MS / 1000,
    });
    return c.body(null, 204);
  });

  /** Страница сайта: только открытое игроком (P-10). Вне игры — без форм и текста. */
  app.get('/api/site/page', async (c) => {
    const site = hostSite(c);
    if (!site || !engine) return c.notFound();
    const pid = sitePlayer(c);
    if (!pid) return c.json({ anon: true, domain: site.domain });
    const path = (c.req.query('path') ?? '/').slice(0, 200);
    // Сайт уже открыт — страница без движка (F2): перечитать открытое можно и с открытой формой
    // заключения (P-9); первое открытие — через движок (АДРЕС).
    if (!(await loadProgress(pid)).released.includes(site.page)) {
      const r = await runAction(pid, {
        action: 'АДРЕС',
        target: 'браузер',
        value: `${site.domain}${path === '/' ? '' : path}`,
      });
      if (!r || r.quiet) return c.json({ notFound: r?.reply ?? 'Страница не найдена (404).' });
    }
    const progress = await loadProgress(pid);
    const has = (id: string) => progress.released.includes(id);
    const mat = (id: string) => lockedById.get(id);
    const docsOf = (ids: string[]) =>
      ids.flatMap((id) => {
        const m = has(id) ? mat(id) : undefined;
        return m ? [{ id: m.id, title: m.title, body: m.body }] : [];
      });
    let main = site.page;
    let docs: SitePage['docs'] = [];
    let mailbox: string | undefined;
    if (site.label === 'vaultline-program' && path.startsWith('/cabinet') && has('L620')) {
      main = 'L620';
      docs = docsOf(['L618', 'L619']);
    } else if (site.label === 'docs.hexon-bio') docs = docsOf(['L736', 'L737', 'L738']);
    else if (site.label === 'mailbridge' && path.startsWith('/mail') && has('L453')) {
      main = 'L453';
      mailbox = mat('L453')?.body;
    }
    const m = mat(main);
    if (!m) return c.json({ notFound: 'Страница не найдена (404).' });
    const t = now();
    const wait: SitePage['wait'] = {};
    for (const f of site.forms) {
      const a = formAction(f, { address: 'e.pierce.uk@mailbridge.net' });
      if (a) wait[f] = fieldWait(engine.content, progress, 'ПАРОЛЬ', a.target, t, GAME_CONFIG);
    }
    const page: SitePage = {
      domain: site.domain,
      ...pageOf(m),
      docs,
      ...(mailbox ? { mailbox } : {}),
      // Логин — только тому, кто уже вошёл (он сам его ввёл); в коде страницы его нет (P-10).
      ...(site.label === 'vaultline-program' ? { cabinet: has('L620') ? 'k.walsh' : null } : {}),
      ...(site.label === 'mailbridge' ? { mailOpen: has('L453') } : {}),
      wait,
    };
    return c.json(page);
  });

  /**
   * Выписка с сайта на стену (A-272, DB-B): ждёт, пока вкладка игры её не заберёт. Только из
   * открытого игроком (P-10) и только с сайта дела.
   */
  app.post('/api/site/excerpt', bodyLimit({ maxSize: 8192 }), async (c) => {
    const site = hostSite(c);
    if (!site) return c.notFound();
    const pid = sitePlayer(c);
    if (!pid) return c.json({ error: 'Откройте сайт из материалов дела.' }, 401);
    const parsed = ExcerptSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || parsed.data.place.kind !== 'site')
      return c.json({ error: 'неверная выписка' }, 400);
    const own = new Set(playerMaterials(await loadProgress(pid)).map((m) => m.id));
    if (!own.has(parsed.data.material)) return c.json({ error: 'нет материала' }, 400);
    await db
      .insert(pendingExcerpts)
      .values({ id: parsed.data.id, playerId: pid, data: parsed.data })
      .onConflictDoNothing();
    return c.body(null, 204);
  });

  /** Форма сайта → движок (ПАРОЛЬ): ответ, открытое, пауза поля. */
  app.post('/api/site/form', bodyLimit({ maxSize: 8192 }), async (c) => {
    const site = hostSite(c);
    if (!site || !engine) return c.notFound();
    const pid = sitePlayer(c);
    if (!pid) return c.json({ error: 'Откройте сайт из материалов дела.' }, 401);
    const body = (await c.req.json().catch(() => null)) as {
      form?: unknown;
      values?: unknown;
    } | null;
    const form = body?.form as SiteFormId;
    if (!site.forms.includes(form)) return c.json({ error: 'нет такой формы' }, 400);
    const raw = (body?.values ?? {}) as Record<string, unknown>;
    const values = Object.fromEntries(
      Object.entries(raw)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => [k, (v as string).slice(0, 200)]),
    );
    const a = formAction(form, values);
    if (!a) return c.json({ error: 'нет такой формы' }, 400);
    const r = await runAction(pid, { action: 'ПАРОЛЬ', target: a.target, value: a.value });
    if (!r) return c.notFound();
    return c.json({
      reply: r.reply,
      quiet: r.quiet,
      opened: r.released.map((m) => m.id),
      wait: r.wait ?? 0,
      ...(production ? {} : { result: r.result }),
    });
  });

  if (webDist) {
    const isApi = (path: string) => path === '/api' || path.startsWith('/api/');
    const files = serveStatic({ root: webDist });
    const index = serveStatic({ root: webDist, path: 'index.html' });
    // Сайт дела (хост — `vaultline-program.…`): своя страница сборки (A-272).
    const sitePage = serveStatic({ root: webDist, path: 'sites.html' });
    // Страница сайта (путь без расширения файла) — не `index.html` игры, который раздача файлов
    // отдала бы на «/»; файлы сборки (скрипты, стили) — те же.
    const sitePath = (c: Context) => !!hostSite(c) && !/\.[a-z0-9]+$/i.test(c.req.path);
    app.use('/*', (c, next) => (isApi(c.req.path) || sitePath(c) ? next() : files(c, next)));
    // Любой другой путь страницы — та же игра (одна страница) или страница сайта.
    app.use('*', (c, next) =>
      isApi(c.req.path) ? next() : hostSite(c) ? sitePage(c, next) : index(c, next),
    );
  }

  return Object.assign(app, { purge });
}
