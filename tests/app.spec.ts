import { test, expect } from './fixtures';

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
