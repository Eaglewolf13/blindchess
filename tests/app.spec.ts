import { test, expect } from './fixtures';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

function pcmFixture(path: string) {
  const wav = readFileSync(path);
  let rate = 0,
    data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const kind = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (kind === 'fmt ') {
      if (
        wav.readUInt16LE(start) !== 1 ||
        wav.readUInt16LE(start + 2) !== 1 ||
        wav.readUInt16LE(start + 14) !== 16
      )
        throw new Error('The speech fixture must be mono PCM16.');
      rate = wav.readUInt32LE(start + 4);
    }
    if (kind === 'data') data = wav.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!data || !rate) throw new Error('Invalid WAV fixture.');
  return {
    rate,
    samples: Array.from({ length: data.length / 2 }, (_, i) => data!.readInt16LE(i * 2) / 32768),
  };
}

async function command(page: import('@playwright/test').Page, text: string) {
  await page.getByLabel('Type a command').fill(text);
  await page.getByRole('button', { name: 'Run command', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your mind. Your board.' })).toBeVisible();
  await page.getByRole('button', { name: 'Mute spoken responses', exact: true }).click();
});
test('text play, review numbering, export, reload and offline engine play', async ({
  page,
  disconnectOrigin,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await command(page, 'move pawn e2 e4');
  await expect(page.getByText('Black to move', { exact: true })).toBeVisible();
  await command(page, 'move pawn e7 e5');
  await command(page, 'move knight g1 f3');
  await command(page, 'move knight b8 c6');
  await command(page, 'review 2');
  await expect(page.getByRole('status')).toContainText('White knight g 1 to f 3');
  await command(page, 'next');
  await expect(page.getByRole('status')).toContainText('Black knight b 8 to c 6');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download current game as PGN' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pgn$/);
  await page.reload();
  await expect(page.locator('.count-pill')).toHaveText('4');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await disconnectOrigin();
  await page.reload();
  await expect(page.locator('.count-pill')).toHaveText('4');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByText('Play Stockfish', { exact: true }).click();
  await page.getByLabel('Engine strength').selectOption('8');
  await page.getByRole('button', { name: 'Start practicing' }).click();
  await command(page, 'move pawn e2 e4');
  await expect(page.locator('.count-pill')).toHaveText('2');
  await expect(page.getByText('White to move', { exact: true })).toBeVisible();
  await command(page, 'current eval');
  await expect(page.locator('.eval-result')).toBeVisible();
  expect(errors).toEqual([]);
});
test('legal move selectors, command settings and saved-game review', async ({ page }) => {
  await page.getByLabel('From square').selectOption('e2');
  await page.getByLabel('To square').selectOption('e4');
  await page.getByRole('button', { name: 'Make move', exact: true }).click();
  await expect(page.locator('.count-pill')).toHaveText('1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Current evaluation', { exact: false }).uncheck();
  await page.getByRole('button', { name: 'Practice room', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Current evaluation', exact: true }),
  ).toBeDisabled();
  await command(page, 'current eval');
  await expect(page.getByRole('status')).toContainText('disabled');
  await page.getByRole('button', { name: 'My games', exact: true }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Walk through the game' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Chess position/ })).toBeVisible();
});
test('responsive layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-practice.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/desktop-practice.png', fullPage: true });
});

test('resume and last-move commands, safe deletion, and voice settings survive reload', async ({
  page,
}) => {
  await command(page, 'move pawn a2 a3');
  await page.getByRole('button', { name: 'My games', exact: true }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await command(page, 'apex last move');
  await expect(page.locator('.feedback')).toContainText(
    'White played pawn a 2 to a 3. Black to move.',
  );
  await command(page, 'apex resume game');
  await command(page, 'move pawn a7 a6');
  await expect(page.locator('.count-pill')).toHaveText('2');
  await page.getByRole('button', { name: 'Repeat last move', exact: true }).click();
  await expect(page.locator('.feedback')).toContainText(
    'Black played pawn a 7 to a 6. White to move.',
  );
  await page.getByRole('button', { name: 'My games', exact: true }).click();
  await page.getByRole('button', { name: 'Delete game', exact: true }).click();
  await page.getByRole('button', { name: 'Keep game', exact: true }).click();
  await expect(page.locator('.saved-game')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete game', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.locator('.saved-game')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.count-pill')).toHaveText('0');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Local recognizer', { exact: true }).selectOption('vosk-open');
  await page.getByRole('checkbox', { name: /Voice debug mode/ }).check();
  await expect(page.getByRole('region', { name: 'Voice diagnostics' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-voice-settings.png', fullPage: true });
  await page.getByRole('checkbox', { name: /Voice debug mode/ }).uncheck();
  await expect(page.getByLabel('Square pronunciation', { exact: true })).toHaveValue('letters');
  await expect(
    page.getByLabel('Square pronunciation', { exact: true }).locator('option'),
  ).toHaveCount(2);
  await expect(page.getByLabel('Extra gap before letter', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Extra letter–number gap', { exact: true })).toHaveCount(0);
  await page.getByLabel('Square pronunciation', { exact: true }).selectOption('letters-spaced');
  await expect(page.getByLabel('Extra gap before letter', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Extra letter–number gap', { exact: true })).toHaveValue('0');
  await page.getByLabel('Extra gap before letter', { exact: true }).fill('140');
  await page.getByLabel('Extra letter–number gap', { exact: true }).fill('60');
  await expect(
    page.getByRole('button', { name: 'Test pronunciation', exact: true }),
  ).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Spoken responses/ }).check();
  if (await page.evaluate(() => 'speechSynthesis' in window)) {
    await page.getByRole('button', { name: 'Test pronunciation', exact: true }).click();
    await page.getByRole('button', { name: 'Stop test', exact: true }).click();
  } else {
    // The Windows WebKit test port has no speech output API; real Safari needs device testing.
    await expect(page.getByText('This browser does not provide speech output.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Test pronunciation', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Stop test', exact: true })).toBeDisabled();
  }
  await page.getByRole('checkbox', { name: /^Spoken responses/ }).uncheck();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/mobile-pronunciation.png', fullPage: true });
  await expect(page.getByLabel('Minimum Vosk word confidence', { exact: true })).toBeVisible();
  await page.getByLabel('Minimum Vosk word confidence', { exact: true }).fill('0.35');
  // Reload only once IndexedDB has committed; an immediate navigation can abort an async write.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open('apex-chess');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              const get = db.transaction('preferences').objectStore('preferences').get('settings');
              get.onsuccess = () => {
                db.close();
                resolve(get.result);
              };
              get.onerror = () => {
                db.close();
                reject(get.error);
              };
            };
          }),
      ),
    )
    .toMatchObject({
      speechPronunciation: 'letters-spaced',
      speechBeforeSquareMs: 140,
      speechGapMs: 60,
      voiceConfidence: 0.35,
    });
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Local recognizer', { exact: true })).toHaveValue('vosk-open');
  await expect(page.getByLabel('Square pronunciation', { exact: true })).toHaveValue(
    'letters-spaced',
  );
  await expect(page.getByLabel('Extra letter–number gap', { exact: true })).toHaveValue('60');
  await expect(page.getByLabel('Extra gap before letter', { exact: true })).toHaveValue('140');
  await page.getByLabel('Square pronunciation', { exact: true }).selectOption('letters');
  await expect(page.getByLabel('Extra gap before letter', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Extra letter–number gap', { exact: true })).toHaveCount(0);
  await page.getByLabel('Square pronunciation', { exact: true }).selectOption('letters-spaced');
  await expect(page.getByLabel('Extra gap before letter', { exact: true })).toHaveValue('140');
  await expect(page.getByLabel('Extra letter–number gap', { exact: true })).toHaveValue('60');
  await expect(page.getByRole('checkbox', { name: /Voice debug mode/ })).not.toBeChecked();
  await expect(page.getByLabel('Minimum Vosk word confidence', { exact: true })).toHaveValue(
    '0.35',
  );
});

test('Whisper pack survives offline reload with its local model and runtime intact', async ({
  page,
  disconnectOrigin,
}) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Local recognizer', { exact: true }).selectOption('whisper');
  await page.getByRole('button', { name: 'Download voice pack', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice pack ready', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await page.reload();
  await disconnectOrigin();
  await page.reload();
  const results = await page.evaluate(async () => {
    const urls = [
      '/models/whisper-tiny.en/config.json',
      '/models/whisper-tiny.en/onnx/encoder_model_quantized.onnx',
      '/models/whisper-tiny.en/onnx/decoder_model_merged_quantized.onnx',
      '/models/whisper-runtime/ort-wasm-simd-threaded.jsep.mjs',
      '/models/whisper-runtime/ort-wasm-simd-threaded.jsep.wasm',
    ];
    return Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url);
        return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
      }),
    );
  });
  expect(results.every((file) => file.ok && file.bytes > 100)).toBe(true);
  if (existsSync('tests/fixtures/last-move.wav')) {
    // Test the actual offline WASM worker in both engines without real mic hardware.
    const workerFile = readdirSync('dist/assets').find((name) =>
      name.startsWith('whisper.worker-'),
    )!;
    const audio = pcmFixture('tests/fixtures/last-move.wav');
    const transcript = await page.evaluate(
      async ({ workerFile, audio }) => {
        const worker = new Worker(`/assets/${workerFile}`, { type: 'module' });
        try {
          return await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('Offline Whisper worker timed out.')),
              60000,
            );
            worker.onmessage = ({ data }) => {
              if (data.type === 'ready') {
                const samples = Float32Array.from(audio.samples);
                worker.postMessage({ type: 'audio', samples, rate: audio.rate }, [samples.buffer]);
              } else if (data.type === 'result') {
                clearTimeout(timer);
                resolve(data.text);
              } else if (data.type === 'error') {
                clearTimeout(timer);
                reject(new Error(data.error));
              }
            };
            worker.onerror = () => {
              clearTimeout(timer);
              reject(new Error('Offline worker failed.'));
            };
            worker.postMessage({ type: 'load' });
          });
        } finally {
          worker.terminate();
        }
      },
      { workerFile, audio },
    );
    expect(
      transcript
        .toLowerCase()
        .replace(/[.,!?]/g, '')
        .trim(),
    ).toBe('apex last move');
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice pack ready', exact: true })).toBeVisible();
});
test('voice pack is cached, verified and available after an offline reload', async ({
  page,
  disconnectOrigin,
}) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Download voice pack', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice pack ready', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await page.reload();
  await disconnectOrigin();
  const bytes = await page.evaluate(async () => {
    const response = await fetch('/models/vosk-en-0.15.tar.gz');
    if (!response.ok) throw new Error('Offline model not found');
    return (await response.arrayBuffer()).byteLength;
  });
  expect(bytes).toBeGreaterThan(39000000);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice pack ready', exact: true })).toBeVisible();
});
