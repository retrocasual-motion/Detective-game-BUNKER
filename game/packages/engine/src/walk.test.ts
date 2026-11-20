import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { act } from './engine.ts';
import { readPack } from './pack.ts';
import { pyRegex } from './pyre.ts';
import { emptyProgress } from './types.ts';
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
    const pats = r.flatMap((x) => [x.target, ...(x.accept ?? [])]);
    expect(pats.length).toBeGreaterThan(200);
    for (const p of pats) expect(() => pyRegex(p), p).not.toThrow();
  });

  it('каждое правило выдаёт только существующие закрытые материалы', () => {
    for (const r of content.rules.rules)
      for (const id of r.release) expect(content.locked.has(id), `${r.id}: ${id}`).toBe(true);
  });
});

describe('сквозные проходы пакета — как эталон playtest.py walk', () => {
  it('walkthrough.txt: 175 действий без несовпадений, открыто 78 из 78', () => {
    const r = walk(content, script('walkthrough.txt'));
    expect(report(r)).toBe('');
    expect(r.actions).toBe(175);
    expect(r.released.length).toBe(content.locked.size);
    expect(content.locked.size).toBe(78);
  });

  for (const name of ['walkthrough_a263.txt']) {
    it(`${name}: без несовпадений`, () => {
      const r = walk(content, script(name));
      expect(report(r)).toBe('');
      expect(r.actions).toBeGreaterThan(0);
    });
  }
});

describe('лимиты в игре на пакете v3.4 (AC-5, LM-A, DS-B)', () => {
  // Как GAME_CONFIG сервера (api/src/app.ts).
  const cfg = { pauseMs: 2 * 60 * 1000, unlimited: ['документ\\w* программ|поиск документ'] };
  const login = (p = emptyProgress()) =>
    act(
      content,
      p,
      {
        action: 'ПАРОЛЬ',
        target: 'vaultline-program.com — вход для сотрудников',
        value: 'k.walsh / Йен',
      },
      0,
      cfg,
    ).progress;

  it('поиск «Документов программы» не считает промахи; «Учёт анкет» — три и пауза', () => {
    let p = login();
    for (let i = 1; i <= 5; i++) {
      const r = act(
        content,
        p,
        {
          action: 'ПАРОЛЬ',
          target: 'кабинет VAULTLINE: документы программы',
          value: `нет такого ${i}`,
        },
        i * 1000,
        cfg,
      );
      expect(r.outcome.result).not.toBe('лимит');
      p = r.progress;
    }
    for (let i = 0; i < 3; i++) {
      p = act(
        content,
        p,
        { action: 'ПАРОЛЬ', target: 'кабинет VAULTLINE: учёт анкет', value: 'Z-99' },
        10_000 + i,
        cfg,
      ).progress;
    }
    const r = act(
      content,
      p,
      { action: 'ПАРОЛЬ', target: 'кабинет VAULTLINE: учёт анкет', value: 'A-24 / 06.10.2008' },
      20_000,
      cfg,
    );
    expect(r.outcome.result).toBe('лимит');
  });

  it('дата газеты — десять неверных, потом пауза 2 минуты', () => {
    let p = emptyProgress();
    for (let i = 0; i < 10; i++) {
      const v = `${String(i + 1).padStart(2, '0')}.01.2000`;
      p = act(
        content,
        p,
        { action: 'ПАРОЛЬ', target: 'архив номеров газеты', value: v },
        i,
        cfg,
      ).progress;
    }
    const at = (t: number) =>
      act(
        content,
        p,
        { action: 'ПАРОЛЬ', target: 'архив номеров газеты', value: '14.12.1987' },
        t,
        cfg,
      ).outcome.result;
    expect(at(1000)).toBe('лимит');
    expect(at(2 * 60 * 1000 + 100)).toBe('успех');
  });
});
