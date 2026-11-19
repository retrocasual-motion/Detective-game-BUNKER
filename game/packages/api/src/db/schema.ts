import type { Progress } from '@bunker/engine';
import type { PlayerState } from '@bunker/shared';
import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
 * Итог отправленного заключения (A-270): ответы и отметки по вопросам — ответ бюро на экране и
 * после перезагрузки. До A-272 хранился строкой в таблице писем-ответов (`player_letters`).
 */
export const playerVerdicts = pgTable('player_verdicts', {
  playerId: text('player_id').primaryKey(),
  result: jsonb('result').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Игроки (6a-1): вход по ссылке на почту (T-14-A). */
export const players = pgTable('players', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
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
