import { createServer, type Server } from 'node:net';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { pgAnswers, stalePids } from '../scripts/stale-pg.ts';

const GAME = 'E:\\Projects\\BUNKER\\game';
const PG = `${GAME}\\node_modules\\.pnpm\\@embedded-postgres+windows-x64\\native\\bin\\postgres.exe`;

describe('зависшая база разработки (случай 09.11)', () => {
  it('убираем postgres.exe из папки игры на порту и его потомков, даже если главный умер', () => {
    const procs = [
      { pid: 36164, parent: 48544, exe: PG }, // осиротевший io_worker; 48544 уже нет
      { pid: 700, parent: 36164, exe: PG },
      { pid: 900, parent: 1, exe: PG }, // база автотестов на другом порту — не трогаем
      { pid: 901, parent: 48544, exe: 'C:\\Program Files\\PostgreSQL\\16\\bin\\postgres.exe' },
    ];
    expect(stalePids(procs, [48544], GAME).sort((a, b) => a - b)).toEqual([700, 36164]);
  });

  it('чужая программа на порту — не трогаем', () => {
    const procs = [{ pid: 5, parent: 1, exe: 'C:\\Program Files\\Other\\postgres.exe' }];
    expect(stalePids(procs, [5], GAME)).toEqual([]);
    expect(stalePids([], [5], GAME)).toEqual([]);
  });

  let silent: Server | undefined;
  afterAll(() => silent?.close());

  it('порт принимает соединение, но молчит — база не отвечает', async () => {
    silent = createServer(() => {}); // соединение принято, ответа нет — как у зависшего процесса
    await new Promise<void>((r) => silent?.listen(0, '127.0.0.1', r));
    const addr = silent.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    expect(await pgAnswers(`postgres://postgres:postgres@127.0.0.1:${port}/bunker`, 1)).toBe(false);
  });

  it('живая база отвечает (и при неверном пароле — это тоже ответ)', async () => {
    const url = inject('databaseUrl');
    expect(await pgAnswers(url)).toBe(true);
    const wrong = new URL(url);
    wrong.password = 'неверный';
    expect(await pgAnswers(wrong.toString())).toBe(true);
  });
});
