import { defineConfig, devices } from '@playwright/test';

// Большая проверка RV-BC (26.11): работающий экземпляр на своих портах (5184/8798/5444),
// без своих серверов и базы. Срезы сохранений — review/seed.spec.ts.
const [vw, vh] = (process.env.E2E_VIEWPORT ?? '1920x1080').split('x').map(Number);
const viewport = { width: vw || 1920, height: vh || 1080 };

export default defineConfig({
  testDir: '.',
  testMatch: /seed\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5184', viewport, reducedMotion: 'reduce' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport, reducedMotion: 'reduce' } },
  ],
});
