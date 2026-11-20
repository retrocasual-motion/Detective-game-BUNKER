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
 * Страница с одной кнопкой-формой (POST). Ссылка входа из письма открывает её, а вход — только
 * по нажатию: почтовые сканеры (Safe Links, антивирусы) открывают
 * ссылки раньше человека и тратили одноразовый вход (R1-01).
 */
export function formPage(
  title: string,
  text: string,
  form: { action: string; field: string; value: string; button: string },
) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title></head><body style="font-family:Georgia,serif;max-width:560px;margin:48px auto;padding:0 16px;color:#222"><h1 style="font-size:22px">${esc(title)}</h1><p>${esc(text)}</p><form method="post" action="${esc(form.action)}"><input type="hidden" name="${esc(form.field)}" value="${esc(form.value)}"><button type="submit" style="font:inherit;font-size:18px;padding:8px 20px;cursor:pointer">${esc(form.button)}</button></form></body></html>`;
}

/** Простая страница со ссылкой (вход не удался и т. п.), без игры. */
export function notePage(title: string, text: string, link?: { label: string; href: string }) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="font-family:Georgia,serif;max-width:560px;margin:48px auto;padding:0 16px;color:#222"><h1 style="font-size:22px">${esc(title)}</h1><p>${esc(text)}</p>${link ? `<p><a href="${esc(link.href)}">${esc(link.label)}</a></p>` : ''}</body></html>`;
}
