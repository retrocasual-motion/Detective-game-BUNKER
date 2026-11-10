/**
 * Файлы ноутбука руководителя (этап 4c-1) — из канона, без новых фактов: рабочий стол и
 * корзина — L560, «Тревога» — L561, журнал печати — L562, «Доклад_Р.txt» — L563, сохранённая
 * страница — L564, «Личные дела VL-31» — L565, регламент и распорядок — файлы 08, 09.
 * Файлы остаются на ноутбуке (LW-A): у каждого — материал, из которого он (поиск, карточки).
 */

export type FileType = 'folder' | 'txt' | 'doc' | 'xls' | 'wav' | 'htm';

export interface LapFile {
  /** Путь от рабочего стола: «Отчёты/расходы_объект_2008-2009.xls». */
  path: string;
  name: string;
  type: FileType;
  /** Изменён (как в списке файлов). */
  modified?: string;
  /** Последнее открытие (папка «Личные дела»). */
  opened?: string;
  /** В корзине: откуда и когда удалён. */
  origin?: string;
  deleted?: string;
  /** Звук: длительность и когда создан (свойства — только у медиафайлов, A-251). */
  duration?: string;
  created?: string;
  /** Материал дела, из которого файл. */
  material: string;
  /** Текст файла (Markdown). */
  body: string;
  children?: LapFile[];
}

export interface Laptop {
  desktop: LapFile[];
  trash: LapFile[];
  bookmarks: { title: string; url: string }[];
  /** Журнал печати (L562) — таблица. */
  printLog: string;
}

type Mat = { id: string; body: string };

const cells = (line: string) =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
const tick = (s: string) => s.replace(/`/g, '').trim();
const typeOf = (name: string): FileType => {
  const ext = /\.([a-z]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext === 'txt' || ext === 'doc' || ext === 'xls' || ext === 'wav' || ext === 'htm'
    ? ext
    : 'doc';
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Строки первой таблицы после заголовка (без шапки). */
function tableUnder(body: string, heading: RegExp): string[][] {
  const lines = body.split('\n');
  const h = lines.findIndex((l) => heading.test(l));
  const start = lines.findIndex((l, k) => k > h && l.trimStart().startsWith('|'));
  if (h < 0 || start < 0) return [];
  const rows: string[][] = [];
  for (const l of lines.slice(start + 2)) {
    if (!l.trimStart().startsWith('|')) break;
    rows.push(cells(l));
  }
  return rows;
}

/** Раздел «## …» целиком (без заголовка), до следующего «## ». */
function section(body: string, heading: RegExp): string {
  const lines = body.split('\n');
  const h = lines.findIndex((l) => heading.test(l));
  if (h < 0) return '';
  let end = lines.findIndex((l, k) => k > h && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines
    .slice(h + 1, end)
    .join('\n')
    .trim();
}

/** Цитата «> …» — текст без знаков цитаты. */
const unquote = (s: string) =>
  s
    .split('\n')
    .filter((l) => l.startsWith('>'))
    .map((l) => l.replace(/^>\s?/, ''))
    .join('\n')
    .trim();

/** Тело без первого заголовка «# …». */
const afterTitle = (body: string) => body.replace(/^#\s[^\n]*\n+/, '').trim();

export function buildLaptop(materials: readonly Mat[]): Laptop | null {
  const get = (id: string) => materials.find((m) => m.id === id)?.body ?? null;
  const l560 = get('L560');
  if (!l560) return null;
  const l561 = get('L561') ?? '';
  const l562 = get('L562') ?? '';
  const l563 = get('L563') ?? '';
  const l564 = get('L564') ?? '';
  const l565 = get('L565') ?? '';

  const desk = tableUnder(l560, /^## Рабочий стол/);
  const date = (prefix: string) => {
    const d = desk.find((r) => tick(r[0] ?? '').startsWith(prefix))?.[2];
    return d && d !== '—' ? d : undefined;
  };

  // Отчёт о расходах — раздел L560 целиком.
  const reportName = 'расходы_объект_2008-2009.xls';
  const expenses = section(l560, /^## Отчёт о расходах/);

  // «Тревога» — три записи L561: «## `name` — 0:22».
  const alarmCreated = /Файлы созданы (\d{2}\.\d{2}\.\d{4})/.exec(l561)?.[1];
  const alarm: LapFile[] = [];
  for (const m of l561.matchAll(/^## `([^`]+)` — (\d+:\d{2})\s*$/gm)) {
    const name = m[1] ?? '';
    alarm.push({
      path: `Тревога/${name}`,
      name,
      type: 'wav',
      modified: alarmCreated,
      created: alarmCreated,
      duration: m[2],
      material: 'L561',
      body: section(l561, new RegExp(`^## \`${escapeRe(name)}\``)),
    });
  }

  // «Личные дела VL-31» — L565: список с датами открытия; полный текст — у Харта.
  const others = /Файлы Моро, Сато, Силвы — ([^\n]+)/.exec(l565)?.[1] ?? '';
  const personal: LapFile[] = tableUnder(l565, /^# /).map((r) => {
    const name = tick(r[0] ?? '');
    const full = section(l565, new RegExp(`^## \`${escapeRe(name)}\``));
    return {
      path: `Личные дела VL-31/${name}`,
      name,
      type: 'doc' as const,
      opened: r[1],
      material: 'L565',
      body: full ? unquote(full) || full : others.replace(/^./, (c) => c.toUpperCase()),
    };
  });

  const savedName = /Файл `([^`]+)`/.exec(l564)?.[1] ?? 'the-signal_03-11-2008.htm';
  const savedPage =
    l564
      .split(/\n---\n/)
      .slice(1)
      .join('\n---\n')
      .trim() || afterTitle(l564);

  const folder = (name: string, children: LapFile[], modified?: string): LapFile => ({
    path: name,
    name,
    type: 'folder',
    modified,
    material: children[0]?.material ?? 'L560',
    body: '',
    children,
  });
  const caseDoc = (id: string, name: string): LapFile[] => {
    const body = get(id);
    return body
      ? [
          {
            path: name,
            name,
            type: 'doc',
            modified: date(name),
            material: id,
            body: afterTitle(body),
          },
        ]
      : [];
  };

  const desktop: LapFile[] = [
    folder(
      'Отчёты',
      [
        {
          path: `Отчёты/${reportName}`,
          name: reportName,
          type: 'xls',
          modified: date(`Отчёты/${reportName}`),
          material: 'L560',
          body: expenses,
        },
      ],
      date(`Отчёты/${reportName}`),
    ),
    folder('Тревога', alarm, date('Тревога')),
    {
      path: 'Доклад_Р.txt',
      name: 'Доклад_Р.txt',
      type: 'txt',
      modified: date('Доклад_Р.txt'),
      material: 'L563',
      body: unquote(l563),
    },
    folder(
      'Сохранённое',
      [
        {
          path: `Сохранённое/${savedName}`,
          name: savedName,
          type: 'htm',
          modified: date('Сохранённое'),
          material: 'L564',
          body: savedPage,
        },
      ],
      date('Сохранённое'),
    ),
    folder('Личные дела VL-31', personal),
    // «Регламент_2009.doc, Распорядок.doc — как в деле (файлы 08, 09)»: одна строка на оба.
    ...caseDoc('08', 'Регламент_2009.doc').map((f) => ({
      ...f,
      modified: date('Регламент_2009.doc'),
    })),
    ...caseDoc('09', 'Распорядок.doc').map((f) => ({ ...f, modified: date('Регламент_2009.doc') })),
  ];

  // Корзина: таблица и тексты файлов (L560).
  const trashText = (name: string) => {
    const lines = l560.split('\n');
    const k = lines.findIndex((l) => l.startsWith(`- \`${name}\``));
    if (k < 0) return '';
    const first = lines[k]?.replace(/^- `[^`]+` — ?/, '') ?? '';
    const rest: string[] = [];
    for (const l of lines.slice(k + 1)) {
      if (l.startsWith('- `') || /^##\s/.test(l)) break;
      rest.push(l);
    }
    const quoted = unquote(rest.join('\n'));
    return (quoted || [first, ...rest].join('\n')).trim();
  };
  const trash: LapFile[] = tableUnder(l560, /^## Корзина/).map((r) => {
    const name = tick(r[0] ?? '');
    return {
      path: `Корзина/${name}`,
      name,
      type: typeOf(name),
      origin: tick(r[1] ?? ''),
      modified: r[2],
      deleted: r[3],
      material: 'L560',
      body: trashText(name),
    };
  });

  const bookmarks = [...section(l560, /^## Браузер/).matchAll(/^- (.+?) — (\S+)\s*$/gm)].map(
    (m) => ({ title: m[1] ?? '', url: m[2] ?? '' }),
  );

  return { desktop, trash, bookmarks, printLog: afterTitle(l562) };
}

/** Все файлы (без папок), рабочий стол и корзина. */
export function allFiles(lap: Laptop): LapFile[] {
  const out: LapFile[] = [];
  const walk = (list: LapFile[]) => {
    for (const f of list) {
      if (f.type !== 'folder') out.push(f);
      if (f.children) walk(f.children);
    }
  };
  walk(lap.desktop);
  out.push(...lap.trash);
  return out;
}

/** Файл или папка по пути. */
export function findFile(lap: Laptop, path: string): LapFile | null {
  if (path.startsWith('Корзина/')) return lap.trash.find((f) => f.path === path) ?? null;
  const walk = (list: LapFile[]): LapFile | null => {
    for (const f of list) {
      if (f.path === path) return f;
      const inner = f.children ? walk(f.children) : null;
      if (inner) return inner;
    }
    return null;
  };
  return walk(lap.desktop);
}

/** Где открыть материал на ноутбуке (поиск): первый файл из него. */
export const fileOfMaterial = (lap: Laptop, material: string) =>
  allFiles(lap).find((f) => f.material === material) ?? null;
