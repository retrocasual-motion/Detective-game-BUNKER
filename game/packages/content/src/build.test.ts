import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildServerContent,
  buildStartingMaterials,
  DEFAULT_PACK_DIR,
  DEFAULT_PLAYER_DIR,
} from './build.ts';

const here = dirname(fileURLToPath(import.meta.url));
const playerDir = join(here, DEFAULT_PLAYER_DIR);

describe('buildStartingMaterials', () => {
  const materials = buildStartingMaterials(playerDir);

  it('собирает ровно 51 стартовый материал с номерами 01…51', () => {
    expect(materials).toHaveLength(51);
    expect(materials.map((m) => m.id)).toEqual(
      Array.from({ length: 51 }, (_, i) => String(i + 1).padStart(2, '0')),
    );
  });

  it('не включает вводную 00', () => {
    expect(materials.some((m) => m.sourceFile.startsWith('00'))).toBe(false);
  });

  it('берёт название из первого заголовка', () => {
    expect(materials[0]?.title).toBe('Входящее письмо');
  });

  it('кладёт устройства 24, 47, 48, 49, 50 в вид «Слева»', () => {
    const evidence = materials.filter((m) => m.placement === 'evidence').map((m) => m.id);
    expect(evidence).toEqual(['24', '47', '48', '49', '50']);
  });

  it('читает только player/ и не оставляет \r в тексте', () => {
    for (const m of materials) {
      expect(m.sourceFile).toMatch(/^\d{2}__.+\.md$/);
      expect(readFileSync(join(playerDir, m.sourceFile), 'utf8').length).toBeGreaterThan(0);
      expect(m.body.includes('\r')).toBe(false);
    }
  });

  it('у каждого материала форма по типу (UX-A1): письма — листы, протоколы — скреплены, вещи — в пакетах', () => {
    const kind = (id: string) => materials.find((m) => m.id === id)?.kind;
    expect(kind('01')).toBe('sheet');
    expect(kind('30')).toBe('stapled');
    expect(kind('13')).toBe('disc');
    expect(kind('29')).toBe('pack');
    expect(kind('40')).toBe('bag');
    expect(kind('51')).toBe('half');
    expect(new Set(materials.map((m) => m.kind)).size).toBe(8);
  });

  it('серверный контент: 73 закрытых материала L… и правила (P-10 — только для сервера)', () => {
    const server = buildServerContent(join(here, DEFAULT_PACK_DIR));
    expect(server.locked).toHaveLength(73);
    expect(server.locked.every((m) => /^L\d{3}$/.test(m.id))).toBe(true);
    expect(server.locked.find((m) => m.id === 'L462')?.kind).toBe('disc');
    expect((server.rules as { rules: unknown[] }).rules.length).toBe(159);
  });

  it('повторная сборка даёт тот же результат', () => {
    expect(JSON.stringify(buildStartingMaterials(playerDir))).toBe(JSON.stringify(materials));
  });
});
