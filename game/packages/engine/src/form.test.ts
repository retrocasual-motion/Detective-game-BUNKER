import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORM_RULE_IDS, petitionFormError } from './form.ts';
import { readPack } from './pack.ts';
import { emptyProgress } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const content = readPack(join(here, '../../../../playtest/packs/v3.3-2026-10-29'));

describe('ошибки оформления ходатайства (FORM-B)', () => {
  it('все 7 правил есть в access.json и все — отказы ходатайств', () => {
    const byId = new Map(content.rules.rules.map((r) => [r.id, r]));
    for (const id of FORM_RULE_IDS) {
      const r = byId.get(id);
      expect(r, id).toBeDefined();
      expect(r?.action, id).toBe('ХОДАТАЙСТВО');
      expect(r?.refusal, id).toBe(true);
    }
  });

  it('карточка не из дела — ошибка оформления, прогресс не меняется', () => {
    const p = emptyProgress();
    const err = petitionFormError(content, p, 'zapros@okrug-bureau.org', [
      { file: 'L214', quote: 'что угодно' },
      { file: '06', quote: 'Состав группы и персонала программы' },
    ]);
    expect(err).toMatch(/в деле нет/);
    expect(p).toEqual(emptyProgress());
  });

  it('адреса нет в книге — ошибка оформления', () => {
    const err = petitionFormError(content, emptyProgress(), 'nobody@nowhere.org', [
      { file: '04', quote: 'Опись материалов дела' },
      { file: '06', quote: 'Состав группы и персонала программы' },
    ]);
    expect(err).toMatch(/адресной книге/);
  });

  it('оформленное ходатайство (пусть и с отказом по существу) — можно отправлять', () => {
    const err = petitionFormError(content, emptyProgress(), 'zapros@okrug-bureau.org', [
      { file: '06', quote: 'Состав группы и персонала программы' },
      { file: '04', quote: 'Опись материалов дела' },
    ]);
    expect(err).toBeNull();
  });
});
