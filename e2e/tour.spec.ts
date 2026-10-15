/**
 * Idle attract tour e2e tests.
 *
 * Use /?debug&tour=1 to force the tour to start after 500ms instead of 8s.
 * On plain /?debug the tour must NOT start (__game.tourState === 'off').
 */
import { expect, test } from '@playwright/test';
import { load, tile } from './helpers';

/** The bedroom's start tile (matches PLAYER_START in grid.ts). */
const START = { x: 7, y: 7 };
/** The PC's footprint (grid.ts): the tour stops on any tile adjacent to it, facing it. */
const PC = { x: 8, y: 2, w: 2, h: 1 };
const atPc = (t: { x: number; y: number }) =>
  (t.y === PC.y + PC.h && t.x >= PC.x && t.x < PC.x + PC.w) ||
  (t.y === PC.y - 1 && t.x >= PC.x && t.x < PC.x + PC.w) ||
  (t.y >= PC.y && t.y < PC.y + PC.h && (t.x === PC.x - 1 || t.x === PC.x + PC.w));
const waitAtPc = (page: import('@playwright/test').Page) =>
  expect.poll(async () => atPc(await tile(page)), { timeout: 15_000, message: 'player should reach a tile next to the PC' }).toBe(true);

const tourState = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window.__game as unknown as { tourState: string }).tourState);

const idleLoc = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid=idle-loc]').innerText();

test('tour: player leaves start tile and reaches PC standing spot', async ({ page }) => {
  await load(page, '&tour=1');
  const t0 = await tile(page);
  expect(t0.x).toBe(START.x);
  expect(t0.y).toBe(START.y);
  expect(await tourState(page)).not.toBe('off');

  // Wait for player to leave start tile
  await expect
    .poll(async () => {
      const t = await tile(page);
      return t.x !== START.x || t.y !== START.y;
    }, { timeout: 10_000, message: 'player should leave the start tile' })
    .toBe(true);

  // Wait until player arrives at PC standing spot
  await waitAtPc(page);
  // No overlay opened
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
});

test('tour: idle line changes at the PC stop and restores on cancel', async ({ page }) => {
  await load(page, '&tour=1');

  // Wait for player to arrive at PC standing spot
  await waitAtPc(page);

  // Tour should now be pausing with the PC narrator line showing
  await expect.poll(() => tourState(page), { timeout: 3_000 }).toBe('pausing');
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText('Ayush checks on his projects.');


  // Press a key to cancel
  await page.keyboard.press('Escape');
  await expect.poll(() => tourState(page), { timeout: 2_000 }).toBe('cancelled');

  // After cancellation the idle loc should revert to the room name
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText("Ayush's room");
});

test('tour: pressing a key cancels — player stops, path is empty, tour is cancelled', async ({ page }) => {
  await load(page, '&tour=1');

  // Wait for player to start moving
  await expect
    .poll(async () => {
      const t = await tile(page);
      return t.x !== START.x || t.y !== START.y || t.m;
    }, { timeout: 10_000 })
    .toBe(true);

  const beforeCancel = await tile(page);
  await page.keyboard.press('Escape');

  // Poll until player is idle
  await expect
    .poll(async () => (await tile(page)).m, { timeout: 5_000 })
    .toBe(false);

  await expect.poll(() => tourState(page), { timeout: 2_000 }).toBe('cancelled');
  const isIdle = await page.evaluate(() => window.__game!.isIdle);
  expect(isIdle).toBe(true);

  const afterCancel = await tile(page);
  expect(atPc(afterCancel)).toBe(false);
  const dist = Math.abs(afterCancel.x - beforeCancel.x) + Math.abs(afterCancel.y - beforeCancel.y);
  expect(dist).toBeLessThanOrEqual(2);

  // After cancel, idle loc should be the room name (not a tour line)
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText("Ayush's room");

  // Further time: tour stays cancelled, player stays put
  await page.waitForTimeout(1500 + 300);
  const later = await tile(page);
  expect(later.x).toBe(afterCancel.x);
  expect(later.y).toBe(afterCancel.y);
  expect(await tourState(page)).toBe('cancelled');
});

test('tour does not start on plain /?debug — tourState is off', async ({ page }) => {
  await load(page);
  expect(await tourState(page)).toBe('off');
  await expect
    .poll(async () => {
      const t = await tile(page);
      return t.x === START.x && t.y === START.y && !t.m;
    }, { timeout: 1_500, intervals: [100] })
    .toBe(true);
  const t = await tile(page);
  expect(t.x).toBe(START.x);
  expect(t.y).toBe(START.y);
  expect(t.m).toBe(false);
});

test('tour: tapping a bag slot mid-tour opens the overlay and cancels the tour', async ({ page }) => {
  await load(page, '&tour=1');
  await expect
    .poll(async () => {
      const t = await tile(page);
      return t.x !== START.x || t.y !== START.y || t.m;
    }, { timeout: 10_000 })
    .toBe(true);

  await page.locator('[data-slot=pc]').dispatchEvent('pointerdown');
  await expect.poll(() => tourState(page), { timeout: 3_000 }).toBe('cancelled');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 15_000 });
});
