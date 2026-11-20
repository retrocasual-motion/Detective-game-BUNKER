import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { unwrapLines } from './text.ts';

describe('unwrapLines', () => {
  it('склеивает продолжение абзаца после длинной строки (строка с маленькой буквы)', () => {
    const a = 'Следователь Б. Коннор, рассмотрев материалы проверки по факту гибели,';
    expect(unwrapLines(`${a}\nруководителя программы,`)).toBe(`${a} руководителя программы,`);
  });

  it('оставляет строки шапки и абзацы как в файле', () => {
    const head = 'Окружное бюро\nДело № 09-1128\n06.11.2009\n\nТекст.';
    expect(unwrapLines(head)).toBe(head);
  });

  it('продолжение пункта списка приклеивает к пункту', () => {
    const a = '- **Жилой блок** — шесть двухместных комнат, санузлы, выход в общую зону,';
    expect(unwrapLines(`${a}\n  через коридор.`)).toBe(`${a} через коридор.`);
  });

  it('короткую строку не продолжает: подписи, поля бланка, записи', () => {
    const t =
      'С уважением,\nдежурная служба бюро\n\n**Решение руководителя:**\nрукой руководителя: «…»';
    expect(unwrapLines(t)).toBe(t);
  });

  it('пункты рукописи «п.1.», «д.12.» — с новой строки', () => {
    const t =
      '**Стр. 1.** Заметка — по пунктам, перед отправкой, всё по порядку и кратко\nп.1. Первое.\nп.2. Второе.';
    expect(unwrapLines(t)).toBe(t);
  });

  it('не трогает таблицы, заголовки и код', () => {
    const t = '| а | б |\n| в | г |\n# Заголовок\nтекст\n```\nx\nстрока\n```';
    expect(unwrapLines(t)).toBe(t);
  });

  it('не склеивает после пустой строки', () => {
    expect(unwrapLines('Абзац.\n\nпродолжение')).toBe('Абзац.\n\nпродолжение');
  });
});

describe('unwrapLines на настоящем пакете игрока', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '../../../../../playtest/packs/v3.4-2026-11-18/player');
  const read = (name: string) => readFileSync(join(dir, name), 'utf8').replace(/\r\n?/g, '\n');
  const file = (prefix: string) => {
    const name = readdirSync(dir).find((f) => f.startsWith(prefix));
    if (!name) throw new Error(`нет файла ${prefix}`);
    return read(name);
  };
  const lines = (prefix: string) => unwrapLines(file(prefix)).split('\n');

  it('01: подпись письма остаётся отдельной строкой', () => {
    expect(lines('01__')).toContain('С уважением,');
  });

  it('11: пометка руководителя — отдельной строкой после поля бланка', () => {
    const l = lines('11__');
    const i = l.indexOf('**Решение руководителя:**');
    expect(i).toBeGreaterThan(-1);
    expect(l[i + 1]?.startsWith('рукой')).toBe(true);
  });

  it('41: пункты блокнота п.1–п.3 и запись «д.12» не склеиваются', () => {
    const l = lines('41__');
    for (const p of ['п.1.', 'п.2.', 'п.3.'])
      expect(
        l.some((x) => x.startsWith(p)),
        p,
      ).toBe(true);
    expect(l.some((x) => x.trim() === '**Стр. 13.** д.12. Страшно.')).toBe(true);
  });

  it('03: абзац постановления склеен в одну строку', () => {
    const l = lines('03__');
    expect(l.some((x) => x.includes('по факту гибели Адама Коула, руководителя'))).toBe(true);
  });

  it('ни один файл не теряет текст: те же слова в том же порядке', () => {
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    for (const name of readdirSync(dir).filter((f) => /^\d{2}__.+\.md$/.test(f))) {
      const raw = read(name);
      expect(words(unwrapLines(raw)), name).toEqual(words(raw));
    }
  });
});
