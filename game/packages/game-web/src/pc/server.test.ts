import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportFiles, matches, options, serverData, technical } from './server.ts';

const dir = '../../../playtest/packs/v3.4-2026-11-18/locked';
const mat = (id: string) => {
  const f = readdirSync(dir).find((x) => x.startsWith(`${id}__`)) ?? '';
  const body = readFileSync(`${dir}/${f}`, 'utf8').replace(/\r\n?/g, '\n');
  return { id, title: /^# (.+)$/m.exec(body)?.[1] ?? id, body };
};

describe('программа «Сервер объекта VL-31» (A-272) — из L214, L215, L387–L390', () => {
  const d = serverData(mat('L214').body);

  it('журнал событий — таблица §2; состояние, узел связи, пометка бюро — свои разделы', () => {
    expect(d.log.length).toBeGreaterThan(20);
    expect(d.log[0]).toMatchObject({ time: '04:50:12', terminal: 'техническая', account: '02' });
    expect(d.state).toContain('Режим тревоги');
    expect(d.node).toContain('Внешние отправки');
    expect(d.note).toContain('Время — часы сервера объекта');
  });

  it('фильтры — значения из таблицы; «канал» и несколько терминалов в строке', () => {
    const terms = options(d.log, 'terminal');
    expect(terms).toContain('узел связи');
    expect(terms).toContain('кухня / склад');
    expect(options(d.log, 'account')).toEqual(
      expect.arrayContaining(['05', 'администратор', 'канал']),
    );
    const fives = d.log.filter((r) => matches(r, null, '05'));
    expect(fives.length).toBeGreaterThan(0);
    expect(fives.every((r) => r.account.includes('05'))).toBe(true);
    const both = d.log.filter((r) => matches(r, 'узел связи', 'администратор'));
    expect(both.every((r) => r.terminal.startsWith('узел связи'))).toBe(true);
  });

  it('терминал технической — без заголовка; экспорты — по именам файлов', () => {
    expect(technical(mat('L215').body)).not.toMatch(/^# /);
    expect(exportFiles([mat('L388'), mat('L389'), mat('L390')]).map((f) => f.name)).toEqual([
      'exp_000231',
      'exp_000247',
      'exp_000262',
    ]);
  });
});
