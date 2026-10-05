import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const fixture = resolve('tests/fixtures/move.wav');
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${fixture}`,
    ],
  },
});
test('offline recognizer executes a synthetic spoken move through AudioWorklet', async ({
  page,
  context,
}) => {
  test.skip(
    !existsSync(fixture),
    'Generate the local speech fixture with scripts/generate-speech-fixture.ps1.',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Mute spoken responses', exact: true }).click();
  await page.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await page.getByRole('button', { name: 'Download voice pack', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Enable microphone', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause microphone', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.locator('.count-pill')).toHaveText('1', { timeout: 25000 });
  await expect(page.getByText('Black to move', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause microphone', exact: true }).click();
  expect(errors).toEqual([]);
});
