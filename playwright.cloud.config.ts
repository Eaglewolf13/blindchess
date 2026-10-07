import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.APEX_TEST_PORT ?? 4174);
export default defineConfig({
  testDir: './tests',
  testMatch: 'accounts.spec.ts',
  timeout: 90000,
  expect: { timeout: 20000 },
  workers: 1,
  outputDir: 'test-results/accounts',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
