import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readSaved, reconcile } from './layout.ts';
import { type Material, type PlayerState, STATE_VERSION } from './schemas.ts';

/**
 * Замороженные сохранения (RV-78): срезы ночной проверки 26.11 — середина дела, конец, форма
 * заключения (версия 5). Любая правка схемы или перевода версий должна поднимать их без потерь: раньше
 * правка схемы молча стирала стену (RV-49). Новый образец — новым файлом, старые не менять.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'saves');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

const mat = (id: string): Material => ({
  id,
  title: `Материал ${id}`,
  placement: ['24', '47', '48', '49', '50'].includes(id) ? 'evidence' : 'desk',
  kind: 'sheet',
  body: '',
  sourceFile: `${id}__x.md`,
});
const starting = Array.from({ length: 52 }, (_, i) => String(i + 1).padStart(2, '0'))
  .filter((id) => id !== '16')
  .map(mat);

/** Материалы игрока среза: стартовые и все открытые, на которые ссылается сохранение. */
function materialsOf(s: PlayerState): Material[] {
  const ids = new Set(starting.map((m) => m.id));
  const refs = [
    ...s.wall.items.map((i) => i.id),
    ...(s.desk ?? []).map((d) => d.id),
    ...(s.joined ?? []),
  ];
  for (const id of refs) if (/^(\d{2}|L\d{3})$/.test(id)) ids.add(id);
  return [...ids].map(mat);
}

describe('замороженные сохранения (RV-78)', () => {
  it('образцы есть', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const f of files) {
    it(`${f}: поднимается до текущей версии без потерь и стабильно`, () => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as PlayerState;
      const materials = materialsOf(raw);
      const { state, dropped } = readSaved(raw, materials);
      expect(dropped).toEqual([]);
      if (!state) throw new Error('не прочиталось');
      expect(state.version).toBe(STATE_VERSION);
      const r = reconcile(state, materials);
      // Стена, записки и стол — те же.
      const ids = (s: PlayerState) => s.wall.items.map((i) => i.id).sort();
      expect(ids(r)).toEqual(ids(raw));
      expect(r.wall.notes).toEqual(raw.wall.notes);
      expect((r.desk ?? []).map((d) => d.id).sort()).toEqual(
        (raw.desk ?? []).map((d) => d.id).sort(),
      );
      expect(r.opened).toEqual(raw.opened);
      // Сохранили и прочитали снова — то же самое.
      const again = readSaved(JSON.parse(JSON.stringify(r)), materials);
      expect(again.dropped).toEqual([]);
      expect(again.state && reconcile(again.state, materials)).toEqual(r);
    });
  }
});
