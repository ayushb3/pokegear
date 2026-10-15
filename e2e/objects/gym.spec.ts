import { expect, test } from '@playwright/test';
import { dismissAll, load, tile, waitRoom } from '../helpers';

const dialogue = (page: import('@playwright/test').Page) => page.locator('[data-testid=dialogue]');
const animating = (page: import('@playwright/test').Page) => page.evaluate(() => document.querySelector('.world-box')?.getAttribute('data-anim'));

test('object gym: rep animation plays, then the line shows, B closes on the same tile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await load(page);
  await page.evaluate(() => window.__game!.goTo('gym')); // the bench is downstairs: down the stairs first
  await waitRoom(page, 'downstairs');
  // the animation runs first: marker is set and no dialogue yet
  await expect.poll(() => animating(page), { timeout: 20_000 }).toBe('gym');
  await expect(dialogue(page)).toHaveCount(0);
  // then the dialogue opens and the marker clears
  await expect(dialogue(page)).toBeVisible({ timeout: 5_000 });
  expect(await animating(page)).toBeNull();
  const opened = await tile(page);
  expect(opened).toMatchObject({ r: 'downstairs', y: 8 });
  await expect(dialogue(page)).toContainText('Ayush did a few reps.');
  await page.keyboard.press('Space'); // finish typing
  await page.keyboard.press('Space'); // next line
  await expect(dialogue(page)).toContainText('Currently training');
  await dismissAll(page);
  expect(await tile(page)).toEqual(opened);
});

test('object gym: prefers-reduced-motion skips the animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  await page.evaluate(() => {
    const box = document.querySelector('.world-box')!;
    (window as unknown as { __seen: boolean }).__seen = false;
    new MutationObserver(() => {
      if (box.hasAttribute('data-anim')) (window as unknown as { __seen: boolean }).__seen = true;
    }).observe(box, { attributes: true });
  });
  await page.evaluate(() => window.__game!.goTo('gym'));
  await expect(dialogue(page)).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as { __seen: boolean }).__seen)).toBe(false);
  await dismissAll(page);
});
