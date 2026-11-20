import { defineConfig, devices } from '@playwright/test';
import { E2E } from './e2e/env.ts';

// Экран тестов: по умолчанию 1366×768; другой — E2E_VIEWPORT=1920x1080 (проверка на разных экранах).
const [vw, vh] = (process.env.E2E_VIEWPORT ?? '1366x768').split('x').map(Number);
const viewport = { width: vw || 1366, height: vh || 768 };

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // В CI — ещё и список с длительностью каждого теста (видно медленные).
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
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
        // Вход по ссылке (6a-1); письма — в памяти сервера (служебная «исходящая почта»).
        AUTH: 'link',
        MAIL_TRANSPORT: 'memory',
        PUBLIC_URL: `http://localhost:${E2E.WEB_PORT}`,
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
