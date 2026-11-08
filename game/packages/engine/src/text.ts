/** Нормализация текста — как в прототипе (`playtest.py`: norm, qnorm, find_quote). */

const STRIP = new Set([' ', '\t', '"', "'", '«', '»', '“', '”', '.', ',', ';', ':', '!', '?']);

function stripChars(s: string, chars: Set<string>): string {
  let a = 0;
  let b = s.length;
  while (a < b && chars.has(s[a] as string)) a++;
  while (b > a && chars.has(s[b - 1] as string)) b--;
  return s.slice(a, b);
}

/** Цель и значение действия: нижний регистр, ё → е, пробелы схлопнуты, кавычки и точки по краям убраны. */
export function norm(s: string): string {
  const t = s.toLowerCase().replaceAll('ё', 'е').replace(/\s+/gu, ' ').trim();
  return stripChars(t, STRIP);
}

/** Цитата карточки для сравнения: только слова (буквы, цифры, «_», «№»), через один пробел. */
export function qnorm(s: string): string {
  return s
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}_№]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Цитата есть в тексте файла: точное вхождение после нормализации или строка, где есть не меньше
 * 80 % слов цитаты. Возвращает найденную строку (нормализованную) или null.
 */
export function findQuote(text: string, quote: string): string | null {
  const qn = qnorm(quote);
  if (qn.length < 2) return null;
  const tn = qnorm(text);
  const lines = text
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim())
    .map(qnorm);
  if (tn.includes(qn)) return lines.find((l) => l.includes(qn)) ?? qn;
  const words = qn.split(' ');
  let best: string | null = null;
  let score = 0;
  for (const l of lines) {
    const toks = new Set(l.split(' '));
    const sc = words.filter((w) => toks.has(w)).length / words.length;
    if (sc > score) {
      best = l;
      score = sc;
    }
  }
  return score >= 0.8 ? best : null;
}

/** Python `str.strip(chars)` — публично для разбора карточек. */
export const strip = (s: string, chars: string) => stripChars(s, new Set(chars.split('')));
