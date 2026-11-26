import { readFileSync } from 'node:fs';
import type { AccessRules, VerdictRubric } from '@bunker/engine';
import { MaterialSchema } from '@bunker/shared';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { connectDb, migrateDb } from './db/client.ts';
import { env } from './env.ts';
import { createMailer } from './mail/mailer.ts';
import { waitForDatabase } from './startup.ts';
import { startupProblems, startupWarnings } from './startupCheck.ts';

// Опасные настройки на внешнем адресе — не запускаться (RV-62); в разработке — предупредить.
for (const w of startupWarnings(env)) console.warn(`api: внимание — ${w}`);
const problems = startupProblems(env);
if (problems.length) {
  for (const p of problems) console.error(`api: не запускаюсь — ${p}`);
  process.exit(1);
}

const materials = MaterialSchema.array().parse(JSON.parse(readFileSync(env.contentFile, 'utf8')));
// Правила и закрытые материалы — только здесь, на сервере (P-10).
const server = JSON.parse(readFileSync(env.serverContentFile, 'utf8')) as {
  rules: AccessRules;
  locked: unknown;
  verdict: VerdictRubric;
};
const locked = MaterialSchema.array().parse(server.locked);
const engine = {
  locked,
  verdict: server.verdict,
  content: {
    rules: server.rules,
    starting: new Map(materials.map((m) => [m.id, m.body])),
    locked: new Map(locked.map((m) => [m.id, m.body])),
  },
};
const { db } = connectDb(env.databaseUrl);
const mailer =
  env.mailTransport === 'none'
    ? undefined
    : createMailer({
        transport: env.mailTransport,
        mailpitUrl: env.mailpitUrl,
        from: { email: env.mailFrom, name: env.mailFromName },
      });

let ready = false;
const app = createApp({
  db,
  materials,
  production: env.production,
  isReady: () => ready,
  webDist: env.webDist,
  mediaDir: env.mediaDir,
  engine,
  auth: env.auth,
  mailer,
  publicUrl: env.publicUrl,
  trustProxy: env.trustProxy,
});
const srv = serve({ fetch: app.fetch, port: env.apiPort }, (info) => {
  console.log(
    `api: http://localhost:${info.port} (материалов: ${materials.length} + закрытых ${locked.length}, правил: ${server.rules.rules.length})`,
  );
});

// База может подниматься параллельно с сервером — применяем миграции, как только она ответит.
await waitForDatabase(() => migrateDb(db));
ready = true;
console.log('api: база готова');
if (env.auth === 'link' && mailer) {
  console.log(
    `api: вход по ссылке; письма — ${env.mailTransport === 'mailpit' ? `Mailpit ${env.mailpitUrl}` : 'в памяти'}`,
  );
}
// Остановка (Docker, перезапуск, RV-60): дослушать начатые запросы и выйти, а не оборвать их.
for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.once(sig, () => {
    console.log(`api: ${sig} — останавливаюсь`);
    srv.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
// Раз в час — убрать истёкшие сессии и ссылки входа (R1-14). Сбой базы не роняет сервер (R4-03).
setInterval(
  () => void app.purge().catch((e: Error) => console.error(`чистка: не удалась — ${e.message}`)),
  3_600_000,
).unref();
