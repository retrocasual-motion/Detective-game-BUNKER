import { defaultState, type PlayerState } from '@bunker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaver } from './save.ts';
import type { SaveStatus } from './store.ts';

const state = (view: PlayerState['view']): PlayerState => ({ ...defaultState([]), view });

/** Ручной put: каждый вызов ждёт, пока тест его разрешит или отклонит. */
function manualPut() {
  const calls: { s: PlayerState; resolve: () => void; reject: () => void }[] = [];
  const put = (s: PlayerState) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ s, resolve, reject: () => reject(new Error('500')) });
    });
  return { put, calls };
}

describe('createSaver', () => {
  let statuses: SaveStatus[];
  beforeEach(() => {
    vi.useFakeTimers();
    statuses = [];
  });
  afterEach(() => vi.useRealTimers());

  it('три изменения за 100 мс → один запрос с последним состоянием', async () => {
    const { put, calls } = manualPut();
    const saver = createSaver(put, 500, (s) => statuses.push(s));
    saver.schedule(state('wall'));
    await vi.advanceTimersByTimeAsync(50);
    saver.schedule(state('desk'));
    await vi.advanceTimersByTimeAsync(50);
    saver.schedule(state('wall'));
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.map((c) => c.s.view)).toEqual(['wall']);
  });

  it('новое изменение во время запроса уходит после него, а не параллельно', async () => {
    const { put, calls } = manualPut();
    const saver = createSaver(put, 500, (s) => statuses.push(s));
    saver.schedule(state('wall'));
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule(state('desk'));
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    calls[0]?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.s.view)).toEqual(['wall', 'desk']);
    calls[1]?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('ошибка → статус error; следующее изменение сохраняет и снимает ошибку', async () => {
    const { put, calls } = manualPut();
    const saver = createSaver(put, 500, (s) => statuses.push(s));
    saver.schedule(state('wall'));
    await vi.advanceTimersByTimeAsync(500);
    calls[0]?.reject();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe('error');
    saver.schedule(state('desk'));
    await vi.advanceTimersByTimeAsync(500);
    calls[1]?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.s.view)).toEqual(['wall', 'desk']);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('flush отправляет отложенное сразу', async () => {
    const { put, calls } = manualPut();
    const saver = createSaver(put, 500, (s) => statuses.push(s));
    saver.schedule(state('wall'));
    const done = saver.flush();
    expect(calls.map((c) => c.s.view)).toEqual(['wall']);
    calls[0]?.resolve();
    await done;
  });

  it('flush во время запроса шлёт отложенное сразу, не дожидаясь первого', async () => {
    const { put, calls } = manualPut();
    const saver = createSaver(put, 500, (s) => statuses.push(s));
    saver.schedule(state('wall'));
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule(state('desk'));
    void saver.flush();
    expect(calls.map((c) => c.s.view)).toEqual(['wall', 'desk']);
  });

  it('после ошибки состояние не теряется: flush шлёт его снова', async () => {
    const { put, calls } = manualPut();
    const saver = createSaver(put, 500, (s) => statuses.push(s));
    saver.schedule(state('wall'));
    await vi.advanceTimersByTimeAsync(500);
    calls[0]?.reject();
    await vi.advanceTimersByTimeAsync(0);
    void saver.flush();
    expect(calls.map((c) => c.s.view)).toEqual(['wall', 'wall']);
  });

  it('после ошибки сохранение повторяется само через 3 с', async () => {
    const { put, calls } = manualPut();
    const saver = createSaver(put, 500, (s) => statuses.push(s));
    saver.schedule(state('wall'));
    await vi.advanceTimersByTimeAsync(500);
    calls[0]?.reject();
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls.map((c) => c.s.view)).toEqual(['wall', 'wall']);
    calls[1]?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('каждый запрос несёт номер версии, и он растёт', async () => {
    const seqs: number[] = [];
    const saver = createSaver(async (_s, seq) => {
      seqs.push(seq);
    });
    saver.schedule(state('wall'));
    await saver.flush();
    saver.schedule(state('desk'));
    await saver.flush();
    expect(seqs).toHaveLength(2);
    expect(seqs[1] ?? 0).toBeGreaterThan(seqs[0] ?? 0);
  });
});
