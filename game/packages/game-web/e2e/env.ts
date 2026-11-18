/**
 * Свой экземпляр для автотестов: своя база и порты, раскладка автора не трогается. Порты можно
 * сменить переменными E2E_PG_PORT / E2E_API_PORT / E2E_WEB_PORT — чтобы два прогона из разных
 * копий проекта (git worktree) шли одновременно.
 */
export const E2E = {
  PG_PORT: process.env.E2E_PG_PORT ?? '5434',
  API_PORT: process.env.E2E_API_PORT ?? '8788',
  WEB_PORT: process.env.E2E_WEB_PORT ?? '5174',
} as const;
