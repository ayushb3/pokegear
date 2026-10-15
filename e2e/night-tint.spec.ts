import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { load, waitTile } from './helpers';

/**
 * The night tint darkens the sprite layer (player, follower) and the foreground, not only the floor (pixel review #1).
 * Reads the brightest pixel in the box the player sprite (32x32 native, bottom-centre on its tile) covers at the start
 * tile (7,7) of the bedroom, which no object or light patch touches. Before the fix the sprite's highlights stayed at
 * full daylight on a dark floor, so the night maximum equalled the day maximum.
 */
const ROOM_X = 16;
const ROOM_Y = 16;
const TILE = 16;

async function brightestInPlayerBox(page: Page, query: string): Promise<number> {
  await load(page, query);
  await waitTile(page, 7, 7);
  const canvas = page.locator('.top-screen canvas').first();
  const png = await canvas.screenshot({ animations: 'disabled' });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const s = info.width / 256; // CSS px per native px (the screenshot is at device scale 1)
  const box = { x: ROOM_X + 7 * TILE - 8, y: ROOM_Y + 8 * TILE - 32, w: 32, h: 32 };
  let max = 0;
  for (let y = Math.round(box.y * s); y < Math.round((box.y + box.h) * s); y++)
    for (let x = Math.round(box.x * s); x < Math.round((box.x + box.w) * s); x++) {
      const i = (y * info.width + x) * info.channels;
      max = Math.max(max, data[i]! + data[i + 1]! + data[i + 2]!);
    }
  return max;
}

test('the player sprite is darker at night than by day', async ({ page }) => {
  const day = await brightestInPlayerBox(page, '&day=1');
  const night = await brightestInPlayerBox(page, '&night=1');
  expect(day).toBeGreaterThan(600); // the sprite has near-white highlights by day
  // the overlay maps white to ~0x6f7486 (sum 361): allow some slack, but nothing may stay at daylight
  expect(night).toBeLessThan(day * 0.7);
});
