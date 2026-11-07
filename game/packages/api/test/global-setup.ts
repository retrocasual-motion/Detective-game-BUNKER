import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });

/** Временный PostgreSQL на свободном порту — одинаково локально и в CI. */
export default async function setup(project: TestProject) {
  const dir = await mkdtemp(join(tmpdir(), 'bunker-pg-'));
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('bunker_test');
  project.provide('databaseUrl', `postgres://postgres:postgres@localhost:${port}/bunker_test`);
  return async () => {
    await pg.stop();
    await rm(dir, { recursive: true, force: true });
  };
}
