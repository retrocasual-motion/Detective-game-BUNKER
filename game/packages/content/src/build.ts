import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Material, type MaterialKind, MaterialSchema } from '@bunker/shared';

/** Пакет игрока относительно этой папки (src/). */
export const DEFAULT_PACK_DIR = '../../../../playtest/packs/v3.3-2026-10-29';
export const DEFAULT_PLAYER_DIR = `${DEFAULT_PACK_DIR}/player`;

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
const LOCKED_FILE = /^(L\d{3})__.+\.md$/;

/**
 * Форма закрытых материалов на столе (UX-A1). Серый прототип: где ляжет вещь окончательно
 * (компьютер, устройство, просмотрщик) — этапы 3–4; пока всё открытое приходит в лоток.
 */
const LOCKED_KIND: Readonly<Record<string, MaterialKind>> = {
  ...Object.fromEntries(
    [
      'L214',
      'L215',
      'L387',
      'L388',
      'L389',
      'L390',
      'L453',
      'L540',
      'L560',
      'L561',
      'L562',
      'L563',
      'L564',
      'L565',
      'L736',
      'L737',
      'L738',
    ].map((id) => [id, 'stapled' as const]),
  ),
  L462: 'disc',
};
const lockedKind = (id: string): MaterialKind => {
  const n = Number(id.slice(1));
  if (LOCKED_KIND[id]) return LOCKED_KIND[id];
  if (n >= 900 && n < 960) return 'photos'; // увеличения
  if (n >= 980 && n < 990) return 'pack'; // листание пачек
  return 'sheet';
};

const readText = (path: string) => readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
const titleOf = (body: string, fallback: string) => /^# (.+)$/m.exec(body)?.[1]?.trim() ?? fallback;

/** Закрытые материалы (`locked/`) — только для сервера: в браузер уходят после открытия (P-10). */
export function buildLockedMaterials(lockedDir: string): Material[] {
  return readdirSync(lockedDir)
    .filter((f) => LOCKED_FILE.test(f))
    .sort()
    .map((sourceFile) => {
      const id = LOCKED_FILE.exec(sourceFile)?.[1] ?? '';
      const body = readText(join(lockedDir, sourceFile));
      return MaterialSchema.parse({
        id,
        title: titleOf(body, sourceFile),
        placement: 'desk',
        kind: lockedKind(id),
        body,
        sourceFile,
      });
    });
}

/** Серверный контент: правила `gm/access.json` и закрытые материалы. В браузер не отдаётся. */
export interface ServerContent {
  rules: unknown;
  locked: Material[];
}

export function buildServerContent(packDir: string): ServerContent {
  return {
    rules: JSON.parse(readText(join(packDir, 'gm', 'access.json'))),
    locked: buildLockedMaterials(join(packDir, 'locked')),
  };
}

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
