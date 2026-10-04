import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 20_000,
  use: { trace: 'retain-on-failure' },
  reporter: process.env.CI ? 'github' : 'list',
});
