/**
 * Регулярные выражения пакета (`access.json`) написаны для Python `re`. В JavaScript `\b`, `\w`,
 * `\W` понимают только латиницу, а правила ловят русские слова, поэтому шаблон переводится:
 * `\w` → буква, цифра или «_» по Unicode (как в Python), `\b` — граница такого слова.
 * Флаги всегда как в прототипе: без учёта регистра (IGNORECASE) и Unicode.
 */
const W = '\\p{L}\\p{N}_';
const WORD = `[${W}]`;
const NOT_WORD = `[^${W}]`;
const BOUNDARY = `(?:(?<=${WORD})(?!${WORD})|(?<!${WORD})(?=${WORD}))`;

/** Символы, которые в JS-режиме Unicode можно экранировать обратной косой. */
const SYNTAX = new Set('^$\\.*+?()[]{}|/'.split(''));

export function translatePattern(src: string): string {
  let out = '';
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (c === '\\') {
      const n = src[i + 1];
      i++;
      if (n === undefined) throw new Error(`шаблон кончается обратной косой: ${src}`);
      if (n === 'w') out += inClass ? W : WORD;
      else if (n === 'W') {
        if (inClass) throw new Error(`\\W внутри [] не поддержан: ${src}`);
        out += NOT_WORD;
      } else if (n === 'b') out += inClass ? '\\x08' : BOUNDARY;
      else if (n === 'B' || n === 'A' || n === 'Z') throw new Error(`\\${n} не поддержан: ${src}`);
      else if (/[A-Za-z0-9]/.test(n)) out += `\\${n}`;
      else if (n === '-') out += inClass ? '\\-' : '-';
      else if (SYNTAX.has(n)) out += `\\${n}`;
      else out += n; // экранирование обычного символа («\№», «\ ») — сам символ
      continue;
    }
    if (c === '[' && !inClass) {
      inClass = true;
      out += c;
      if (src[i + 1] === '^') {
        out += '^';
        i++;
      }
      if (src[i + 1] === ']') {
        out += '\\]';
        i++;
      }
      continue;
    }
    if (c === '[' && inClass) {
      out += '\\[';
      continue;
    }
    if (c === ']' && inClass) inClass = false;
    out += c;
  }
  return out;
}

const cache = new Map<string, RegExp>();

/** Шаблон пакета → RegExp JavaScript (кешируется). */
export function pyRegex(src: string): RegExp {
  let re = cache.get(src);
  if (!re) {
    re = new RegExp(translatePattern(src), 'iu');
    cache.set(src, re);
  }
  return re;
}

/** Python `re.search(pattern, text, IGNORECASE)`. */
export const search = (pattern: string, text: string): RegExpExecArray | null =>
  pyRegex(pattern).exec(text);
