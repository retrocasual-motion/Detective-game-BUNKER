import { existsSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { env } from '../src/env.ts';

/** Локальный PostgreSQL пакетом npm (без Docker, решение 06.11). Данные — в game/.data/. */
const pg = new EmbeddedPostgres({
  databaseDir: env.pgDataDir,
  user: 'postgres',
  password: 'postgres',
  port: env.pgPort,
  persistent: true,
  onLog: () => {},
});

const fresh = !existsSync(join(env.pgDataDir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
const dbName = new URL(env.databaseUrl).pathname.slice(1);
if (fresh) await pg.createDatabase(dbName);
console.log(`db: PostgreSQL на порту ${env.pgPort}, база ${dbName}, данные ${env.pgDataDir}`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
