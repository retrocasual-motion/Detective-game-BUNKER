/**
 * Компьютер следователя (этап 4c-3): что на нём лежит, из канона, без новых фактов. Выпуски
 * газеты (L831–L834) — со страницы архива номеров (17); письма ящика (L453) — разбор для
 * веб-почты. Программа сервера — server.ts (A-272).
 */

type Mat = { id: string; title: string; body: string };

/** Письмо из экспорта ящика (L453). */
export interface Letter {
  n: number;
  date: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}

export function mailbox(body: string): Letter[] {
  const out: Letter[] = [];
  for (const block of body.split(/\n---\n/)) {
    // Отправитель бывает с пробелами и кавычками («Книжный дом «Пейдж»»); тема — до последней «».
    const m = /\*\*(\d+)\.\s*([^·]+?)\s*·\s*(.+?)\s*→\s*(.+?)\s*·\s*«(.*)»\*\*\s*\n([\s\S]*)/.exec(
      block,
    );
    if (!m) continue;
    out.push({
      n: Number(m[1]),
      date: (m[2] ?? '').trim(),
      from: m[3] ?? '',
      to: m[4] ?? '',
      subject: m[5] ?? '',
      body: (m[6] ?? '').trim(),
    });
  }
  return out;
}

/** Строка бумажного прототипа «Ввод: ПАРОЛЬ | …» — на экране её нет, есть поле ввода. */
export const forScreen = (body: string) => body.replace(/^Ввод: [^\n]*\n?/gm, '').trimEnd();

/** Выпуск газеты по дате (повторное открытие): «14.10.2009» → L833. */
export const issueOf = (materials: readonly Mat[], date: string) =>
  materials.find((m) => /^L83\d$/.test(m.id) && m.title.includes(date)) ?? null;

/** Дата из поля «Дата выпуска»: ДД.ММ.ГГГГ (точки, дефисы, косые черты). */
export function normalizeDate(s: string): string | null {
  const m = /^\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})\s*$/.exec(s);
  if (!m) return null;
  return `${(m[1] ?? '').padStart(2, '0')}.${(m[2] ?? '').padStart(2, '0')}.${m[3]}`;
}
