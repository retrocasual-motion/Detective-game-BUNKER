import type { Progress } from '@bunker/engine';
import type { PlayerState } from '@bunker/shared';
import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const playerState = pgTable('player_state', {
  playerId: text('player_id').primaryKey(),
  state: jsonb('state').$type<PlayerState>().notNull(),
  /**
   * Кто пишет дело (волна 1, RV-48, DEV-A): номер страницы игры, что открыла дело последней. Пишет
   * только она; прежняя получает 409 — «дело открыто в другом месте».
   */
  writer: text('writer').notNull().default(''),
  /** Номер сохранения внутри писателя (счётчик страницы, не часы): опоздавший запрос не затирает новый. */
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Копия сохранения, которое не прочиталось целиком (RV-49): что-то выпало при разборе по частям.
 * Игра её не читает — для ручного восстановления.
 */
export const playerStateBackups = pgTable('player_state_backups', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  playerId: text('player_id').notNull(),
  state: jsonb('state').notNull(),
  dropped: jsonb('dropped').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

/**
 * Выписки с сайтов дела (A-272, DB-B): сайт — другая вкладка и другой домен, стену игрока он не
 * трогает; выписка ждёт здесь, пока вкладка игры её не заберёт (вернулся к игре).
 */
export const pendingExcerpts = pgTable('pending_excerpts', {
  id: text('id').primaryKey(),
  playerId: text('player_id').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
