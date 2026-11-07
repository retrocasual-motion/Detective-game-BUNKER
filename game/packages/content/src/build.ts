import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Material, MaterialSchema } from '@bunker/shared';

/** Пакет игрока относительно этой папки (src/). */
export const DEFAULT_PLAYER_DIR = '../../../../playtest/packs/v3.3-2026-10-29/player';

/** Изъятые устройства лежат в виде «Слева», а не на столе (TECH_PLAN 4.0, 4.2). */
export const EVIDENCE_IDS = new Set(['24', '47', '48', '49', '50']);

const FILE = /^(\d{2})__.+\.md$/;

export function buildStartingMaterials(playerDir: string): Material[] {
  return readdirSync(playerDir)
    .filter((f) => FILE.test(f))
    .sort()
    .map((sourceFile) => {
      const id = FILE.exec(sourceFile)?.[1] ?? '';
      const body = readFileSync(join(playerDir, sourceFile), 'utf8').replace(/\r\n?/g, '\n');
      const title = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? sourceFile;
      return MaterialSchema.parse({
        id,
        title,
        placement: EVIDENCE_IDS.has(id) ? 'evidence' : 'desk',
        body,
        sourceFile,
      });
    });
}
