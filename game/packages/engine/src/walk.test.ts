import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPack } from './pack.ts';
import { pyRegex } from './pyre.ts';
import { walk } from './walk.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PACK = join(here, '../../../../playtest/packs/v3.4-2026-11-18');
const content = readPack(PACK);
const script = (name: string) => readFileSync(join(PACK, 'gm', name), 'utf8');

/** Несовпадения — понятным текстом, чтобы отчёт теста сразу показывал строку прохода. */
const report = (r: ReturnType<typeof walk>) =>
  r.lines
    .filter((l) => !l.ok)
    .map((l) => `${l.line}: ${l.text.trim()} → ${l.rule}: ${l.result} [${l.opened.join(', ')}]`)
    .join('\n');

describe('правила пакета', () => {
  it('все шаблоны access.json переводятся в JavaScript', () => {
    const r = content.rules.rules;
    const pats = r.flatMap((x) => [
      x.target,
      ...(x.accept ?? []),
      ...(x.cards ?? []).flat().flatMap((s) => [s.file ?? '.*', s.quote ?? '.*']),
      ...(x.not_cards ?? []).flatMap((s) => [s.file ?? '.*', s.quote ?? '.*']),
    ]);
    expect(pats.length).toBeGreaterThan(250);
    for (const p of pats) expect(() => pyRegex(p), p).not.toThrow();
  });

  it('каждое правило выдаёт только существующие закрытые материалы', () => {
    for (const r of content.rules.rules)
      for (const id of r.release) expect(content.locked.has(id), `${r.id}: ${id}`).toBe(true);
  });
});

describe('сквозные проходы пакета — как эталон playtest.py walk', () => {
  it('walkthrough.txt: 163 действия без несовпадений, открыто 74 из 74', () => {
    const r = walk(content, script('walkthrough.txt'));
    expect(report(r)).toBe('');
    expect(r.actions).toBe(163);
    expect(r.released.length).toBe(content.locked.size);
    expect(content.locked.size).toBe(74);
  });

  for (const name of ['walkthrough_a263.txt']) {
    it(`${name}: без несовпадений`, () => {
      const r = walk(content, script(name));
      expect(report(r)).toBe('');
      expect(r.actions).toBeGreaterThan(0);
    });
  }
});
