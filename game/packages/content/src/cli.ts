import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServerContent, buildStartingMaterials, DEFAULT_PACK_DIR } from './build.ts';

const here = dirname(fileURLToPath(import.meta.url));
const packDir = resolve(process.env.CONTENT_PACK_DIR ?? join(here, DEFAULT_PACK_DIR));
const dist = join(here, '../dist');
mkdirSync(dist, { recursive: true });

const write = (name: string, data: unknown) =>
  writeFileSync(join(dist, name), `${JSON.stringify(data, null, 2)}\n`);

const materials = buildStartingMaterials(join(packDir, 'player'));
write('starting.json', materials);
console.log(`content: ${materials.length} стартовых материалов → dist/starting.json`);

// Только для сервера (P-10): правила и закрытые материалы. Клиент этот файл не получает.
const server = buildServerContent(packDir);
write('server.json', server);
console.log(`content: ${server.locked.length} закрытых материалов и правила → dist/server.json`);
