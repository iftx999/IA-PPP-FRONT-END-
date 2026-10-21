import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra o ambiente local completo (infra/compose.yaml do back-end + API + ng serve).
 * Usuários de desenvolvimento do realm "aurora" (senha aurora-dev).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env['AURORA_URL'] ?? 'http://localhost:4200',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
});
