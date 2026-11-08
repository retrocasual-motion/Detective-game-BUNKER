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
