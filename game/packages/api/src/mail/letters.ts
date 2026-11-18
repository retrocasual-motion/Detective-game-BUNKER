import type { Material } from '@bunker/shared';
import { letterHtml, type OutLetter } from './mailer.ts';

/**
 * Тексты служебных писем (6a-1). Письмо бюро о возобновлении дела — материал 01 пакета
 * (И-1); ответы на запросы — тело письма-ответа из игры. Своих фактов здесь нет.
 */

export const CASE_NO = '09-1128';

/** Ссылка для входа (T-14-A): письмо игры, не бюро. */
export function loginLetter(to: string, link: string, minutes: number): OutLetter {
  const text = [
    'Здравствуйте.',
    '',
    `Ссылка для входа в дело № ${CASE_NO}. Она действует ${minutes} минут и открывается один раз.`,
    '',
    link,
    '',
    'Если вы не запрашивали вход, просто не открывайте ссылку.',
  ].join('\n');
  return {
    to,
    fromName: 'БУНКЕР',
    subject: `Вход в дело № ${CASE_NO}`,
    text,
    html: letterHtml(text.replace(`\n\n${link}\n`, '\n'), [{ label: 'Войти в дело', href: link }]),
  };
}

/** Строки шапки «**Поле:** значение» в начале материала-письма. */
const HEAD = /^\*\*(От|Кому|Дата|Тема):\*\*\s*(.*)$/;

/**
 * Письмо бюро о возобновлении дела (01, И-1) — при первом входе игрока. Тема и текст — из
 * материала 01 дословно; шапка («От», «Дата») — у письма своя.
 */
export function bureauLetter(to: string, m01: Material, caseLink: string): OutLetter {
  const lines = m01.body.split('\n');
  const subject =
    lines.map((l) => HEAD.exec(l)).find((x) => x?.[1] === 'Тема')?.[2] ?? `Дело № ${CASE_NO}`;
  const body = lines
    .filter((l) => !/^#\s/.test(l) && !HEAD.test(l))
    .join('\n')
    .replace(/^\n+/, '')
    .trimEnd();
  const text = `${body}\n\nДело: ${caseLink}`;
  return {
    to,
    subject,
    text,
    html: letterHtml(body, [{ label: 'Открыть дело', href: caseLink }]),
  };
}

/**
 * Ответ на запрос (7.1, M-C): текст письма-ответа и кнопка «Добавить в дело» — она кладёт
 * письмо и вложения во «Входящие» на столе. Тема сразу говорит, от кого и на какой запрос.
 */
export function replyLetter(
  to: string,
  letter: { n: number; body: string },
  addLink: string,
): OutLetter {
  const from = /^\*\*От:\*\* (.+)$/m.exec(letter.body)?.[1] ?? '';
  const body = letter.body.replace(/^# .*\n+/, '').replace(/\*\*(От|Кому|Вложения):\*\*/g, '$1:');
  const text = `${body}\n\nДобавить в дело: ${addLink}`;
  return {
    to,
    subject: `Ответ на запрос № ${letter.n}${from ? ` — ${from}` : ''}`,
    text,
    html: letterHtml(body, [{ label: 'Добавить в дело', href: addLink }]),
  };
}

/** Страница после «Добавить в дело» и других ссылок из письма — простая, без игры. */
export function notePage(title: string, text: string, link?: { label: string; href: string }) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="font-family:Georgia,serif;max-width:560px;margin:48px auto;padding:0 16px;color:#222"><h1 style="font-size:22px">${esc(title)}</h1><p>${esc(text)}</p>${link ? `<p><a href="${esc(link.href)}">${esc(link.label)}</a></p>` : ''}</body></html>`;
}
