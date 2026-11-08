/** Чтение пакета игрока с диска — для автотестов движка и сборки контента (не для браузера). */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Content } from './engine.ts';
import type { AccessRules } from './types.ts';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');

/** Тексты папки: номер до `__` → текст файла. */
export function readTexts(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of readdirSync(dir).sort()) {
    if (f.endsWith('.md') && f.includes('__'))
      out.set(f.split('__')[0] as string, read(join(dir, f)));
  }
  return out;
}

export function readPack(packDir: string): Content {
  return {
    rules: JSON.parse(read(join(packDir, 'gm', 'access.json'))) as AccessRules,
    starting: readTexts(join(packDir, 'player')),
    locked: readTexts(join(packDir, 'locked')),
  };
}
