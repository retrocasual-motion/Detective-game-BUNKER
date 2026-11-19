/**
 * Программа «Сервер объекта VL-31» (A-272, AC-2; T-2-A — терминал 2000-х): копия следствия с
 * диска «Прил. 7». Разделы — из материалов, без новых фактов: журнал событий (L214 §2) с
 * фильтрами, состояние на начало суток (§1) и пометка бюро (§4); узел связи за заезд (§3);
 * терминал технической (L215); сеансы пользователей (L387, копии экспортов L388–L390).
 */

type Mat = { id: string; title: string; body: string };

const stripTitle = (body: string) => body.replace(/^#\s[^\n]*\n+/, '').trim();

/** Раздел «## N. …» материала: заголовок без номера и текст. */
export function sections(body: string): { head: string; body: string }[] {
  return body
    .split(/\n(?=## )/)
    .slice(1)
    .map((p) => ({
      head: (/^## ([^\n]+)/.exec(p)?.[1] ?? '').replace(/^\d+\.\s*/, '').trim(),
      body: p.replace(/^##[^\n]*\n+/, '').trim(),
    }));
}

/** Строка журнала событий: время, терминал, учётная запись, событие, результат. */
export interface LogRow {
  time: string;
  terminal: string;
  account: string;
  event: string;
  result: string;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/** Таблица журнала (L214 §2) — строки по порядку. */
export function logRows(table: string): LogRow[] {
  return table
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .slice(2)
    .map(cells)
    .filter((c) => c.length >= 5)
    .map(([time = '', terminal = '', account = '', event = '', result = '']) => ({
      time,
      terminal,
      account,
      event,
      result,
    }));
}

/** Значения ячейки: «медкабинет, радиопост» — два терминала; «кухня / склад» — один пост. */
export const parts = (cell: string) =>
  cell
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '—');

/** Значения фильтра — из самой таблицы, по первому появлению. */
export function options(rows: readonly LogRow[], key: 'terminal' | 'account'): string[] {
  const out: string[] = [];
  for (const r of rows) for (const v of parts(r[key])) if (!out.includes(v)) out.push(v);
  return out;
}

export const matches = (r: LogRow, terminal: string | null, account: string | null) =>
  (!terminal || parts(r.terminal).includes(terminal)) &&
  (!account || parts(r.account).includes(account));

export interface ServerData {
  /** Состояние на начало суток (§1). */
  state: string;
  /** Заголовок таблицы журнала и строки (§2). */
  logHead: string;
  log: LogRow[];
  /** Текст §2 после таблицы (если есть). */
  logAfter: string;
  /** Узел связи за заезд (§3). */
  node: string;
  /** Пометка бюро к приложению (§4). */
  note: string;
}

/** Журналы сервера (L214) — по разделам программы. */
export function serverData(l214: string): ServerData {
  const s = sections(l214);
  const find = (re: RegExp) => s.find((x) => re.test(x.head));
  const log = find(/^Журнал событий/);
  const table = (log?.body ?? '')
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .join('\n');
  const after = (log?.body ?? '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('|'))
    .join('\n')
    .trim();
  return {
    state: find(/^Состояние/)?.body ?? '',
    logHead: log?.head ?? '',
    log: logRows(table),
    logAfter: after,
    node: find(/^Узел связи/)?.body ?? '',
    note: find(/^Пометка бюро/)?.body ?? '',
  };
}

/** Терминал технической (L215): паспорт выгрузки строкой и текст без заголовка. */
export function technical(l215: string): string {
  return stripTitle(l215);
}

/** Файл папки «Экспорты» (сеанс 05): копия экспорта. */
export interface ExportFile {
  id: string;
  name: string;
}

export function exportFiles(materials: readonly Mat[]): ExportFile[] {
  return ['L388', 'L389', 'L390'].flatMap((id) => {
    const m = materials.find((x) => x.id === id);
    if (!m) return [];
    return [{ id, name: /exp_\d+/.exec(m.title)?.[0] ?? id }];
  });
}

export const withoutTitle = stripTitle;
