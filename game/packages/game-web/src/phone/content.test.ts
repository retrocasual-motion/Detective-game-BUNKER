import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lockContent, phoneContent } from './content.ts';

const pack = '../../../playtest/packs/v3.3-2026-10-29';
const read = (dir: string, prefix: string) => {
  const f = readdirSync(`${pack}/${dir}`).find((x) => x.startsWith(prefix));
  return readFileSync(`${pack}/${dir}/${f}`, 'utf8').replace(/\r\n?/g, '\n');
};

describe('телефон Габриэля — из канона', () => {
  const p = phoneContent(read('locked', 'L540__'));
  it('контакты и экстренный контакт', () => {
    expect(p.contacts.map((c) => c.name)).toEqual(['Ana', 'Mamá', 'Taller', 'Clínica San Rafael']);
    expect(p.contacts[0]?.number).toBe('+7 926 555-30-14');
    expect(p.ice).toContain('Ana');
  });
  it('пропущенные по дням — 41, последний 13.10, 22:10', () => {
    expect(p.missed.reduce((n, d) => n + d.count, 0)).toBe(41);
    expect(p.lastMissed).toBe('13.10, 22:10');
  });
  it('переписка в порядке канона; голосовое — с расшифровкой', () => {
    expect(p.thread[0]).toMatchObject({ when: '13.10, 21:58', from: 'Ana' });
    const voice = p.thread.find((m) => m.voice);
    expect(voice?.voice?.duration).toBe('1:10');
    expect(voice?.voice?.transcript).toContain('он не понимает');
    expect(p.thread.at(-1)?.when).toBe('30.09, 22:14');
  });
  it('голосовая почта — три сообщения', () => {
    expect(p.voicemail.map((v) => v.duration)).toEqual(['0:18', '0:12', '0:20']);
    expect(p.voicemail[2]?.text).toContain('catorce');
  });
  it('экран блокировки — уведомления из 48', () => {
    const l = lockContent(read('player', '48__'));
    expect(l.notifications[0]).toEqual({
      title: 'Ana — 41 missed calls',
      when: '13.10.2009, 22:10',
    });
    expect(l.notifications[1]?.title).toBe('Voicemail — 3 new');
  });
});
