/**
 * Движок правил (TECH_PLAN 6.1–6.2): одно действие игрока → ответ правила из `access.json`.
 * Перенос логики прототипа `playtest.py` (resolve, form_gate, AttemptLimit,
 * walk) без изменений смысла; сквозные проходы пакета — автотесты (walk.test.ts).
 * Чистые функции: без базы и сети. «Раунды» прототипа заменены паузой по времени (T-11-A).
 */
import { search } from './pyre.ts';
import { norm } from './text.ts';
import {
  type AccessRules,
  type ActionInput,
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

/** Сопоставление действия с правилами. Без побочных эффектов. */
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

/**
 * Счётчики неверных попыток (RV-64): у каждого поля, к которому подходит цель, свой; пауза — если
 * исчерпан любой. Лишнее слово в цели («сейф газета», «сейф телефон») не даёт нового счётчика: промах
 * засчитывается каждому подошедшему полю. Поле «без паузы» (поиск, архив газеты — `unlimited`) —
 * по самому полю, а не по словам цели. Цель не подходит ни к одному полю — общий счётчик действия.
 */
function fieldLimits(
  c: Content,
  action: string,
  target: string,
  cfg: EngineConfig = DEFAULT_CONFIG,
): { key: string; limit: number }[] {
  // Слова «поля без паузы» в цели («газеты», «документы программы»): поле без паузы — то правило,
  // которое подходит именно к этим словам; остальные подошедшие (лишнее слово дописали к «сейфу») —
  // с паузой.
  const freeWords = (cfg.unlimited ?? []).flatMap((pat) => search(pat, norm(target))?.[0] ?? []);
  const own = cfg.limits?.[action];
  const base = own !== undefined ? own : c.rules.attempt_limit?.[action];
  const matched = rulesFor(c, action).filter((r) => targetMatches(r, target));
  if (!matched.length) {
    if (freeWords.length) return [];
    return base ? [{ key: `${action}|*`, limit: base }] : [];
  }
  // Поле — правила с одним шаблоном цели: счётчик и лимит — у первого (как прежде у `fieldRule`).
  const out = new Map<string, number>();
  const fields = new Set<string>();
  for (const r of matched) {
    if (fields.has(r.target)) continue;
    fields.add(r.target);
    if (freeWords.some((w) => targetMatches(r, w))) continue;
    const limit = own !== undefined ? own : (r.attempt_limit ?? base);
    if (limit) out.set(`${action}|${r.id}`, limit);
  }
  return [...out].map(([key, limit]) => ({ key, limit }));
}

/** Попытки, давние больше паузы, уже не считаются (раунд прототипа = пауза T-11-A). */
function freshFails(p: Progress, key: string, now: number, cfg: EngineConfig): number {
  const f = p.fails[key];
  return f && now - f.last < cfg.pauseMs ? f.n : 0;
}

/**
 * Через сколько мс поле снова примет значение (0 — принимает). Игра показывает отсчёт на экране
 * вещи (LK-A).
 */
export function fieldWait(
  c: Content,
  progress: Progress,
  action: string,
  target: string,
  now: number,
  cfg: EngineConfig = DEFAULT_CONFIG,
): number {
  let wait = 0;
  for (const { key, limit } of fieldLimits(c, action, target, cfg)) {
    const f = progress.fails[key];
    if (f && freshFails(progress, key, now, cfg) >= limit)
      wait = Math.max(wait, f.last + cfg.pauseMs - now);
  }
  return Math.max(0, wait);
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

  const limits = fieldLimits(c, action, target, cfg);
  const full = limits.find(({ key, limit }) => freshFails(p, key, now, cfg) >= limit);
  if (full) return done('лимит', full.key, limitReply(c, action, target));
  const recordFail = () => {
    for (const { key } of limits) p.fails[key] = { n: freshFails(p, key, now, cfg) + 1, last: now };
  };

  if (action === 'ФИНАЛ' || action === 'СТОП') {
    p.ended = true;
    return done(
      'конец',
      '—',
      action === 'ФИНАЛ' ? 'Заключение направлено в бюро.' : 'Расследование прекращено.',
    );
  }

  const r = resolve(c, p, action, target, value);
  if (!r.hit) recordFail();

  if (!r.hit) return done(r.result, r.rule, r.reply);
  // Попадание сбрасывает счёт промахов поля (RV-31): пауза — после N неверных подряд (LM-A), а не
  // после N неверных вперемешку с верными.
  if (!r.hit.refusal) for (const { key } of limits) delete p.fails[key];
  const opened = r.hit.release.filter((id) => c.locked.has(id) && !isReleased(p, id));
  p.released.push(...opened);
  const { reply, result } = hitReply(r.hit, opened);
  return done(result, r.hit.id, reply, opened);
}

/** Игрок получил открытые материалы (их видно в деле) — для формы заключения. */
export function markSeen(progress: Progress): Progress {
  return { ...progress, seen: [...progress.released] };
}
