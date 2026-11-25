import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P-10: в коде страницы (game-web/src) нет ответов дела — пароли, логин кабинета, адрес ящика и
 * хранилища, коды. Их знает только сервер; игрок находит их в материалах. Ревью 20.11 (F1)
 * нашло адрес ящика в коде сайтов — этот тест не даст вернуть такое снова.
 */
const ANSWERS = [
  'e.pierce.uk@mailbridge.net',
  'docs.hexon-bio.com',
  'k.walsh',
  'Тоффи',
  '2-4-8-6',
  '06.10.2008',
];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });

describe('в коде страницы нет ответов дела (P-10)', () => {
  it('ни один файл game-web/src не содержит ответов', () => {
    const src = import.meta.dirname;
    const found = files(src).flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return ANSWERS.filter((a) => text.includes(a)).map((a) => `${f.slice(src.length + 1)}: ${a}`);
    });
    expect(found).toEqual([]);
  });
});
