import { expect, test } from '@playwright/test';
import { advanceDialogue, dismissAll, load } from './helpers';

test('sound is off by default, the toggle persists, and the piano shows the muted note', async ({ page }) => {
  await load(page);
  const toggle = page.locator('[data-testid=sound]');
  await expect(toggle).toHaveAttribute('aria-label', 'Sound');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => window.__game!.goTo('piano'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await advanceDialogue(page);
  // P3 (fix/overlay-fit) shortened the visible hint to "Sound off"; the accessible name keeps the full sentence
  const muted = page.locator('[data-testid=piano-muted]');
  await expect(muted).toContainText('Sound off');
  await expect(muted).toHaveAttribute('aria-label', /Sound is off/);
  await dismissAll(page);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('portfolio.sound'))).toBe('on');
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('[data-testid=sound]')).toHaveAttribute('aria-pressed', 'true');
});
