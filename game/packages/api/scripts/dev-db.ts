import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { env } from '../src/env.ts';
import { clearStalePg, pgAnswers } from './stale-pg.ts';

/** Папка `game/`: зависшие процессы базы ищем только среди её пакетов. */
const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

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

if (!(await portBusy(env.pgPort))) {
  await startOwn();
} else if (await pgAnswers(env.databaseUrl)) {
  console.log(`db: PostgreSQL на порту ${env.pgPort} уже запущен — используем его`);
  setInterval(() => {}, 1 << 30);
} else {
  // Порт занят, а база не отвечает: от прошлого запуска остался зависший процесс (09.11).
  console.log(`db: порт ${env.pgPort} занят, но база не отвечает — убираю зависшую базу…`);
  const n = await clearStalePg(env.pgPort, gameDir).catch(() => 0);
  for (let i = 0; i < 20 && (await portBusy(env.pgPort)); i++) await delay(250);
  if (n === 0 || (await portBusy(env.pgPort))) {
    console.error(
      n === 0
        ? `db: порт ${env.pgPort} держит не база игры — её не трогаю. Закройте ту программу ` +
            '(или задайте другой PG_PORT в game/.env) и запустите игру снова.'
        : `db: не получилось освободить порт ${env.pgPort}. Закройте окно игры, в Диспетчере ` +
            'задач завершите postgres.exe (вкладка «Подробности») и запустите игру снова.',
    );
    process.exit(1);
  }
  console.log(`db: зависшая база убрана (процессов: ${n}) — запускаю заново`);
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
