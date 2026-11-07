import { readFileSync } from 'node:fs';
import { MaterialSchema } from '@bunker/shared';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { connectDb, migrateDb } from './db/client.ts';
import { env } from './env.ts';
import { waitForDatabase } from './startup.ts';

const materials = MaterialSchema.array().parse(JSON.parse(readFileSync(env.contentFile, 'utf8')));
const { db } = connectDb(env.databaseUrl);

let ready = false;
const app = createApp({
  db,
  materials,
  production: env.production,
  isReady: () => ready,
  webDist: env.webDist,
});
serve({ fetch: app.fetch, port: env.apiPort }, (info) => {
  console.log(`api: http://localhost:${info.port} (материалов: ${materials.length})`);
});

// База может подниматься параллельно с сервером — применяем миграции, как только она ответит.
await waitForDatabase(() => migrateDb(db));
ready = true;
console.log('api: база готова');
