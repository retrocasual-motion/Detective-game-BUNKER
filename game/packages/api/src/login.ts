import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Material } from '@bunker/shared';
import { getConnInfo } from '@hono/node-server/conninfo';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { type Db, loginTokens, players, sessions } from './db/client.ts';
import { windowLimit } from './limit.ts';
import { bureauLetter, formPage, loginLetter, notePage } from './mail/letters.ts';
import type { Mailer } from './mail/mailer.ts';

/**
 * Вход по ссылке на почту (6a-1, T-14-A): игрок вводит почту → письмо со ссылкой → ссылка
 * открывает дело в этом браузере (cookie сессии). Пароля нет. При первом входе на почту
 * приходит письмо бюро о возобновлении дела (01, И-1).
 */

/** Игрок без входа (`AUTH=off`): так было до этапа 6 — одно дело на всю базу. */
export const LOCAL_PLAYER = 'local';
export const SESSION_COOKIE = 'bunker_sid';

const LINK_MINUTES = 30;
const SESSION_DAYS = 90;
/** Не чаще одного письма со ссылкой в минуту на адрес. */
const RESEND_MS = 60_000;
/** Писем входа с одного адреса подключения за час и всего за час (R1-02). */
const PER_IP_HOUR = 10;
const ALL_HOUR = 300;

/**
 * Адрес игрока: подключение; за обратным прокси (`trustProxy`, RV-63) — последний адрес в
 * `X-Forwarded-For` (его дописывает наш прокси; то, что раньше, мог подставить сам игрок).
 */
function clientIp(c: Context, trustProxy = false): string {
  if (trustProxy) {
    const last = c.req.header('x-forwarded-for')?.split(',').pop()?.trim();
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Случайный ключ для ссылок и cookie (256 бит). */
export const newKey = () => randomBytes(32).toString('base64url');
/** В базе — только отпечаток ключа: утечка таблицы не даёт войти. */
const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');

const EmailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** Игрок по cookie сессии (или null — сессии нет, она истекла). */
export async function sessionPlayer(
  db: Db,
  key: string | undefined,
  t: number,
): Promise<string | null> {
  if (!key) return null;
  const [s] = await db
    .select({ playerId: sessions.playerId })
    .from(sessions)
    .where(and(eq(sessions.hash, hashKey(key)), gt(sessions.expiresAt, new Date(t))));
  return s?.playerId ?? null;
}

/**
 * Продлить вход игрока, который играет (RV-57): сессия была ровно 90 дней с входа, и посреди игры
 * сохранение вдруг получало 401. Не чаще раза в сутки — ещё SESSION_DAYS дней, cookie тоже.
 */
export async function renewSession(
  c: Context,
  db: Db,
  key: string,
  t: number,
  secure: boolean,
): Promise<void> {
  const renewed = await db
    .update(sessions)
    .set({ expiresAt: new Date(t + SESSION_DAYS * 86_400_000) })
    .where(
      and(
        eq(sessions.hash, hashKey(key)),
        lt(sessions.expiresAt, new Date(t + (SESSION_DAYS - 1) * 86_400_000)),
      ),
    )
    .returning({ hash: sessions.hash });
  if (renewed.length)
    setCookie(c, SESSION_COOKIE, key, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    });
}

interface AuthDeps {
  db: Db;
  auth: 'off' | 'link';
  mailer?: Mailer;
  publicUrl: string;
  production: boolean;
  materials: Material[];
  now: () => number;
  /** За обратным прокси: адрес игрока — из его заголовка (RV-63). */
  trustProxy?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: маршруты входа не зависят от переменных запроса
export function authRoutes(app: Hono<any>, deps: AuthDeps) {
  const { db, auth, mailer, publicUrl, production, materials, now, trustProxy } = deps;
  const secure = publicUrl.startsWith('https://');
  const perIp = windowLimit(PER_IP_HOUR, 3_600_000, now);
  const all = windowLimit(ALL_HOUR, 3_600_000, now);
  /** Письмо этому адресу уже собирается — второй одновременный запрос его не дублирует. */
  const sending = new Set<string>();

  /** Игрок по почте; новый — создаётся, и ему уходит письмо бюро (01). */
  async function playerFor(email: string): Promise<string> {
    const [p] = await db.select({ id: players.id }).from(players).where(eq(players.email, email));
    if (p) return p.id;
    const id = randomUUID();
    await db.insert(players).values({ id, email }).onConflictDoNothing();
    const [made] = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.email, email));
    if (made?.id === id) {
      const m01 = materials.find((m) => m.id === '01');
      if (m01 && mailer) {
        await mailer
          .send(bureauLetter(email, m01, `${publicUrl}/`))
          .catch((e: Error) => console.error(`почта: письмо бюро не ушло — ${e.message}`));
      }
    }
    return made?.id ?? id;
  }

  async function startSession(c: Context, playerId: string) {
    const key = newKey();
    const t = now();
    await db.insert(sessions).values({
      hash: hashKey(key),
      playerId,
      expiresAt: new Date(t + SESSION_DAYS * 86_400_000),
    });
    setCookie(c, SESSION_COOKIE, key, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    });
  }

  /** Кто вошёл: почта; без входа — 401. */
  app.get('/api/me', async (c) => {
    if (auth === 'off') return c.json({ auth: 'off' });
    const pid = await sessionPlayer(db, getCookie(c, SESSION_COOKIE), now());
    const [p] = pid ? await db.select().from(players).where(eq(players.id, pid)) : [];
    if (!p) return c.json({ auth: 'link' }, 401);
    return c.json({ auth: 'link', email: p.email });
  });

  /** Ввести почту → письмо со ссылкой для входа. */
  app.post('/api/login', bodyLimit({ maxSize: 4096 }), async (c) => {
    if (auth === 'off') return c.json({ error: 'вход выключен' }, 400);
    const parsed = EmailSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Проверьте адрес почты.' }, 400);
    const { email } = parsed.data;
    if (!mailer) return c.json({ error: 'Почта не настроена.' }, 503);
    if (sending.has(email)) return c.json({ sent: true, again: true });
    const t = now();
    const [last] = await db
      .select({ at: loginTokens.createdAt })
      .from(loginTokens)
      .where(eq(loginTokens.email, email))
      .orderBy(desc(loginTokens.createdAt))
      .limit(1);
    if (last && t - last.at.getTime() < RESEND_MS) return c.json({ sent: true, again: true });
    if (sending.has(email)) return c.json({ sent: true, again: true });
    if (!perIp.take(clientIp(c, trustProxy)) || !all.take('all'))
      return c.json({ error: 'Слишком много писем. Попробуйте через час.' }, 429);
    sending.add(email);
    try {
      return await sendLink(c, email, t);
    } finally {
      sending.delete(email);
    }
  });

  async function sendLink(c: Context, email: string, t: number) {
    if (!mailer) return c.json({ error: 'Почта не настроена.' }, 503);
    const key = newKey();
    await db.insert(loginTokens).values({
      hash: hashKey(key),
      email,
      createdAt: new Date(t),
      expiresAt: new Date(t + LINK_MINUTES * 60_000),
    });
    const link = `${publicUrl}/api/login/verify?token=${key}`;
    try {
      await mailer.send(loginLetter(email, link, LINK_MINUTES));
    } catch (e) {
      console.error(`почта: ссылка для входа не ушла — ${(e as Error).message}`);
      await db.delete(loginTokens).where(eq(loginTokens.hash, hashKey(key)));
      return c.json(
        {
          error: production
            ? 'Письмо не отправлено. Попробуйте ещё раз через минуту.'
            : 'Письмо не отправлено: почта не отвечает (запущен ли Mailpit?).',
        },
        502,
      );
    }
    return c.json({ sent: true });
  }

  const deadLink = () =>
    notePage(
      'Ссылка не работает',
      'Ссылка для входа устарела или уже открыта. Запросите новую на странице игры.',
      { label: 'Открыть игру', href: `${publicUrl}/` },
    );

  /**
   * Ссылка из письма — страница с кнопкой «Войти»; сама ссылка ничего не тратит (R1-01): её
   * открывают почтовые сканеры раньше человека.
   */
  app.get('/api/login/verify', async (c) => {
    if (auth === 'off') return c.redirect(`${publicUrl}/`);
    const key = c.req.query('token') ?? '';
    const t = new Date(now());
    const [tok] = key
      ? await db
          .select({ email: loginTokens.email })
          .from(loginTokens)
          .where(
            and(
              eq(loginTokens.hash, hashKey(key)),
              isNull(loginTokens.usedAt),
              gt(loginTokens.expiresAt, t),
            ),
          )
      : [];
    if (!tok) return c.html(deadLink(), 400);
    return c.html(
      formPage(
        'Вход в дело № 09-1128',
        'Нажмите «Войти», чтобы открыть дело. Ссылка одноразовая.',
        {
          action: '/api/login/verify',
          field: 'token',
          value: key,
          button: 'Войти',
        },
      ),
    );
  });

  /** Кнопка «Войти»: ссылка одноразовая, 30 минут → сессия и дело. */
  app.post('/api/login/verify', bodyLimit({ maxSize: 4096 }), async (c) => {
    if (auth === 'off') return c.redirect(`${publicUrl}/`, 303);
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const key = typeof form.token === 'string' ? form.token : '';
    const t = new Date(now());
    const [tok] = key
      ? await db
          .update(loginTokens)
          .set({ usedAt: t })
          .where(
            and(
              eq(loginTokens.hash, hashKey(key)),
              isNull(loginTokens.usedAt),
              gt(loginTokens.expiresAt, t),
            ),
          )
          .returning({ email: loginTokens.email })
      : [];
    if (!tok) return c.html(deadLink(), 400);
    await startSession(c, await playerFor(tok.email));
    return c.redirect(`${publicUrl}/`, 303);
  });

  app.post('/api/logout', async (c) => {
    const key = getCookie(c, SESSION_COOKIE);
    if (key) await db.delete(sessions).where(eq(sessions.hash, hashKey(key)));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  /** Только в разработке: войти без письма (автотесты) и посмотреть исходящую почту. */
  app.post('/api/dev/login', async (c) => {
    if (production || auth === 'off') return c.notFound();
    const parsed = EmailSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'почта' }, 400);
    await startSession(c, await playerFor(parsed.data.email));
    return c.body(null, 204);
  });
  app.get('/api/dev/outbox', (c) => {
    if (production || !mailer) return c.notFound();
    return c.json(mailer.outbox);
  });
}
