/**
 * Компьютер следователя (этап 4c-3) — что на нём лежит, из канона, без новых фактов. Всё это
 * приходит по ходатайствам: журналы сервера объекта (L214, L215, L387, L388–L390) — в программе
 * «Экспорт сервера VL-31»; ответы с вложениями (L452, L735) — в «Поступлениях», а зашифрованные
 * вложения — своими файлами на рабочем столе (правка автора 11.11); выпуски газеты (L831–L834) —
 * со страницы архива номеров (17).
 */

type Mat = { id: string; title: string; body: string };

/** Часть документа терминала: раздел L214 или одна копия экспорта. */
export interface ServerPart {
  label: string;
  material: string;
  body: string;
}

/**
 * Документ программы «Экспорт сервера VL-31» (TM-A; вид — TM2-A, автор 11.11: меньше вкладок).
 * Не больше четырёх: журнал сервера (L214, разделы — ярлыками), отметки технической (L215),
 * пользователь 05 (L387), копии экспортов (L388–L390). Появляются по мере ответов бюро.
 */
export interface ServerDoc {
  /** Клавиша документа: «F1»… */
  key: string;
  title: string;
  /** Паспорт выгрузки (кто, когда выдал) — строкой над текстом. */
  note: string;
  parts: ServerPart[];
  /** С какой части открывается. */
  start: number;
}

const stripTitle = (body: string) => body.replace(/^#\s[^\n]*\n+/, '').trim();
/** Первый абзац после заголовка — паспорт выгрузки. */
const firstPara = (body: string) => stripTitle(body).split(/\n\s*\n/)[0] ?? '';
/** Ярлык раздела: без номера, хвоста «, 13.10.2009» и скобок. */
const shortLabel = (head: string) =>
  head
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/,\s*\d{2}\.\d{2}\.\d{4}$/, '')
    .trim();

export function serverDocs(materials: readonly Mat[]): ServerDoc[] {
  const get = (id: string) => materials.find((m) => m.id === id);
  const docs: Omit<ServerDoc, 'key'>[] = [];
  const l214 = get('L214');
  if (l214) {
    const parts = l214.body
      .split(/\n(?=## )/)
      .slice(1)
      .map((p) => ({
        label: shortLabel(/^## ([^\n]+)/.exec(p)?.[1] ?? ''),
        material: 'L214',
        body: p.replace(/^##[^\n]*\n+/, '').trim(),
      }));
    const log = parts.findIndex((p) => /^Журнал/.test(p.label));
    docs.push({
      title: 'Журнал сервера 13.10',
      note: firstPara(l214.body).replace(/\n/g, ' '),
      parts,
      start: Math.max(0, log),
    });
  }
  const one = (id: string, title: string) => {
    const m = get(id);
    if (!m) return;
    const note = firstPara(m.body);
    const body = stripTitle(m.body).slice(note.length).trim();
    docs.push({
      title,
      note: note.replace(/\n/g, ' '),
      parts: [{ label: '', material: id, body }],
      start: 0,
    });
  };
  one('L215', 'Отметки технической');
  one('L387', 'Пользователь 05');
  const copies = ['L388', 'L389', 'L390'].flatMap((id) => {
    const m = get(id);
    if (!m) return [];
    const exp = /exp_\d+/.exec(m.title)?.[0] ?? id;
    const stage = /^## (Этап \S+)/m.exec(m.body)?.[1] ?? '';
    return [
      {
        label: stage ? `${exp} · ${stage.replace(/^Этап/, 'этап')}` : exp,
        material: id,
        body: stripTitle(m.body),
      },
    ];
  });
  if (copies.length) docs.push({ title: 'Копии экспортов', note: '', parts: copies, start: 0 });
  return docs.map((d, i) => ({ ...d, key: `F${i + 1}` }));
}

/** Где в терминале материал: документ и часть (L214 — журнал событий). */
export function locate(docs: readonly ServerDoc[], material?: string) {
  for (const [d, doc] of docs.entries()) {
    const p = doc.parts.findIndex((x) => x.material === material);
    if (p >= 0) return { doc: d, part: material === 'L214' ? doc.start : p };
  }
  return { doc: 0, part: docs[0]?.start ?? 0 };
}

/**
 * Выделение щелчком (TM2-B, автор 11.11): строки, где есть это значение — код, терминал,
 * маршрут, — как отдельное слово (05 не находит 08:05:44). Не поиск: значение берётся из
 * ячейки, по которой щёлкнули.
 */
export function hasValue(cell: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\d.:/-])${esc}(?![\\p{L}\\d.:])`, 'iu').test(cell);
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

/** Зашифрованное вложение — свой файл на рабочем столе (правка автора 11.11). */
export interface Attachment {
  id: 'mbx' | 'enc';
  /** Имя файла из письма-ответа. */
  file: string;
  /** Пароль уже введён: ящик / архив открыты. */
  unlocked: boolean;
}

const attachName = (body: string | undefined, ext: string, fallback: string) => {
  const m = body ? /Вложение: `([^`]+)`/.exec(body)?.[1] : undefined;
  return m?.endsWith(`.${ext}`) ? m : fallback;
};

export function attachments(materials: readonly Mat[]): Attachment[] {
  const get = (id: string) => materials.find((m) => m.id === id);
  const has = (id: string) => materials.some((m) => m.id === id);
  const out: Attachment[] = [];
  const l452 = get('L452');
  if (l452)
    out.push({
      id: 'mbx',
      file: attachName(l452.body, 'mbx', 'mailbox_export.mbx'),
      unlocked: has('L453'),
    });
  const l735 = get('L735');
  if (l735)
    out.push({
      id: 'enc',
      file: attachName(l735.body, 'enc', 'project_archive.enc'),
      unlocked: has('L736'),
    });
  return out;
}

/** Письмо-ответ в «Поступлениях» — только письма; вложение сохранено на рабочий стол. */
export interface Incoming {
  id: string;
  name: string;
  material: string;
  attachment: string;
}

export function incoming(materials: readonly Mat[]): Incoming[] {
  const att = attachments(materials);
  const file = (id: 'mbx' | 'enc') => att.find((a) => a.id === id)?.file ?? '';
  const out: Incoming[] = [];
  if (materials.some((m) => m.id === 'L452'))
    out.push({
      id: 'L452',
      name: 'Ответ Mailbridge.txt',
      material: 'L452',
      attachment: file('mbx'),
    });
  if (materials.some((m) => m.id === 'L735'))
    out.push({
      id: 'L735',
      name: 'Ответ VAULTLINE.txt',
      material: 'L735',
      attachment: file('enc'),
    });
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
