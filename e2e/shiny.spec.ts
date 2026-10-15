import { expect, test } from '@playwright/test';
import { dismissAll, load } from './helpers';

test('a plain ?debug load is never shiny; ?shiny=1 spawns the shiny follower with its line', async ({ page }) => {
  await load(page);
  expect(await page.evaluate(() => (window.__game as unknown as { shiny: boolean }).shiny)).toBe(false);
  await expect(page.locator('.world-box')).not.toHaveAttribute('data-shiny', /.+/);

  await load(page, '&shiny=1');
  expect(await page.evaluate(() => (window.__game as unknown as { shiny: boolean }).shiny)).toBe(true);
  await expect(page.locator('.world-box')).toHaveAttribute('data-shiny', /burst|done|yes/);
  // the sparkle burst ends on its own
  await expect(page.locator('.world-box')).toHaveAttribute('data-shiny', 'done', { timeout: 5_000 });
  // the first talk is the shiny line (the follower starts behind the player, facing down -> turn up and press A)
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => ({ f: window.__game!.player.facing, idle: window.__game!.isIdle }))).toEqual({ f: 'up', idle: true });
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=dialogue]')).toContainText('shiny', { timeout: 5_000 });
  await dismissAll(page);
});
