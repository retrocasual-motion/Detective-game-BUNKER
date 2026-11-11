/**
 * Компьютер следователя (этап 4c-3) — что на нём лежит, из канона, без новых фактов. Всё это
 * приходит по ходатайствам (DI-A — вложения ответов бюро сами ложатся в «Поступления»):
 * журналы сервера объекта (L214, L215, L387, L388–L390), экспорт ящика Эммы (L452 → L453),
 * архив проекта (L735 → L736–L738). Выпуски газеты (L831–L834) — со страницы архива номеров (17).
 */

type Mat = { id: string; title: string; body: string };

/** Вкладка программы «Экспорт сервера VL-31» (TM-A). */
export interface ServerTab {
  /** Клавиша вкладки: «F1»… */
  key: string;
  title: string;
  material: string;
  body: string;
}

/** Вкладки — по мере ответов бюро: что пришло, то и видно. */
export function serverTabs(materials: readonly Mat[]): ServerTab[] {
  const get = (id: string) => materials.find((m) => m.id === id);
  const tabs: Omit<ServerTab, 'key'>[] = [];
  const l214 = get('L214');
  if (l214) {
    const parts = l214.body.split(/\n(?=## )/);
    const intro = parts[0]?.replace(/^#\s[^\n]*\n+/, '').trim() ?? '';
    tabs.push({ title: 'Приложение № 7 — сведения', material: 'L214', body: intro });
    for (const p of parts.slice(1)) {
      const head = /^## (?:\d+\.\s*)?([^\n]+)/.exec(p)?.[1]?.trim() ?? '';
      tabs.push({ title: head, material: 'L214', body: p.replace(/^##[^\n]*\n+/, '').trim() });
    }
  }
  for (const id of ['L215', 'L387', 'L388', 'L389', 'L390']) {
    const m = get(id);
    if (m)
      tabs.push({ title: m.title, material: id, body: m.body.replace(/^#\s[^\n]*\n+/, '').trim() });
  }
  return tabs.map((t, i) => ({ ...t, key: `F${i + 1}` }));
}

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

/** Что лежит в «Поступлениях»: вложения ответов бюро (только пришедшие). */
export interface Incoming {
  id: string;
  name: string;
  kind: 'letter' | 'mbx' | 'enc' | 'server';
  material: string;
}

export function incoming(materials: readonly Mat[]): Incoming[] {
  const has = (id: string) => materials.some((m) => m.id === id);
  const out: Incoming[] = [];
  const file = (body: string | undefined, re: RegExp, fallback: string) =>
    (body && re.exec(body)?.[1]) || fallback;
  const l452 = materials.find((m) => m.id === 'L452');
  if (l452) {
    out.push({ id: 'L452', name: 'Ответ Mailbridge.txt', kind: 'letter', material: 'L452' });
    out.push({
      id: 'mbx',
      name: file(l452.body, /Вложение: `([^`]+\.mbx)`/, 'mailbox_export.mbx'),
      kind: 'mbx',
      material: 'L452',
    });
  }
  const l735 = materials.find((m) => m.id === 'L735');
  if (l735) {
    out.push({ id: 'L735', name: 'Ответ VAULTLINE.txt', kind: 'letter', material: 'L735' });
    out.push({
      id: 'enc',
      name: file(l735.body, /Вложение: `([^`]+\.enc)`/, 'project_archive.enc'),
      kind: 'enc',
      material: 'L735',
    });
  }
  for (const id of ['L214', 'L215', 'L387', 'L388', 'L389', 'L390'])
    if (has(id)) {
      const t = materials.find((m) => m.id === id)?.title ?? id;
      out.push({ id, name: t, kind: 'server', material: id });
    }
  return out;
}

/** Выпуск газеты по дате (повторное открытие): «14.10.2009» → L833. */
export const issueOf = (materials: readonly Mat[], date: string) =>
  materials.find((m) => /^L83\d$/.test(m.id) && m.title.includes(date)) ?? null;

/** Дата из поля «Дата выпуска»: ДД.ММ.ГГГГ (точки, дефисы, косые черты). */
export function normalizeDate(s: string): string | null {
  const m = /^\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})\s*$/.exec(s);
  if (!m) return null;
  return `${(m[1] ?? '').padStart(2, '0')}.${(m[2] ?? '').padStart(2, '0')}.${m[3]}`;
}
