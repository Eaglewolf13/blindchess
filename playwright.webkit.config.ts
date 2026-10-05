import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testIgnore: '**/voice.spec.ts', // Chromium's synthetic microphone flags do not apply to WebKit.
  workers: 1,
  webServer: undefined, // Each test owns a stoppable static server; see tests/fixtures.ts.
  outputDir: 'test-results/webkit',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175', browserName: 'webkit', channel: undefined },
});
