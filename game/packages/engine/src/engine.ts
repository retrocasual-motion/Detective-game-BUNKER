/**
 * Движок правил (TECH_PLAN 6.1–6.2): одно действие игрока → ответ правила из `access.json`.
 * Перенос логики прототипа `playtest.py` (resolve, resolve_petition, form_gate, AttemptLimit,
 * walk) без изменений смысла; сквозные проходы пакета — автотесты (walk.test.ts).
 * Чистые функции: без базы и сети. «Раунды» прототипа заменены паузой по времени (T-11-A).
 */
import { search } from './pyre.ts';
import { findQuote, norm, qnorm } from './text.ts';
import {
  type AccessRules,
  type ActionInput,
  type Card,
  type CardSpec,
  DEFAULT_CONFIG,
  type EngineConfig,
  type Outcome,
  type Progress,
  type Result,
  type Rule,
} from './types.ts';

export interface ActOptions {
  /** Считать открытое прошлыми действиями доставленным игроку (в игре — да; в сквозном проходе — по `---`). */
  autoSeen?: boolean;
}

/** Тексты материалов: стартовые (01…51) и закрытые (L…). */
export interface Content {
  rules: AccessRules;
  starting: ReadonlyMap<string, string>;
  locked: ReadonlyMap<string, string>;
}

const FORM_BEFORE =
  'Заключение принимается только через форму: сначала откройте её («Решить дело»).';
const FORM_SAME_ROUND =
  'Форма заключения только что открыта: заполните её пункты и отправьте заключение.';
const FORM_AFTER = 'Форма заключения открыта: новые действия недоступны.';
const LIMIT_REPLY = 'Слишком много неверных попыток: поле ввода примет значение позже.';
const NOT_FORMED = 'Ходатайство не оформлено: нужны две карточки — «Прошу» и «На основании».';
const MAIL = 'почта';

const isReleased = (p: Progress, id: string) => p.released.includes(id);
const requiresMet = (r: Rule, p: Progress) => (r.requires ?? []).every((id) => isReleased(p, id));
const targetMatches = (r: Rule, target: string) => search(r.target, norm(target)) !== null;
const rulesFor = (c: Content, action: string) => c.rules.rules.filter((r) => r.action === action);
const defaultReply = (c: Content, action: string, fallback = 'Нет результата.') =>
  c.rules.default_reply?.[action] ?? fallback;

interface Miss {
  hit: null;
  reply: string;
  result: Result;
  rule: string;
}
interface Hit {
  hit: Rule;
}

/** Сопоставление действия с правилами (кроме ХОДАТАЙСТВО). Без побочных эффектов. */
export function resolve(
  c: Content,
  p: Progress,
  action: string,
  target: string,
  value: string,
): Hit | Miss {
  const cand = rulesFor(c, action).filter((r) => targetMatches(r, target));
  const open = cand.filter((r) => requiresMet(r, p));
  const v = norm(value);
  const byPattern = (fallback: boolean) =>
    open.find(
      (r) =>
        Boolean(r.fallback) === fallback && (r.accept ?? []).some((a) => search(a, v) !== null),
    );
  const hit = byPattern(false) ?? byPattern(true);
  if (hit) return { hit };
  const first = open[0];
  if (first) {
    return {
      hit: null,
      reply: first.fail ?? defaultReply(c, action),
      result: 'отказ',
      rule: first.id,
    };
  }
  const closed = cand[0];
  if (closed) {
    return {
      hit: null,
      reply: closed.requires_reply ?? defaultReply(c, action),
      result: 'нет доступа',
      rule: closed.id,
    };
  }
  return { hit: null, reply: defaultReply(c, action), result: 'нет правила', rule: '—' };
}

/** Карточка, найденная в материале: номер, цитата (нижний регистр), строка материала. */
interface CheckedCard {
  file: string;
  quote: string;
  line: string;
}

/** Файлы, доступные игроку для карточек: стартовые, открытые закрытые, почта. */
export function availableTexts(c: Content, p: Progress): Map<string, string> {
  const out = new Map(c.starting);
  for (const id of p.released) {
    const t = c.locked.get(id);
    if (t !== undefined) out.set(id, t);
  }
  if (p.mail) out.set(MAIL, p.mail);
  return out;
}

/** Номер файла карточки: «l214», «Л 214» → «L214»; «почта…» → «почта» (как parse_card прототипа). */
export function normalizeCardFile(file: string): string {
  const f = file.replace(/\s+/gu, '');
  if (f.toLowerCase().startsWith('почт')) return MAIL;
  return 'lLлЛ'.includes(f[0] ?? '') ? `L${f.slice(1)}` : f;
}

function checkCard(card: Card, files: Map<string, string>): CheckedCard | string {
  // Переводы строк внутри цитаты — пробел: строка карточки — одна строка (как в прототипе).
  const raw = card.quote.replace(/\s+/gu, ' ').trim();
  const file = normalizeCardFile(card.file);
  if (!file || !raw) {
    return 'Карточка не оформлена: укажите файл и строку из него.';
  }
  const text = files.get(file);
  if (text === undefined) return `Карточка не из материалов дела: файла ${file} в деле нет.`;
  const line = findQuote(text, raw);
  if (line === null) {
    return `В файле ${file} такой строки нет: карточка — точная строка или деталь материала.`;
  }
  return { file, quote: raw.toLowerCase().replaceAll('ё', 'е'), line };
}

/**
 * Файл подходит, шаблон находит реквизит в цитате, и найденный фрагмент есть в самой строке
 * материала (свои слова игрока в карточке реквизитом не считаются).
 */
function specOk(spec: CardSpec, card: CheckedCard): boolean {
  if (search(spec.file ?? '.*', card.file) === null) return false;
  const m = search(spec.quote ?? '.*', card.quote);
  if (m === null) return false;
  const frag = qnorm(m[0]);
  return !frag || card.line.includes(frag);
}

function cardsOk(r: Rule, cards: [CheckedCard, CheckedCard]): boolean {
  if ((r.not_cards ?? []).some((s) => cards.some((cd) => specOk(s, cd)))) return false;
  const slots = r.cards ?? [];
  const [a, b] = cards;
  const fits = (cd: CheckedCard, slot: CardSpec[] | undefined) =>
    (slot ?? []).some((s) => specOk(s, cd));
  if (slots.length === 0) return true;
  if (slots.length === 1) return cards.some((cd) => fits(cd, slots[0]));
  return (fits(a, slots[0]) && fits(b, slots[1])) || (fits(b, slots[0]) && fits(a, slots[1]));
}

type PetitionMiss = Miss & { formed: boolean };

/** Ходатайство: адрес — шаблон цели, карточки — слоты `cards`. */
export function resolvePetition(
  c: Content,
  p: Progress,
  target: string,
  cards: [Card, Card] | undefined,
): Hit | PetitionMiss {
  if (!cards)
    return { hit: null, reply: NOT_FORMED, result: 'не оформлено', rule: '—', formed: false };
  const files = availableTexts(c, p);
  const checked: CheckedCard[] = [];
  for (const card of cards) {
    const r = checkCard(card, files);
    if (typeof r === 'string') {
      return { hit: null, reply: r, result: 'не оформлено', rule: '—', formed: false };
    }
    checked.push(r);
  }
  const pair = checked as [CheckedCard, CheckedCard];
  const addr = norm(target);
  if (
    c.rules.address_book &&
    addr.includes('@') &&
    ![...files.values()].some((t) => t.toLowerCase().includes(addr))
  ) {
    return {
      hit: null,
      reply: 'Адреса нет в адресной книге: она пополняется адресами из открытых материалов дела.',
      result: 'не оформлено',
      rule: '—',
      formed: false,
    };
  }
  const cand = rulesFor(c, 'ХОДАТАЙСТВО').filter((r) => targetMatches(r, target));
  // Сначала исполнимые правила и отказы с `early`, затем прочие отказы.
  for (const late of [false, true]) {
    for (const r of cand) {
      if (Boolean(r.refusal && !r.early) !== late) continue;
      if (requiresMet(r, p) && cardsOk(r, pair)) return { hit: r };
    }
  }
  return {
    hit: null,
    reply: defaultReply(c, 'ХОДАТАЙСТВО', 'Письмо не доставлено: адрес не найден.'),
    result: cand.length ? 'отказ' : 'нет правила',
    rule: cand[0]?.id ?? '—',
    formed: true,
  };
}

/** Форма заключения: после «Решить дело» новые действия закрыты (P-9). */
function formGate(
  c: Content,
  p: Progress,
  action: string,
): { reply: string; result: Result } | null {
  const ff = c.rules.final_form;
  if (!ff || action === 'СТОП') return null;
  const opened = isReleased(p, ff.release);
  if (action === 'ФИНАЛ') {
    if (!opened) return { reply: ff.before_reply ?? FORM_BEFORE, result: 'нет формы' };
    if (!p.seen.includes(ff.release)) {
      return { reply: ff.same_round_reply ?? FORM_SAME_ROUND, result: 'нет формы' };
    }
    return null;
  }
  if (opened && !ff.return_allowed)
    return { reply: ff.after_reply ?? FORM_AFTER, result: 'форма открыта' };
  return null;
}

/** Поле ввода, к которому относится действие: первое правило с подходящей целью. */
const fieldRule = (c: Content, action: string, target: string) =>
  rulesFor(c, action).find((r) => targetMatches(r, target));

const fieldKey = (c: Content, action: string, target: string) =>
  `${action}|${fieldRule(c, action, target)?.id ?? norm(target)}`;

function limitFor(c: Content, action: string, target: string): number | null {
  const r = fieldRule(c, action, target);
  if (r && r.attempt_limit !== undefined) return r.attempt_limit || null;
  return c.rules.attempt_limit?.[action] ?? null;
}

/** Попытки, давние больше паузы, уже не считаются (раунд прототипа = пауза T-11-A). */
function freshFails(p: Progress, key: string, now: number, cfg: EngineConfig): number {
  const f = p.fails[key];
  return f && now - f.last < cfg.pauseMs ? f.n : 0;
}

function limitReply(c: Content, action: string, target: string): string {
  return (
    fieldRule(c, action, target)?.attempt_limit_reply ?? c.rules.attempt_limit_reply ?? LIMIT_REPLY
  );
}

function hitReply(hit: Rule, opened: string[]): { reply: string; result: Result } {
  if (hit.refusal) return { reply: hit.ok ?? 'Отказ.', result: 'отказ' };
  if (hit.release.length === 0) return { reply: hit.ok ?? 'Готово.', result: 'ответ' };
  if (opened.length) return { reply: hit.ok ?? 'Готово.', result: 'успех' };
  return { reply: hit.again ?? 'Уже получено.', result: 'повтор' };
}

/**
 * Одно действие игрока. Возвращает новый прогресс (старый не меняется) и ответ.
 * `now` — время действия, мс (лимиты попыток).
 */
export function act(
  c: Content,
  progress: Progress,
  input: ActionInput,
  now: number,
  cfg: EngineConfig = DEFAULT_CONFIG,
  opts: ActOptions = {},
): { progress: Progress; outcome: Outcome } {
  // Всё открытое прошлыми действиями игрок уже получил в их ответах — оно «видено» (раунд
  // прототипа в игре = следующее действие). Сквозной проход отмечает видимое сам, по `---`.
  const autoSeen = opts.autoSeen ?? true;
  const p: Progress = {
    released: [...progress.released],
    seen: autoSeen ? [...progress.released] : [...progress.seen],
    // Неверные попытки старше паузы ничего не значат — прогресс не растёт без предела.
    fails: Object.fromEntries(
      Object.entries(progress.fails).filter(([, f]) => now - f.last < cfg.pauseMs),
    ),
    mail: progress.mail,
    ended: progress.ended,
  };
  const { action, target } = input;
  const value = input.value ?? '';
  const done = (result: Result, rule: string, reply: string, released: string[] = []) => ({
    progress: p,
    outcome: { result, rule, reply, released },
  });

  if (p.ended) return done('после конца', '—', 'Расследование закрыто.');
  const gate = formGate(c, p, action);
  if (gate) return done(gate.result, 'final_form', gate.reply);

  const limit = limitFor(c, action, target);
  const key = fieldKey(c, action, target);
  if (limit && freshFails(p, key, now, cfg) >= limit) {
    return done('лимит', key, limitReply(c, action, target));
  }
  const recordFail = () => {
    if (!limit) return;
    p.fails[key] = { n: freshFails(p, key, now, cfg) + 1, last: now };
  };

  if (action === 'ФИНАЛ' || action === 'СТОП') {
    p.ended = true;
    return done(
      'конец',
      '—',
      action === 'ФИНАЛ' ? 'Заключение направлено в бюро.' : 'Расследование прекращено.',
    );
  }

  let r: Hit | Miss;
  if (action === 'ХОДАТАЙСТВО') {
    const pr = resolvePetition(c, p, target, input.cards);
    r = pr;
    if (!pr.hit || pr.hit.refusal) recordFail();
    const formed = pr.hit !== null || (pr as PetitionMiss).formed;
    if (formed) {
      const text = pr.hit ? hitReply(pr.hit, ['x']).reply : (pr as PetitionMiss).reply;
      p.mail += `\n${text}\n`;
    }
  } else {
    r = resolve(c, p, action, target, value);
    if (!r.hit) recordFail();
  }

  if (!r.hit) return done(r.result, r.rule, r.reply);
  const opened = r.hit.release.filter((id) => c.locked.has(id) && !isReleased(p, id));
  p.released.push(...opened);
  const { reply, result } = hitReply(r.hit, opened);
  return done(result, r.hit.id, reply, opened);
}

/** Игрок получил открытые материалы (их видно в деле) — для формы заключения. */
export function markSeen(progress: Progress): Progress {
  return { ...progress, seen: [...progress.released] };
}
