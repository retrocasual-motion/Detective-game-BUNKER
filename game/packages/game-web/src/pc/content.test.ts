import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { incoming, issueOf, mailbox, normalizeDate, serverTabs } from './content.ts';

const dir = '../../../playtest/packs/v3.3-2026-10-29/locked';
const mat = (id: string) => {
  const f = readdirSync(dir).find((x) => x.startsWith(`${id}__`)) ?? '';
  const body = readFileSync(`${dir}/${f}`, 'utf8').replace(/\r\n?/g, '\n');
  return { id, title: /^# (.+)$/m.exec(body)?.[1] ?? id, body };
};

describe('компьютер следователя — из канона', () => {
  it('вкладки экспорта сервера — только пришедшее; у L214 — четыре раздела (A-264), паспорт — в первом', () => {
    expect(serverTabs([])).toEqual([]);
    const tabs = serverTabs([mat('L214')]);
    expect(tabs).toHaveLength(4);
    expect(tabs[0]?.title).toBe('Приложение № 7 · Состояние на 13.10.2009 00:00:00');
    expect(tabs[0]?.body).toMatch(/^Дело № 09-1128/);
    expect(tabs[1]?.title).toContain('Журнал событий и внутреннего канала');
    expect(tabs[2]?.title).toContain('Узел связи за заезд');
    const more = serverTabs([mat('L214'), mat('L387'), mat('L388')]);
    expect(more.map((t) => t.key).at(-1)).toBe('F6');
    expect(more.at(-1)?.material).toBe('L388');
  });
  it('экспорт ящика — 10 писем (без «Ключ», A-264) с датой, адресами и темой', () => {
    const letters = mailbox(mat('L453').body);
    expect(letters).toHaveLength(10);
    expect(letters.some((l) => l.subject === 'Ключ')).toBe(false);
    expect(letters[1]).toMatchObject({
      n: 2,
      date: '28.08.2009',
      from: 'j.mercer@sentinel-labs.net',
      subject: 'Условия',
    });
    expect(letters[1]?.body).toContain('VL-31');
  });
  it('«Поступления»: письмо и вложение ответа; журналы — по одному', () => {
    const list = incoming([mat('L452'), mat('L735'), mat('L214')]);
    expect(list.map((x) => x.name)).toEqual([
      'Ответ Mailbridge.txt',
      'mailbox_export_e.pierce.uk.mbx',
      'Ответ VAULTLINE.txt',
      'VL-31_project_archive.enc',
      'Приложение № 7. Журналы сервера объекта VL-31 за 13.10.2009',
    ]);
  });
  it('дата выпуска: разделители любые; повтор — выпуск по дате', () => {
    expect(normalizeDate('14-10-2009')).toBe('14.10.2009');
    expect(normalizeDate('6/10/2009')).toBe('06.10.2009');
    expect(normalizeDate('вчера')).toBeNull();
    expect(issueOf([mat('L833')], '14.10.2009')?.id).toBe('L833');
  });
});
