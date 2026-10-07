import { test, expect, type Page } from '@playwright/test';

async function move(page: Page, text: string) {
  await page.getByLabel('Type a command').fill(text);
  await page.getByRole('button', { name: 'Run command', exact: true }).click();
}
async function login(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.getByLabel('Password', { exact: true }).fill('test-password-123');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('History sync')).toContainText('History synced');
}
test('guest isolation, two-device account history, offline reload/upload, deletion and logout', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const page = await first.newPage();
  const other = await second.newPage();
  const suffix = Date.now().toString(36);
  const email = `player-${suffix}@example.com`;
  try {
    await page.goto('/');
    await move(page, 'move pawn a2 a3'); // Guest history must not enter the new account.
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create an account', exact: true }).click();
    await dialog.getByLabel('Email', { exact: true }).fill(email);
    await dialog.getByLabel('Public username').fill(`player_${suffix}`);
    await dialog.getByLabel('Password', { exact: true }).fill('test-password-123');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.count-pill')).toHaveText('0');
    await move(page, 'move pawn e2 e4');
    await expect(page.getByLabel('History sync')).toContainText('History synced');
    await other.goto('/');
    await login(other, email);
    await other.getByRole('button', { name: 'My games', exact: true }).click();
    await expect(other.locator('.saved-game')).toHaveCount(1);
    await other.getByRole('button', { name: 'Review', exact: true }).click();
    await move(other, 'resume game');
    await move(other, 'move pawn e7 e5');
    await expect(page.locator('.count-pill')).toHaveText('2');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
    await first.setOffline(true);
    await page.reload();
    await expect(page.locator('.count-pill')).toHaveText('2');
    await move(page, 'move knight g1 f3');
    await expect(page.getByLabel('History sync')).toContainText('waiting to sync');
    await page.reload();
    await expect(page.locator('.count-pill')).toHaveText('3');
    await first.setOffline(false);
    await expect(page.getByLabel('History sync')).toContainText('History synced');
    await expect(other.locator('.count-pill')).toHaveText('3');
    await page.getByRole('button', { name: 'My games', exact: true }).click();
    await page.getByRole('button', { name: 'Delete game', exact: true }).click();
    await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expect(other.locator('.count-pill')).toHaveText('0');
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByLabel('History sync')).toHaveCount(0);
    await expect(page.locator('.count-pill')).toHaveText('1'); // Original guest game, not the account game.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await first.close();
    await second.close();
  }
});
