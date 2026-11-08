import { existsSync } from 'node:fs';
import { connect } from 'node:net';
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

/** Порт уже слушают — база осталась от прошлого запуска (окно закрыли, не дождавшись остановки). */
const portBusy = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = connect({ port, host: '127.0.0.1' });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });

if (await portBusy(env.pgPort)) {
  console.log(`db: PostgreSQL на порту ${env.pgPort} уже запущен — используем его`);
  setInterval(() => {}, 1 << 30);
} else {
  await startOwn();
}

async function startOwn() {
  const fresh = !existsSync(join(env.pgDataDir, 'PG_VERSION'));
  if (fresh) await pg.initialise();
  await pg.start();
  const dbName = new URL(env.databaseUrl).pathname.slice(1);
  // Создаём базу всегда, если её нет: первый запуск мог прерваться между initdb и созданием.
  try {
    await pg.createDatabase(dbName);
  } catch (err) {
    // 42P04 — duplicate_database (текст ошибки зависит от языка системы).
    if ((err as { code?: string }).code !== '42P04') throw err;
  }
  console.log(`db: PostgreSQL на порту ${env.pgPort}, база ${dbName}, данные ${env.pgDataDir}`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // Windows: окно закрыли крестиком — успеваем остановить базу (на это есть несколько секунд).
  process.on('SIGHUP', stop);
  setInterval(() => {}, 1 << 30);
}
