import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, chromium } from '@playwright/test';

for (const recognizer of ['vosk', 'vosk-open', 'whisper'])
  test(`${recognizer}: offline AudioWorklet transcription and command handling`, async () => {
    const fixture = resolve(
      `tests/fixtures/${recognizer === 'whisper' ? 'last-move' : 'move'}.wav`,
    );
    test.setTimeout(180000);
    test.skip(!existsSync(fixture), 'Generate fixtures with scripts/generate-speech-fixture.ps1.');
    const browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${fixture}`,
      ],
    });
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      permissions: ['microphone'],
    });
    const page = await context.newPage();
    try {
      const errors: string[] = [];
      const external: string[] = [];
      page.on('request', (request) => {
        if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173/'))
          external.push(request.url());
      });
      page.on('console', (message) => {
        if (message.type() === 'error') console.log(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await page.getByRole('button', { name: 'Mute spoken responses', exact: true }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByLabel('Local recognizer', { exact: true }).selectOption(recognizer);
      await page.getByRole('checkbox', { name: /Voice debug mode/ }).check();
      await page.getByRole('button', { name: 'Practice room', exact: true }).click();
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
      await expect(page.getByRole('button', { name: 'Pause microphone', exact: true })).toBeVisible(
        {
          timeout: 60000,
        },
      );
      if (recognizer === 'vosk-open') {
        // Unrestricted English mishears this synthetic fixture as "pony to he for".
        // Verify safe rejection and visible diagnostics, not an accuracy claim.
        await expect(page.locator('.voice-log')).toContainText('apex move', { timeout: 30000 });
        await expect(page.locator('.voice-log')).toContainText(/not executed|Not executed/);
        await expect(page.locator('.count-pill')).toHaveText('0');
      } else if (recognizer === 'whisper') {
        await expect(page.locator('.voice-log')).toContainText('Handled: lastMove', {
          timeout: 30000,
        });
        await expect(page.locator('.feedback')).toContainText(
          'No moves have been played. White to move.',
        );
        await expect(page.locator('.count-pill')).toHaveText('0');
      } else {
        await expect(page.locator('.count-pill')).toHaveText('1', { timeout: 60000 });
        await expect(page.getByText('Black to move', { exact: true })).toBeVisible();
        await expect(page.locator('.voice-log')).toContainText('Handled: move');
      }
      await page.getByRole('button', { name: 'Pause microphone', exact: true }).click();
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
