/**
 * Сквозной проход пакета (`gm/walkthrough*.txt`) — тот же формат и те же ожидания, что у
 * эталона `playtest.py walk`. Строка: `ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ => ОЖИДАНИЕ`; `---` —
 * граница раунда (в игре — прошла пауза лимитов и открытое доставлено игроку); `#` — комментарий.
 * Используется в автотестах движка; в игру не входит.
 */
import { act, type Content, markSeen } from './engine.ts';
import { strip } from './text.ts';
import {
  ACTIONS,
  type ActionInput,
  type ActionName,
  type Card,
  DEFAULT_CONFIG,
  emptyProgress,
  type Result,
} from './types.ts';

const ACTION_RE = new RegExp(
  `^\\s*[-*]?\\s*(${[...ACTIONS, 'ЗАПРОС', 'ПОИСК'].join('|')})\\s*\\|\\s*(.*?)\\s*\\|\\s*(.*?)\\s*$`,
  'u',
);
const EXPECT_RE = /^(.*?)\s*=>\s*(.*?)\s*$/u;
const CARD_SPLIT_RE = /(?:^|[;|\s])(?:на\s+)?основани[еия]\s*[:—-]/iu;
const CARD_HEAD_RE =
  /^\s*(?:файл\s*№?\s*)?(?<id>[lл]\s*\d{3}|\d{2}|почт[\p{L}\p{N}_]*)(?:__\S*?)?(?:\.md)?(?=[\s,:;·—«"'(-]|$)\s*[,:;·—-]*\s*(?<q>.*)$/iu;
const RESULTS = new Set<string>([
  'ответ',
  'отказ',
  'нет доступа',
  'нет правила',
  'повтор',
  'лимит',
  'нет формы',
  'форма открыта',
  'конец',
  'после конца',
  'не оформлено',
]);

/** «прошу: 04, «строка» ; основание: 06, «строка»» → две карточки (как parse_petition + parse_card). */
export function parsePetition(value: string): [Card, Card] | undefined {
  const m = CARD_SPLIT_RE.exec(value);
  if (!m) return undefined;
  const a = strip(
    value
      .slice(0, m.index)
      .replace(/^\s*прошу\s*[:—-]?\s*/iu, '')
      .trim(),
    ' ;|',
  );
  const b = strip(value.slice(m.index + m[0].length).trim(), ' ;|');
  if (!a || !b) return undefined;
  return [parseCard(a), parseCard(b)];
}

function parseCard(text: string): Card {
  const m = CARD_HEAD_RE.exec(text);
  if (!m?.groups) return { file: '', quote: '' };
  const rawId = (m.groups.id ?? '').replace(/\s+/gu, '');
  const head = rawId[0] ?? '';
  const file = rawId.toLowerCase().startsWith('почт')
    ? 'почта'
    : 'lLлЛ'.includes(head)
      ? `L${rawId.slice(1)}`
      : rawId;
  const quote = strip((m.groups.q ?? '').trim(), ' «»"\'“”„.;,');
  return { file, quote };
}

/** «ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ» → действие (служебная строка разработки, E2-CHECK-A). */
export function parseActionLine(line: string): ActionInput | null {
  const m = ACTION_RE.exec(line);
  if (!m) return null;
  const action = m[1] as ActionName;
  if (!ACTIONS.includes(action)) return null;
  const target = m[2] ?? '';
  const value = m[3] ?? '';
  return action === 'ХОДАТАЙСТВО'
    ? { action, target, value, cards: parsePetition(value) }
    : { action, target, value };
}

export interface WalkLine {
  line: number;
  text: string;
  result: Result;
  rule: string;
  opened: string[];
  expect: string | null;
  ok: boolean;
}

export interface WalkReport {
  lines: WalkLine[];
  actions: number;
  mismatches: number;
  released: string[];
}

export function walk(content: Content, script: string): WalkReport {
  let progress = emptyProgress();
  let now = 0;
  const lines: WalkLine[] = [];
  let actions = 0;
  let mismatches = 0;
  script.split(/\r?\n/).forEach((raw, i) => {
    const ln = i + 1;
    const line = raw.trimStart().startsWith('#') ? '' : (raw.split(' #')[0] ?? '').trimEnd();
    if (line.trim() === '---') {
      progress = markSeen(progress);
      now += DEFAULT_CONFIG.pauseMs + 1000;
      return;
    }
    if (!line.trim()) return;
    const em = EXPECT_RE.exec(line);
    const actLine = em ? (em[1] ?? '') : line;
    const expect = em ? (em[2] ?? '') : null;
    const m = ACTION_RE.exec(actLine);
    if (!m) {
      mismatches++;
      lines.push({
        line: ln,
        text: raw,
        result: 'нет правила',
        rule: '—',
        opened: [],
        expect,
        ok: false,
      });
      return;
    }
    actions++;
    now += 1000;
    const action = m[1] as ActionName;
    const target = m[2] ?? '';
    const value = m[3] ?? '';
    const input =
      action === 'ХОДАТАЙСТВО'
        ? { action, target, value, cards: parsePetition(value) }
        : { action, target, value };
    const r = act(content, progress, input, now);
    progress = r.progress;
    const { result, rule, released: opened } = r.outcome;
    let ok = true;
    if (expect !== null) {
      const e = expect.trim().toLowerCase();
      if (RESULTS.has(e)) ok = result === e;
      else {
        const want = e
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean)
          .sort();
        ok = result === 'успех' && JSON.stringify([...opened].sort()) === JSON.stringify(want);
      }
    }
    if (!ok) mismatches++;
    lines.push({ line: ln, text: raw, result, rule, opened, expect, ok });
  });
  return { lines, actions, mismatches, released: progress.released };
}
