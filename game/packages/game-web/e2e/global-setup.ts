import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { E2E } from './env.ts';

/**
 * База для автотестов: свежая на каждый прогон, останавливается корректно.
 * Не через webServer: при принудительном завершении на Windows дочерний процесс
 * PostgreSQL остаётся жить и держит порт.
 */
export default async function globalSetup() {
  const dir = await mkdtemp(join(tmpdir(), 'bunker-e2e-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port: Number(E2E.PG_PORT),
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('bunker');
  return async () => {
    await pg.stop();
    await rm(dir, { recursive: true, force: true });
  };
}
