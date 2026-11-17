import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Material } from '@bunker/shared';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { type Db, loginTokens, players, sessions } from './db/client.ts';
import { bureauLetter, loginLetter, notePage } from './mail/letters.ts';
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

interface AuthDeps {
  db: Db;
  auth: 'off' | 'link';
  mailer?: Mailer;
  publicUrl: string;
  production: boolean;
  materials: Material[];
  now: () => number;
}

// biome-ignore lint/suspicious/noExplicitAny: маршруты входа не зависят от переменных запроса
export function authRoutes(app: Hono<any>, deps: AuthDeps) {
  const { db, auth, mailer, publicUrl, production, materials, now } = deps;
  const secure = publicUrl.startsWith('https://');

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

  /** Кто вошёл: почта и куда идут ответы; без входа — 401. */
  app.get('/api/me', async (c) => {
    if (auth === 'off') return c.json({ auth: 'off' });
    const pid = await sessionPlayer(db, getCookie(c, SESSION_COOKIE), now());
    const [p] = pid ? await db.select().from(players).where(eq(players.id, pid)) : [];
    if (!p) return c.json({ auth: 'link' }, 401);
    return c.json({ auth: 'link', email: p.email, channel: mailer ? p.mailChannel : 'internal' });
  });

  /** Ввести почту → письмо со ссылкой для входа. */
  app.post('/api/login', bodyLimit({ maxSize: 4096 }), async (c) => {
    if (auth === 'off') return c.json({ error: 'вход выключен' }, 400);
    const parsed = EmailSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Проверьте адрес почты.' }, 400);
    const { email } = parsed.data;
    if (!mailer) return c.json({ error: 'Почта не настроена.' }, 503);
    const t = now();
    const [last] = await db
      .select({ at: loginTokens.createdAt })
      .from(loginTokens)
      .where(eq(loginTokens.email, email))
      .orderBy(desc(loginTokens.createdAt))
      .limit(1);
    if (last && t - last.at.getTime() < RESEND_MS) return c.json({ sent: true, again: true });
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
  });

  /** Ссылка из письма: одноразовая, 30 минут → сессия и дело. */
  app.get('/api/login/verify', async (c) => {
    if (auth === 'off') return c.redirect(`${publicUrl}/`);
    const key = c.req.query('token') ?? '';
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
    if (!tok) {
      return c.html(
        notePage(
          'Ссылка не работает',
          'Ссылка для входа устарела или уже открыта. Запросите новую на странице игры.',
          { label: 'Открыть игру', href: `${publicUrl}/` },
        ),
        400,
      );
    }
    await startSession(c, await playerFor(tok.email));
    return c.redirect(`${publicUrl}/`);
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
