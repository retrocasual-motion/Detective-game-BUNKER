import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  attachments,
  forScreen,
  hasValue,
  incoming,
  issueOf,
  locate,
  mailbox,
  normalizeDate,
  serverDocs,
} from './content.ts';

const dir = '../../../playtest/packs/v3.3-2026-10-29/locked';
const mat = (id: string) => {
  const f = readdirSync(dir).find((x) => x.startsWith(`${id}__`)) ?? '';
  const body = readFileSync(`${dir}/${f}`, 'utf8').replace(/\r\n?/g, '\n');
  return { id, title: /^# (.+)$/m.exec(body)?.[1] ?? id, body };
};

describe('компьютер следователя — из канона', () => {
  it('терминал: не больше четырёх документов; журнал — разделы ярлыками, открывается на ленте', () => {
    expect(serverDocs([])).toEqual([]);
    const all = ['L214', 'L215', 'L387', 'L388', 'L389', 'L390'].map(mat);
    const docs = serverDocs(all);
    expect(docs.map((d) => d.title)).toEqual([
      'Журнал сервера 13.10',
      'Отметки технической',
      'Пользователь 05',
      'Копии экспортов',
    ]);
    const log = docs[0];
    expect(log?.parts.map((p) => p.label)).toEqual([
      'Состояние на 13.10.2009 00:00:00',
      'Журнал событий и внутреннего канала',
      'Узел связи за заезд',
      'Пометка бюро к приложению',
    ]);
    expect(log?.start).toBe(1);
    expect(log?.note).toMatch(/^Дело № 09-1128/);
    expect(docs[3]?.parts.map((p) => p.label)).toEqual([
      'exp_000231 · этап A',
      'exp_000247 · этап B',
      'exp_000262 · этап C',
    ]);
    expect(locate(docs, 'L389')).toEqual({ doc: 3, part: 1 });
    expect(locate(docs, 'L214')).toEqual({ doc: 0, part: 1 });
    // Пришло только приложение 7 — один документ.
    expect(serverDocs([mat('L214')]).map((d) => d.key)).toEqual(['F1']);
  });
  it('выделение щелчком: значение — отдельным словом (05 ≠ 08:05:44)', () => {
    expect(hasValue('05', '05')).toBe(true);
    expect(hasValue('изменение параметров учётной записи 05, код операции 47', '05')).toBe(true);
    expect(hasValue('08:05:44', '05')).toBe(false);
    expect(hasValue('svod_1005', '05')).toBe(false);
    expect(hasValue('кухня / склад', 'кухня / склад')).toBe(true);
    expect(hasValue('медкабинет, радиопост, кухня / склад', 'радиопост')).toBe(true);
  });
  it('экспорт ящика — 10 писем (без «Ключ», A-264)', () => {
    const letters = mailbox(mat('L453').body);
    expect(letters).toHaveLength(10);
    expect(letters.some((l) => l.subject === 'Ключ')).toBe(false);
    expect(letters[1]).toMatchObject({
      n: 2,
      date: '28.08.2009',
      from: 'j.mercer@sentinel-labs.net',
      subject: 'Условия',
    });
  });
  it('«Поступления» — только письма; вложения — отдельными файлами, замок до пароля', () => {
    const got = [mat('L452'), mat('L735'), mat('L214')];
    expect(incoming(got).map((x) => [x.name, x.attachment])).toEqual([
      ['Ответ Mailbridge.txt', 'mailbox_export_e.pierce.uk.mbx'],
      ['Ответ VAULTLINE.txt', 'VL-31_project_archive.enc'],
    ]);
    expect(attachments(got)).toEqual([
      { id: 'mbx', file: 'mailbox_export_e.pierce.uk.mbx', unlocked: false },
      { id: 'enc', file: 'VL-31_project_archive.enc', unlocked: false },
    ]);
    expect(attachments([...got, mat('L453')])[0]?.unlocked).toBe(true);
    expect(forScreen(mat('L452').body)).not.toContain('Ввод:');
  });
  it('дата выпуска: разделители любые; повтор — выпуск по дате', () => {
    expect(normalizeDate('14-10-2009')).toBe('14.10.2009');
    expect(normalizeDate('6/10/2009')).toBe('06.10.2009');
    expect(normalizeDate('вчера')).toBeNull();
    expect(issueOf([mat('L833')], '14.10.2009')?.id).toBe('L833');
  });
});
