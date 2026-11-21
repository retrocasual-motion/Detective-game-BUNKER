import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formAction,
  pageOf,
  readPass,
  signPass,
  siteByHost,
  siteOf,
  siteUrl,
} from '../src/sites.ts';

const dir = '../../../playtest/packs/v3.4-2026-11-18/locked';
const mat = (id: string) => {
  const f = readdirSync(dir).find((x) => x.startsWith(`${id}__`)) ?? '';
  const body = readFileSync(`${dir}/${f}`, 'utf8').replace(/\r\n?/g, '\n');
  return { id, title: /^# (.+)$/m.exec(body)?.[1] ?? id, body };
};

describe('сайты дела (A-272, AC-3)', () => {
  it('адрес → сайт и путь; хост → сайт; адрес для браузера — с меткой сайта', () => {
    expect(siteOf('https://www.vaultline-program.com/')).toMatchObject({ path: '/' });
    expect(siteOf('docs.hexon-bio.com/vl-31')?.site.label).toBe('docs.hexon-bio');
    expect(siteOf('hexon-bio.com')?.site.label).toBe('hexon-bio');
    expect(siteOf('google.com')).toBeNull();
    expect(siteByHost('vaultline-program.localhost:5173', 'localhost')?.domain).toBe(
      'vaultline-program.com',
    );
    expect(siteByHost('localhost:5173', 'localhost')).toBeNull();
    expect(siteByHost('evil.localhost', 'localhost')).toBeNull();
    expect(siteByHost('mailbridge.game.example', 'game.example')?.domain).toBe('mailbridge.net');
    const s = siteOf('docs.hexon-bio.com/vl-31');
    if (!s) throw new Error('нет сайта');
    expect(siteUrl('http://localhost:5173', s.site, s.path)).toBe(
      'http://docs.hexon-bio.localhost:5173/vl-31',
    );
  });

  it('пропуск подписан и живёт до срока; чужая подпись — нет', () => {
    const p = signPass('k', 'игрок-1', 2000);
    expect(readPass('k', p, 1000)).toBe('игрок-1');
    expect(readPass('k', p, 3000)).toBeNull();
    expect(readPass('другой', p, 1000)).toBeNull();
    expect(readPass('k', `${p}x`, 1000)).toBeNull();
    expect(readPass('k', undefined, 1000)).toBeNull();
  });

  it('формы → строки движка как в сквозном проходе', () => {
    expect(formAction('vl-login', { login: 'k.walsh', password: 'Йен' })).toEqual({
      target: 'vaultline-program.com — вход для сотрудников',
      value: 'k.walsh / Йен',
    });
    expect(formAction('vl-registry', { program: '', code: 'A-24' })?.value).toBe('A-24');
    expect(formAction('fr-death', { box: '845', surname: 'Коул', date: '13.10.2009' })?.value).toBe(
      '845 / Коул / 13.10.2009',
    );
    expect(formAction('mb-forgot', { address: 'e.pierce.uk@mailbridge.net' })).toEqual({
      target: 'почта e.pierce.uk@mailbridge.net',
      value: 'забыли пароль',
    });
  });

  it('страницы: шапка и разделы — отдельно, описания форм — метками, подписи остаются', () => {
    const vl = pageOf(mat('L101'));
    expect(vl.nav).toContain('Вход для сотрудников');
    expect(vl.header).toContain('VAULTLINE');
    expect(vl.body).toContain('::form:vl-login::');
    expect(vl.body).not.toContain('Форма:');
    const cab = pageOf(mat('L620'));
    expect(cab.body).toContain('::form:vl-registry::');
    expect(cab.body).toContain('::form:vl-docs::');
    expect(cab.body).toContain('Текущий этап — по номеру программы');
    expect(cab.body).not.toMatch(/Поля:|Поле:/);
    expect(pageOf(mat('L130')).body).toContain('::form:fr-death::');
    expect(pageOf(mat('L249')).body).toContain('::form:mb-login::');
    const hx = pageOf(mat('L735'));
    expect(hx.body).toContain('::form:hx-archive::');
    expect(hx.header).toContain('Хранилище документов');
  });
});
