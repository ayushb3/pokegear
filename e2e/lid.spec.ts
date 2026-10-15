import { expect, test, type Page } from '@playwright/test';
import { load, tile } from './helpers';

/** Pretend the tab went to the background / came back (Playwright cannot hide a page for real). */
const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    if (h) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    else delete (document as unknown as { visibilityState?: string }).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

test('the lid closes when the tab is hidden (world frozen) and opens when it is back', async ({ page }) => {
  await load(page);
  const lid = page.locator('[data-testid=lid]');
  await expect(lid).not.toHaveAttribute('data-closed', /.*/);
  const before = await tile(page);
  await setHidden(page, true);
  await expect(lid).toHaveAttribute('data-closed', '');
  // frozen: a key press moves nothing
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  expect(await tile(page)).toEqual(before);
  await expect.poll(() => page.evaluate(() => (window.__game as unknown as { isFrozen: boolean }).isFrozen)).toBe(true);
  await setHidden(page, false);
  await expect(lid).not.toHaveAttribute('data-closed', /.*/);
  await expect.poll(() => page.evaluate(() => (window.__game as unknown as { isFrozen: boolean }).isFrozen)).toBe(false);
  // live again
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await tile(page)).x).toBeGreaterThan(before.x);
});

test('the lid never releases a freeze it did not place (an overlay stays frozen)', async ({ page }) => {
  await load(page);
  await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=start-menu]')).toBeVisible();
  await setHidden(page, true);
  await setHidden(page, false);
  expect(await page.evaluate(() => (window.__game as unknown as { isFrozen: boolean }).isFrozen)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  expect(await page.evaluate(() => (window.__game as unknown as { isFrozen: boolean }).isFrozen)).toBe(false);
});
