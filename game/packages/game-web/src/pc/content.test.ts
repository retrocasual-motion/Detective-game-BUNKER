import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dateForEngine, issueOf, mailbox, normalizeDate } from './content.ts';

const dir = '../../../playtest/packs/v3.4-2026-11-18/locked';
const mat = (id: string) => {
  const f = readdirSync(dir).find((x) => x.startsWith(`${id}__`)) ?? '';
  const body = readFileSync(`${dir}/${f}`, 'utf8').replace(/\r\n?/g, '\n');
  return { id, title: /^# (.+)$/m.exec(body)?.[1] ?? id, body };
};

describe('компьютер следователя — из канона', () => {
  it('экспорт ящика — 10 писем (без «Ключ», A-264)', () => {
    const letters = mailbox(mat('L453').body);
    expect(letters).toHaveLength(10);
    expect(letters.some((l) => l.subject === 'Ключ')).toBe(false);
    expect(letters[1]).toMatchObject({
      n: 2,
      date: '28.08.2009',
      from: 'j.mercer@octon-labs.net',
      subject: 'Условия',
    });
  });
  it('дата выпуска: разделители любые; повтор — выпуск по дате', () => {
    expect(normalizeDate('14-10-2009')).toBe('14.10.2009');
    expect(normalizeDate('6/10/2009')).toBe('06.10.2009');
    expect(normalizeDate('вчера')).toBeNull();
    // F6: американская запись — второе число больше 12.
    expect(normalizeDate('10/14/2009')).toBe('14.10.2009');
    expect(dateForEngine('10/14/2009', '14.10.2009')).toBe('10/14/2009');
    expect(dateForEngine('14.10.2009', '14.10.2009')).toBe('14.10.2009');
    expect(issueOf([mat('L833')], '14.10.2009')?.id).toBe('L833');
  });
});
