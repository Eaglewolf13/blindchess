import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, chromium } from '@playwright/test';

for (const scenario of ['vosk', 'vosk-open', 'whisper', 'vosk-paused'])
  test(`${scenario}: offline AudioWorklet transcription and command handling`, async () => {
    const recognizer = scenario === 'vosk-paused' ? 'vosk' : scenario;
    const fixture = resolve(
      `tests/fixtures/${scenario === 'vosk-paused' ? 'paused-move' : recognizer === 'whisper' ? 'last-move' : 'move'}.wav`,
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
        if (scenario === 'vosk-paused') {
          await expect(page.getByRole('region', { name: 'Pending voice command' })).toContainText(
            'apex move pawn e two',
            { timeout: 30000 },
          );
          await expect(page.locator('.count-pill')).toHaveText('0');
          await page.setViewportSize({ width: 390, height: 844 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.screenshot({
            path: 'test-results/mobile-pending-command.png',
            fullPage: true,
          });
        }
        await expect(page.locator('.count-pill')).toHaveText('1', { timeout: 60000 });
        await expect(page.getByText('Black to move', { exact: true })).toBeVisible();
        await expect(page.locator('.voice-log')).toContainText('Handled: move');
        await expect(page.getByRole('region', { name: 'Pending voice command' })).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Pause microphone', exact: true }).click();
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
