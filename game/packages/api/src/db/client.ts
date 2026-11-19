import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema.ts';

export {
  loginTokens,
  pendingExcerpts,
  playerProgress,
  playerState,
  players,
  playerVerdicts,
  sessions,
} from './schema.ts';
export type Db = PostgresJsDatabase<typeof schema>;

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export function connectDb(url: string): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { max: 5, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
