import { describe, expect, it } from 'vitest';
import { waitForDatabase } from '../src/startup.ts';

describe('waitForDatabase', () => {
  it('повторяет миграции, пока база не ответит, и пишет причину ошибки в лог', async () => {
    let calls = 0;
    const logs: string[] = [];
    await waitForDatabase(
      async () => {
        calls++;
        if (calls < 3) throw new Error('password authentication failed for user "postgres"');
      },
      { sleep: async () => {}, log: (m) => logs.push(m) },
    );
    expect(calls).toBe(3);
    expect(logs.some((m) => m.includes('password authentication failed'))).toBe(true);
  });
});
