import type { PlayerState } from '@bunker/shared';
import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const playerState = pgTable('player_state', {
  playerId: text('player_id').primaryKey(),
  state: jsonb('state').$type<PlayerState>().notNull(),
  /** Номер версии сохранения от клиента: старый запрос, пришедший позже, не затирает новый. */
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
