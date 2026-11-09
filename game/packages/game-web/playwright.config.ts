import { defineConfig, devices } from '@playwright/test';
import { E2E } from './e2e/env.ts';

const viewport = { width: 1366, height: 768 };

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Без анимаций: фикстура включает игровую настройку «уменьшить движение» (RM-A), когда
  // reducedMotion = 'reduce'; анимацию проверяют тесты с 'no-preference'.
  use: {
    baseURL: `http://localhost:${E2E.WEB_PORT}`,
    viewport,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport, reducedMotion: 'reduce' } },
  ],
  // Два процесса напрямую, без вложенного pnpm --parallel (под Playwright он зависал).
  webServer: [
    {
      command: 'npx tsx ../content/src/cli.ts && npx tsx ../api/src/server.ts',
      port: Number(E2E.API_PORT),
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_PORT: E2E.API_PORT,
        DATABASE_URL: `postgres://postgres:postgres@localhost:${E2E.PG_PORT}/bunker`,
        NODE_ENV: 'development',
        // Ответ на ходатайство в автотестах — почти сразу.
        MAIL_DELAY_MS: '1500',
      },
    },
    {
      command: 'npx vite',
      url: `http://localhost:${E2E.WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_PORT: E2E.API_PORT, WEB_PORT: E2E.WEB_PORT },
    },
  ],
});
