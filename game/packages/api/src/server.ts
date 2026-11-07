import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { MaterialSchema } from '@bunker/shared';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { connectDb, migrateDb } from './db/client.ts';
import { env } from './env.ts';

const materials = MaterialSchema.array().parse(JSON.parse(readFileSync(env.contentFile, 'utf8')));
const { db } = connectDb(env.databaseUrl);

// База может подниматься параллельно с сервером (pnpm dev) — ждём до 60 с.
for (let attempt = 1; ; attempt++) {
  try {
    await migrateDb(db);
    break;
  } catch (err) {
    if (attempt >= 60) throw err;
    await sleep(1000);
  }
}

const app = createApp({ db, materials, production: env.production });
serve({ fetch: app.fetch, port: env.apiPort }, (info) => {
  console.log(`api: http://localhost:${info.port} (материалов: ${materials.length})`);
});
