import { expect, test } from '@playwright/test';
import { advanceDialogue, dismissAll, load, tile, waitRoom, waitTile } from './helpers';

/** Walk to (x, y) with the debug API, then do the last stretch with real key presses. */
async function walkTo(page: import('@playwright/test').Page, x: number, y: number) {
  await page.evaluate(([tx, ty]) => (window.__game as unknown as { walkTo(x: number, y: number): boolean }).walkTo(tx!, ty!), [x, y]);
  await waitTile(page, x, y);
}

test('stairs: down with the keyboard, the location and bag follow, back up lands on (2,8)', async ({ page }) => {
  await load(page);
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText("Ayush's room");
  await expect(page.locator('.idle-box .slot')).toHaveCount(7);

  await walkTo(page, 2, 8);
  await page.keyboard.down('ArrowDown'); // (2,9) is the stairs
  await waitRoom(page, 'downstairs');
  await page.keyboard.up('ArrowDown');
  await expect.poll(() => tile(page)).toMatchObject({ x: 12, y: 3, f: 'down', m: false, r: 'downstairs' });

  await expect(page.locator('[data-testid=idle-loc]')).toHaveText('Downstairs');
  await expect(page.locator('.idle-box .slot')).toHaveCount(5); // fridge, tv, corkboard, mom, gym (the Card is a pad button)
  await expect(page.locator('.idle-box .slot')).toHaveText(['', '', '', '', '']); // icons, not text
  expect(await page.locator('.idle-box .slot').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slot))).toEqual(['fridge', 'tv', 'corkboard', 'mom', 'gym']);
  await expect(page.locator('.top-screen [role=img]')).toHaveAttribute('aria-label', /kitchen.*fridge.*tv.*photos.*mom.*gym/i);

  await page.keyboard.down('ArrowUp'); // (12,2) is the stairs up
  await waitRoom(page, 'bedroom');
  await page.keyboard.up('ArrowUp');
  await expect.poll(() => tile(page)).toMatchObject({ x: 2, y: 8, f: 'up', m: false, r: 'bedroom' });
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText("Ayush's room");
  await expect(page.locator('.idle-box .slot')).toHaveCount(7);
  await expect(page.locator('.top-screen [role=img]')).toHaveAttribute('aria-label', /bed.*pc.*piano/i);
});

test('a bag slot downstairs walks to its object; from the bedroom the bag has no downstairs slots', async ({ page }) => {
  await load(page);
  await expect(page.locator('[data-slot=fridge]')).toHaveCount(0);
  await page.evaluate(() => window.__game!.goTo('mom')); // across rooms: stairs first
  await waitRoom(page, 'downstairs');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await dismissAll(page);
  await expect(page.locator('.idle-box .slot')).toHaveCount(5);
  await page.locator('[data-slot=fridge]').focus();
  await expect(page.locator('[data-testid=idle-desc]')).toHaveText('Fridge: food and ideas (sample)');
  await page.locator('[data-slot=fridge]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Space'); // finish typing
  await page.keyboard.press('Space'); // last line closes the dialogue
  await expect(page.locator('[data-testid=dialogue]')).toHaveCount(0);
  await dismissAll(page);
});

test('an overlay opened during the stairs fade does not strand the player on the stairs', async ({ page }) => {
  await load(page);
  await walkTo(page, 2, 8);
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => (window.__game as unknown as { isWarping: boolean }).isWarping);
  await page.keyboard.up('ArrowDown');
  await page.locator('[data-testid=start]').dispatchEvent('pointerdown'); // freezes mid-fade
  await waitRoom(page, 'downstairs');
  await dismissAll(page);
  expect(await tile(page)).toMatchObject({ x: 12, y: 3, r: 'downstairs' });
});

test('corkboard: photo board overlay opens, B closes', async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('corkboard'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  const at = await tile(page);
  expect(at).toMatchObject({ r: 'downstairs', f: 'up' });
  await advanceDialogue(page);
  const board = page.locator('[data-testid=corkboard]');
  await expect(board).toBeVisible();
  await expect(board.locator('[data-testid=photo-filter-label]')).toHaveText(/^ALL \d+$/); // the h2 is the place filter bar
  await expect(board.locator('[data-testid=photo-frame-0]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  expect(await tile(page)).toEqual(at);
});
