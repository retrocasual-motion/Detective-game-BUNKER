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
  },
  (t) => [primaryKey({ columns: [t.playerId, t.n] })],
);
