import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Material, type MaterialKind, MaterialSchema } from '@bunker/shared';

/** Пакет игрока относительно этой папки (src/). */
export const DEFAULT_PLAYER_DIR = '../../../../playtest/packs/v3.3-2026-10-29/player';

/** Изъятые устройства лежат в виде «Слева», а не на столе (TECH_PLAN 4.0, 4.2). */
export const EVIDENCE_IDS = new Set(['24', '47', '48', '49', '50']);

/**
 * Каким предметом материал лежит на столе (TECH_PLAN 4.2, UX-A1). Остальные — лист на бланке.
 * Форма — по тому, что это за вещь в деле, а не по её роли в разгадке (UX_PRINCIPLES Z-2, Z-3).
 */
export const KIND_BY_ID: Readonly<Record<string, MaterialKind>> = {
  // протоколы, описи, регламенты, акты на нескольких листах — скреплённые листы
  ...Object.fromEntries(
    [
      '04',
      '06',
      '07',
      '08',
      '09',
      '10',
      '12',
      '22',
      '25',
      '26',
      '28',
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '36',
    ].map((id) => [id, 'stapled' as const]),
  ),
  '13': 'disc', // видео — диск в конверте
  '14': 'disc',
  '21': 'disc', // аудио — диск в конверте
  '29': 'pack', // сканы пачками
  '38': 'notebook', // журнал обращений — тетрадь
  '39': 'photos', // фото медкабинета и опись
  ...Object.fromEntries(
    ['40', '41', '42', '43', '44', '45', '46'].map((id) => [id, 'bag' as const]),
  ),
  '51': 'half', // половина листа
};

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
        kind: KIND_BY_ID[id] ?? 'sheet',
        body,
        sourceFile,
      });
    });
}
