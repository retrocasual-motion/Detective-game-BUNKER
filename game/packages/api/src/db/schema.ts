import type { Progress } from '@bunker/engine';
import type { PlayerState } from '@bunker/shared';
import { bigint, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const playerState = pgTable('player_state', {
  playerId: text('player_id').primaryKey(),
  state: jsonb('state').$type<PlayerState>().notNull(),
  /** Номер версии сохранения от клиента: старый запрос, пришедший позже, не затирает новый. */
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Прогресс расследования — пишет только сервер (движок правил): открытые материалы, неверные
 * попытки, почта специалиста, конец дела. Клиент его не присылает: иначе «открыть» материал
 * можно было бы, подправив сохранение (P-10).
 */
export const playerProgress = pgTable('player_progress', {
  playerId: text('player_id').primaryKey(),
  progress: jsonb('progress').$type<Progress>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ответы на запросы (этап 3, MAIL-B): бумажное письмо ложится во «Входящие» на столе через
 * задержку (T-11-A). До `deliverAt` ни письмо, ни его вложения в браузер не уходят (P-10).
 */
export const playerLetters = pgTable(
  'player_letters',
  {
    playerId: text('player_id').notNull(),
    /** Номер запроса у игрока: 1, 2, 3… — он же номер письма M001… */
    n: integer('n').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Вложения — закрытые материалы, открытые этим запросом. */
    released: jsonb('released').$type<string[]>().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    deliverAt: timestamp('deliver_at', { withTimezone: true }).notNull(),
    /**
     * Настоящая почта (6a-1, ML-A): ключ ссылки «Добавить в дело» из письма, когда письмо
     * ушло на почту игрока и когда игрок добавил его в дело. Без `addedAt` письмо у игрока в
     * игре не появляется, пока канал почты — настоящий.
     */
    token: text('token'),
    mailedAt: timestamp('mailed_at', { withTimezone: true }),
    addedAt: timestamp('added_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.n] })],
);

/**
 * Игроки (6a-1): вход по ссылке на почту (T-14-A). `mailChannel` — куда идут ответы на запросы
 * (6.6, P-14): `real` — на почту игрока, `internal` — сразу во «Входящие» на столе.
 */
export const players = pgTable('players', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  mailChannel: text('mail_channel').$type<'real' | 'internal'>().notNull().default('real'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Ссылки для входа: в базе — только отпечаток ключа (SHA-256), ссылка — одноразовая. */
export const loginTokens = pgTable('login_tokens', {
  hash: text('hash').primaryKey(),
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Сессии: cookie браузера → игрок. В базе — отпечаток ключа. */
export const sessions = pgTable('sessions', {
  hash: text('hash').primaryKey(),
  playerId: text('player_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
