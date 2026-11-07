import { setTimeout as delay } from 'node:timers/promises';

interface WaitOptions {
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

/**
 * Применяет миграции, как только база ответит. Причина ошибки пишется в лог
 * (первая попытка и каждая десятая), чтобы неверный пароль или отсутствующая база
 * не превращались в молчаливое «503 навсегда».
 */
export async function waitForDatabase(
  migrate: () => Promise<void>,
  { sleep = (ms) => delay(ms), log = console.error }: WaitOptions = {},
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate();
      return;
    } catch (err) {
      if (attempt === 1 || attempt % 10 === 0) {
        const reason = err instanceof Error ? err.message : String(err);
        log(`api: база пока недоступна (попытка ${attempt}): ${reason}`);
      }
      await sleep(1000);
    }
  }
}
