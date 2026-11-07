import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStartingMaterials, DEFAULT_PLAYER_DIR } from './build.ts';

const here = dirname(fileURLToPath(import.meta.url));
const playerDir = resolve(process.env.CONTENT_PACK_DIR ?? join(here, DEFAULT_PLAYER_DIR));
const out = join(here, '../dist/starting.json');

const materials = buildStartingMaterials(playerDir);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(materials, null, 2)}\n`);
console.log(`content: ${materials.length} стартовых материалов → ${out}`);
