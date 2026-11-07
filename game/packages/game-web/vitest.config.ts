import { defineConfig } from 'vitest/config';

/** Vitest — только модульные тесты в src/; e2e/ — Playwright. */
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
