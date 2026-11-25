import { createHmac, timingSafeEqual } from 'node:crypto';
import { formToken, type Material, type SiteFormId, type SitePage } from '@bunker/shared';

/**
 * Настоящие сайты дела (A-272, AC-3; T-1, ST-A): их отдаёт наш сервер по имени хоста —
 * `vaultline-program.localhost` на компьютере, поддомены автора на сервере. Реестр адресов —
 * только здесь (не в коде страницы игрока): адрес хранилища HEXON игрок узнаёт из кабинета.
 */

export interface Site {
  /** Адрес из материалов дела. */
  domain: string;
  /** Имя хоста без зоны: `vaultline-program` → vaultline-program.localhost. */
  label: string;
  /** Формы сайта. */
  forms: SiteFormId[];
  /** Материал главной страницы (его открывает переход по адресу). */
  page: string;
}

export const SITES: readonly Site[] = [
  {
    domain: 'vaultline-program.com',
    label: 'vaultline-program',
    forms: ['vl-login', 'vl-forgot', 'vl-word', 'vl-registry', 'vl-docs'],
    page: 'L101',
  },
  { domain: 'docs.hexon-bio.com', label: 'docs.hexon-bio', forms: ['hx-archive'], page: 'L735' },
  { domain: 'hexon-bio.com', label: 'hexon-bio', forms: [], page: 'L163' },
  {
    domain: 'aspen-bank.com',
    label: 'aspen-bank',
    forms: ['fr-death'],
    page: 'L130',
  },
  {
    domain: 'mailbridge.net',
    label: 'mailbridge',
    forms: ['mb-login', 'mb-forgot', 'mb-answer'],
    page: 'L249',
  },
  { domain: 'radiosolutions-inc.com', label: 'radiosolutions-inc', forms: [], page: 'L177' },
  { domain: 'octon-labs.net', label: 'octon-labs', forms: [], page: 'L272' },
  { domain: 'the-signal-news.com', label: 'the-signal-news', forms: [], page: 'L296' },
  // Сайты без замков (NF-B, A-273; TECH_PLAN 4.13): читать; телефоны HealthWay и Mesa — на них.
  { domain: 'skycell-mobile.com', label: 'skycell-mobile', forms: [], page: 'L178' },
  { domain: 'healthway-nutrition.com', label: 'healthway-nutrition', forms: [], page: 'L179' },
  { domain: 'mesa-supply.com', label: 'mesa-supply', forms: [], page: 'L180' },
  { domain: 'blackwood-bi.org', label: 'blackwood-bi', forms: [], page: 'L181' },
];

/** Адрес, как его набрали или нашли в тексте: сайт реестра и путь. */
export function siteOf(address: string): { site: Site; path: string } | null {
  const a = address
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  const [host = '', ...rest] = a.split('/');
  const site = SITES.find((s) => s.domain === host);
  if (!site) return null;
  const path = `/${rest.join('/')}`.replace(/\/+$/, '') || '/';
  return { site, path };
}

/** Хост запроса (`vaultline-program.localhost:5173`) → сайт; хост игры — null. */
export function siteByHost(hostHeader: string | undefined, gameHost: string): Site | null {
  const host = (hostHeader ?? '').toLowerCase().split(':')[0] ?? '';
  const zone = gameHost === 'localhost' ? 'localhost' : gameHost;
  if (!host.endsWith(`.${zone}`)) return null;
  const label = host.slice(0, -(zone.length + 1));
  return SITES.find((s) => s.label === label) ?? null;
}

/** Адрес сайта для браузера игрока: хост игры с меткой сайта впереди (порт — тот же). */
export function siteUrl(publicUrl: string, site: Site, path: string): string {
  const u = new URL(publicUrl);
  u.hostname = `${site.label}.${u.hostname}`;
  u.pathname = path;
  u.search = '';
  return u.toString();
}

/**
 * Пропуск на сайт: игрок вошёл в игру — ссылка из игры несёт подписанный ключ, сайт кладёт его
 * в свою cookie (у сайта свой домен — общая cookie с игрой на релизе не сработает).
 */
export function signPass(secret: string, playerId: string, expiresAt: number): string {
  const body = `${Buffer.from(playerId).toString('base64url')}.${expiresAt}`;
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readPass(secret: string, pass: string | undefined, now: number): string | null {
  if (!pass) return null;
  const [id, exp, sig] = pass.split('.');
  if (!id || !exp || !sig) return null;
  const want = createHmac('sha256', secret).update(`${id}.${exp}`).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  if (!(Number(exp) > now)) return null;
  return Buffer.from(id, 'base64url').toString();
}

/** Ввод формы → действие движка (как в сквозном проходе пакета). */
export function formAction(
  id: SiteFormId,
  v: Record<string, string>,
): { target: string; value: string } | null {
  const f = (k: string) => (v[k] ?? '').trim();
  const join = (...xs: string[]) => xs.filter(Boolean).join(' / ');
  switch (id) {
    case 'vl-login':
      return {
        target: 'vaultline-program.com — вход для сотрудников',
        value: join(f('login'), f('password')),
      };
    case 'vl-forgot':
      return {
        target: 'vaultline-program.com — вход для сотрудников',
        value: `забыли пароль ${f('login')}`.trim(),
      };
    case 'vl-word':
      return {
        target: 'vaultline-program.com — вход по кодовому слову',
        value: join(f('login'), f('answer')),
      };
    case 'vl-registry':
      return {
        target: 'кабинет VAULTLINE: учёт анкет',
        value: join(f('program'), f('code')),
      };
    case 'vl-docs':
      return { target: 'кабинет VAULTLINE: документы программы', value: f('title') };
    case 'hx-archive':
      return { target: 'архив проекта', value: f('password') };
    case 'fr-death':
      return {
        target: 'aspen-bank.com — сообщить о смерти арендатора',
        value: join(f('box'), f('surname'), f('date')),
      };
    case 'mb-login':
      return { target: `почта ${f('address')}`, value: f('password') };
    case 'mb-forgot':
      return { target: `почта ${f('address')}`, value: 'забыли пароль' };
    case 'mb-answer':
      return { target: `почта ${f('address')}`, value: f('answer') };
    default:
      return null;
  }
}

/** Где на странице форма: раздел (заголовок) и абзац-описание, который она заменяет. */
const FORM_AT: Partial<Record<SiteFormId, RegExp>> = {
  'vl-login': /^Форма: логин/,
  'vl-registry': /^Поля: «Программа»/,
  'vl-docs': /^Поле: «Название документа»/,
  'hx-archive': /^Поле: «Пароль владельца»/,
  'fr-death': /Сообщить о смерти арендатора\*\* — форма:/,
  'mb-login': /^Форма: адрес ящика/,
};

/**
 * Описание страницы из материала → страница: «Шапка» и «Разделы» — в шапку, описания форм —
 * метками форм, строки бумажного прототипа «Ввод: …» убраны.
 */
export function pageOf(
  m: Pick<Material, 'id' | 'title' | 'body'>,
): Pick<SitePage, 'title' | 'header' | 'nav' | 'body' | 'material'> {
  let header = '';
  let nav: string[] = [];
  const paras = m.body
    .replace(/^# [^\n]*\n+/, '')
    .replace(/^Ввод: [^\n]*\n?/gm, '')
    .split(/\n\s*\n/);
  const out: string[] = [];
  for (const p of paras) {
    const text = p.trim();
    if (!text) continue;
    // Абзац может начинаться с «Страница …», а «Шапка: …» — внутри.
    const lines = text.split('\n');
    const keep: string[] = [];
    let joined = '';
    for (const l of lines) {
      if (joined) {
        joined = `${joined} ${l.trim()}`;
        continue;
      }
      // «Страница docs…. Шапка: …» — служебное может начаться посреди строки.
      const at = l.search(/(Шапка|Разделы):/);
      if (at < 0) {
        keep.push(l);
        continue;
      }
      if (at > 0) keep.push(l.slice(0, at).trim());
      joined = l.slice(at).trim();
    }
    if (joined) {
      for (const part of joined.split(/(?=Разделы:)|(?=Шапка:)/)) {
        if (part.startsWith('Шапка:')) header = part.replace(/^Шапка:\s*/, '').trim();
        if (part.startsWith('Разделы:'))
          nav = part
            .replace(/^Разделы:\s*/, '')
            .split('·')
            .map((s) => s.trim())
            .filter(Boolean);
      }
    }
    const rest = keep.join('\n').trim();
    if (!rest) continue;
    const form = (Object.entries(FORM_AT) as [SiteFormId, RegExp][]).find(([, re]) =>
      re.test(rest.replace(/\n/g, ' ')),
    )?.[0];
    if (form) {
      out.push(formToken(form));
      if (form === 'vl-login') out.push(formToken('vl-forgot'));
      if (form === 'mb-login') out.push(formToken('mb-forgot'));
      // «Подпись под полями: «…»» — текст страницы под формой, без служебного слова.
      const sign = rest.split('\n').findIndex((l) => /^Подпись/.test(l));
      if (sign >= 0)
        out.push(
          rest
            .split('\n')
            .slice(sign)
            .join(' ')
            .replace(/^Подпись[^:]*:\s*/, '')
            .replace(/^«(.*)»\.?$/, '$1'),
        );
    } else out.push(rest);
  }
  return { title: m.title, header, nav, body: out.join('\n\n'), material: m.id };
}
