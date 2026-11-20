/**
 * Сквозной проход пакета (`gm/walkthrough*.txt`) — тот же формат и те же ожидания, что у
 * эталона `playtest.py walk`. Строка: `ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ => ОЖИДАНИЕ`; `---` —
 * граница раунда (в игре — прошла пауза лимитов и открытое доставлено игроку); `#` — комментарий.
 * Используется в автотестах движка; в игру не входит.
 */
import { act, type Content, markSeen } from './engine.ts';
import {
  ACTIONS,
  type ActionInput,
  type ActionName,
  DEFAULT_CONFIG,
  emptyProgress,
  type Result,
} from './types.ts';

const ACTION_RE = new RegExp(
  `^\\s*[-*]?\\s*(${[...ACTIONS, 'ЗАПРОС', 'ПОИСК'].join('|')})\\s*\\|\\s*(.*?)\\s*\\|\\s*(.*?)\\s*$`,
  'u',
);
const EXPECT_RE = /^(.*?)\s*=>\s*(.*?)\s*$/u;
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

/** «ДЕЙСТВИЕ | ЦЕЛЬ | ЗНАЧЕНИЕ» → действие (служебная строка разработки, E2-CHECK-A). */
export function parseActionLine(line: string): ActionInput | null {
  // Строку можно скопировать из сквозного прохода целиком: «=> ожидание» и «# …» отрезаются.
  const bare = (line.split(' #')[0] ?? '').trimEnd();
  const m = ACTION_RE.exec(EXPECT_RE.exec(bare)?.[1] ?? bare);
  if (!m) return null;
  const action = m[1] as ActionName;
  if (!ACTIONS.includes(action)) return null;
  const target = m[2] ?? '';
  const value = m[3] ?? '';
  return { action, target, value };
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
    const input = { action, target, value };
    const r = act(content, progress, input, now, DEFAULT_CONFIG, { autoSeen: false });
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
