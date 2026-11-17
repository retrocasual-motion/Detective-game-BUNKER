import type { AccessRules, VerdictRubric } from '@bunker/engine';
import type { Material } from '@bunker/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApp } from '../src/app.ts';
import {
  connectDb,
  type Db,
  migrateDb,
  playerLetters,
  playerProgress,
  playerState,
} from '../src/db/client.ts';

const mat = (id: string, body = `# Материал ${id}\nадрес zapros@bureau.org\n`): Material => ({
  id,
  title: `Материал ${id}`,
  placement: 'desk',
  kind: 'sheet',
  body,
  sourceFile: `${id}__x.md`,
});
const FORM = [
  '# Форма заключения',
  '',
  '1. Кто действовал? (человек или «никто»)',
  '2. Почему? (материал дела)',
  '3. Как? (один вариант)',
  '   - сам;',
  '   - намеренно;',
  '   - без умысла.',
  '4. Что происходило? (материал дела)',
  '5. Кто за этим? (человек)',
].join('\n');
const materials = [mat('01'), mat('02')];
const locked = [mat('L998', '# Предупреждение'), mat('L999', FORM)];
const rules: AccessRules = {
  version: 1,
  final_form: { release: 'L999', return_allowed: false },
  rules: [
    {
      id: 'final-form',
      action: 'РЕШИТЬ',
      target: '.*',
      requires: ['L998'],
      accept: ['продолж'],
      release: ['L999'],
      ok: 'Форма открыта.',
    },
    {
      id: 'final-warning',
      action: 'РЕШИТЬ',
      target: '.*',
      accept: ['.*'],
      release: ['L998'],
      ok: 'Назад пути нет.',
    },
    {
      id: 'pet',
      action: 'ХОДАТАЙСТВО',
      target: '^zapros@bureau\\.org$',
      cards: [],
      release: [],
      ok: 'Бюро: ответ.',
    },
  ],
};
const verdict: VerdictRubric = {
  questions: [
    { kind: 'person', nobody: true, correct: ['p:moreau'] },
    { kind: 'material', correct: ['01'] },
    { kind: 'choice', options: 3, correct: [2] },
    { kind: 'material', correct: ['02'] },
    { kind: 'person', correct: ['p:hale'] },
  ],
  groups: [
    { id: 'death', title: 'Гибель Адама Коула', questions: [0, 1, 2] },
    { id: 'program', title: 'Программа', questions: [3, 4] },
  ],
};
const engine = {
  locked,
  verdict,
  content: {
    rules,
    starting: new Map(materials.map((m) => [m.id, m.body])),
    locked: new Map(locked.map((m) => [m.id, m.body])),
  },
};

let db: Db;
let close: () => Promise<void>;
let clock = 1_000_000;

beforeAll(async () => {
  ({ db, close } = connectDb(inject('databaseUrl')));
  await migrateDb(db);
});
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(playerState);
  await db.delete(playerProgress);
  await db.delete(playerLetters);
  clock = 1_000_000;
});

const app = () =>
  createApp({ db, materials, production: false, engine, now: () => clock, verdictDelayMs: 25_000 });
const post = (path: string, body: unknown) =>
  app().request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const caseNow = async () => (await (await app().request('/api/case')).json()) as object;
const solve = async () => {
  await post('/api/action', { action: 'РЕШИТЬ', target: 'дело', value: '' });
  await post('/api/action', { action: 'РЕШИТЬ', target: 'дело', value: 'продолжить' });
};
const RIGHT = [
  { person: 'p:moreau' },
  { card: { file: '01', quote: 'Материал 01' } },
  { choice: 2 },
  { card: { file: '02', quote: 'адрес' } },
  { person: 'p:hale' },
];
const list = async () => (await (await app().request('/api/materials')).json()) as Material[];

describe('заключение (A-270): форма, оценка, ответ бюро', () => {
  it('до «Решить дело» форма закрыта, заключение не принимается', async () => {
    expect(await caseNow()).toEqual({ form: false, sent: false });
    const res = await post('/api/verdict', { answers: RIGHT });
    expect(res.status).toBe(422);
  });

  it('предупреждение → «продолжить» → форма открыта; запросы больше не принимаются (P-9)', async () => {
    await solve();
    expect(await caseNow()).toEqual({ form: true, sent: false });
    const res = await post('/api/petition', {
      to: 'zapros@bureau.org',
      ask: { file: '01', quote: 'Материал 01' },
      basis: { file: '02', quote: 'Материал 02' },
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/Расследование закрыто/);
  });

  it('всё верно: дело закрыто, через задержку — ответ бюро и эпилог', async () => {
    await solve();
    const res = await post('/api/verdict', { answers: RIGHT });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delayMs: 25_000 });
    expect(await caseNow()).toEqual({ form: false, sent: true });
    expect((await list()).some((m) => m.kind === 'letter')).toBe(false);

    clock += 25_000;
    const letters = (await list()).filter((m) => m.kind === 'letter');
    expect(letters.map((m) => m.title)).toEqual(['Ответ бюро на заключение', 'Эпилог']);
    const body = letters[0]?.body ?? '';
    expect(body).toContain('Ваш ответ: Лея Моро — подтверждается.');
    expect(body).toContain('Ваш ответ: без умысла — подтверждается.');
    expect(body).toContain('**Гибель Адама Коула:** раскрыто.');
    expect(body).toContain('**Программа:** раскрыто.');
  });

  it('неверное и пустое — «не подтверждается» и «ответа нет»; второй раз не отправить', async () => {
    await solve();
    const answers = [{ person: 'p:pierce' }, null, { choice: 1 }, null, { person: 'p:hale' }];
    expect((await post('/api/verdict', { answers })).status).toBe(200);
    clock += 25_000;
    const body = (await list()).find((m) => m.title === 'Ответ бюро на заключение')?.body ?? '';
    expect(body).toContain('Ваш ответ: Эмма Пирс — не подтверждается.');
    expect(body).toContain('Ответа нет.');
    expect(body).toContain('**Гибель Адама Коула:** не раскрыто.');
    expect(body).toContain('**Программа:** не раскрыто.');
    expect((await post('/api/verdict', { answers: RIGHT })).status).toBe(422);
  });

  it('чужая карточка, «никто» не там и неизвестный человек — не принимаются', async () => {
    await solve();
    const bad = (i: number, a: unknown) => RIGHT.map((x, k) => (k === i ? a : x));
    for (const answers of [
      bad(1, { card: { file: '51', quote: 'чужое' } }),
      bad(4, { person: 'nobody' }),
      bad(0, { person: 'p:nobody-else' }),
      bad(2, { person: 'p:moreau' }),
    ])
      expect((await post('/api/verdict', { answers })).status).toBe(422);
    expect(await caseNow()).toEqual({ form: true, sent: false });
  });
});
