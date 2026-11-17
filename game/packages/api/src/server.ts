import { readFileSync } from 'node:fs';
import type { AccessRules, VerdictRubric } from '@bunker/engine';
import { MaterialSchema } from '@bunker/shared';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { connectDb, migrateDb } from './db/client.ts';
import { env } from './env.ts';
import { waitForDatabase } from './startup.ts';

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

let ready = false;
const app = createApp({
  db,
  materials,
  production: env.production,
  isReady: () => ready,
  webDist: env.webDist,
  engine,
  mailDelayMs: env.mailDelayMs,
  verdictDelayMs: env.verdictDelayMs,
});
serve({ fetch: app.fetch, port: env.apiPort }, (info) => {
  console.log(
    `api: http://localhost:${info.port} (материалов: ${materials.length} + закрытых ${locked.length}, правил: ${server.rules.rules.length})`,
  );
});

// База может подниматься параллельно с сервером — применяем миграции, как только она ответит.
await waitForDatabase(() => migrateDb(db));
ready = true;
console.log('api: база готова');
