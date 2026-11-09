import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Корень game/ — от него считаются относительные пути из .env. */
export const GAME_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const envFile = join(GAME_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const fromRoot = (p: string) => (isAbsolute(p) ? p : join(GAME_ROOT, p));
const e = process.env;

export const env = {
  production: e.NODE_ENV === 'production',
  databaseUrl: e.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/bunker',
  apiPort: Number(e.API_PORT ?? 8787),
  contentFile: fromRoot(e.CONTENT_FILE ?? 'packages/content/dist/starting.json'),
  /** Правила и закрытые материалы — только сервер (P-10). */
  serverContentFile: fromRoot(e.SERVER_CONTENT_FILE ?? 'packages/content/dist/server.json'),
  pgDataDir: fromRoot(e.PG_DATA_DIR ?? '.data/pg'),
  pgPort: Number(e.PG_PORT ?? 5433),
  /** Собранный клиент; задаётся в Docker (в разработке клиент отдаёт Vite). */
  webDist: e.WEB_DIST ? fromRoot(e.WEB_DIST) : undefined,
  /** Задержка ответа на ходатайство, мс (DELAY-A; пока 12 с — для проверки автором). */
  mailDelayMs: Number(e.MAIL_DELAY_MS ?? 12_000),
};
