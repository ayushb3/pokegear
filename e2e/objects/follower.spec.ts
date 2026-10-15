/**
 * E2E tests: follower talk interaction.
 *
 * The follower (Oshawott) is interactable when the player is adjacent and facing it.
 * Pressing A or tapping the follower's tile opens a one-line dialogue in the bottom screen.
 * The emote is shown above the follower (world side — we verify the dialogue, not the Pixi canvas).
 * After B the dialogue closes, player and follower positions are unchanged.
 */
import { expect, test } from '@playwright/test';
import { dismissAll, load, tile } from '../helpers';

/** dialogue locator */
const dlg = (page: import('@playwright/test').Page) => page.locator('[data-testid=dialogue]');

/** follower tile from __game */
const followerTile = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({ x: window.__game!.follower.x, y: window.__game!.follower.y }));

/** Poll until the player is facing `dir`, not moving, and fully idle (no turn animation). */
async function waitFacing(page: import('@playwright/test').Page, dir: string) {
  await expect.poll(
    () => page.evaluate(() => ({
      f: window.__game!.player.facing,
      m: window.__game!.player.moving,
      idle: window.__game!.isIdle,
    })),
    { timeout: 3_000 },
  ).toMatchObject({ f: dir, m: false, idle: true });
}

/**
 * Face the player toward the follower by pressing the appropriate direction key
 * (tap = press then release = turn only), then poll until the turn is done.
 */
async function faceFollower(page: import('@playwright/test').Page) {
  const p = await tile(page);
  const f = await followerTile(page);
  let dir = 'down';
  let key = 'ArrowDown';
  if (f.y < p.y) { dir = 'up'; key = 'ArrowUp'; }
  else if (f.y > p.y) { dir = 'down'; key = 'ArrowDown'; }
  else if (f.x < p.x) { dir = 'left'; key = 'ArrowLeft'; }
  else { dir = 'right'; key = 'ArrowRight'; }
  await page.keyboard.press(key); // tap: turns, does not step
  await waitFacing(page, dir);
}

test('follower talk: face follower, press A → dialogue with a follower line, B closes, same tile', async ({ page }) => {
  await load(page);

  const before = await tile(page);
  const fBefore = await followerTile(page);

  await faceFollower(page);

  // Press A (Space) to talk to the follower
  await page.keyboard.press('Space');
  // Wait for dialogue with Oshawott text (typewriter fills in)
  await expect(dlg(page)).toContainText('Oshawott', { timeout: 5_000 });

  // Player position unchanged while dialogue is open
  const during = await tile(page);
  expect(during).toMatchObject({ x: before.x, y: before.y });

  // B closes the dialogue (first press may finish typing, second closes)
  await dismissAll(page);

  // Player and follower positions unchanged after closing
  const after = await tile(page);
  expect(after).toMatchObject({ x: before.x, y: before.y });
  const fAfter = await followerTile(page);
  expect(fAfter).toEqual(fBefore);
});

test('follower talk: tapping the follower tile (interactFollower) opens dialogue', async ({ page }) => {
  await load(page);

  const before = await tile(page);
  const f = await followerTile(page);

  // Face the follower first so interactFollower() succeeds (requires adjacency)
  await faceFollower(page);

  // Drive via __game.interactFollower() — equivalent to tapping the follower sprite on the canvas
  await page.evaluate(() => window.__game!.interactFollower());
  await expect(dlg(page)).toContainText('Oshawott', { timeout: 5_000 });

  // Player position unchanged
  expect(await tile(page)).toMatchObject({ x: before.x, y: before.y });

  // B closes
  await dismissAll(page);

  // Follower position unchanged
  const fAfter = await followerTile(page);
  expect(fAfter).toMatchObject({ x: f.x, y: f.y });
});

test('follower talk: B closes dialogue, world resumes (player can walk after)', async ({ page }) => {
  await load(page);
  await faceFollower(page);
  await page.keyboard.press('Space'); // open dialogue
  await expect(dlg(page)).toContainText('Oshawott', { timeout: 5_000 });
  // B closes the dialogue (first press may finish typing, second closes)
  await dismissAll(page);
  // Poll until the player faces right after pressing ArrowRight
  await page.keyboard.press('ArrowRight');
  await waitFacing(page, 'right');
});

test('follower talk: tapping follower tile while busy/frozen does nothing (never walkTo onto follower)', async ({ page }) => {
  await load(page);
  // Open the bed dialogue to freeze the world
  await page.evaluate(() => window.__game!.goTo('bed'));
  await expect(dlg(page)).toBeVisible({ timeout: 20_000 });
  const frozen = await tile(page);
  const fFrozen = await followerTile(page);

  // Simulate a canvas tap on the follower's tile while the world is frozen.
  // interactFollower returns false (frozen), and since render.ts returns unconditionally,
  // no walkTo happens. The player should stay on the same tile.
  const ok = await page.evaluate(() => window.__game!.interactFollower());
  expect(ok).toBe(false);

  // No second dialogue (the bed dialogue is still there)
  const count = await dlg(page).count();
  expect(count).toBe(1);

  // Player and follower haven't moved
  const pNow = await tile(page);
  const fNow = await followerTile(page);
  expect(pNow).toMatchObject({ x: frozen.x, y: frozen.y });
  expect(fNow).toEqual(fFrozen);

  await dismissAll(page);
});
