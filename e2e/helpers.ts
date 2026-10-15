import { expect, type Page } from '@playwright/test';

type G = { room: string; player: { x: number; y: number; facing: string; moving: boolean }; follower: { x: number; y: number; facing: string; moving: boolean }; goTo(id: string): boolean; interactFollower(): boolean; isIdle: boolean; tourState: string };
declare global {
  interface Window {
    __game?: G;
    __focus?: Element | null;
  }
}

export const tile = (page: Page) =>
  page.evaluate(() => ({ x: window.__game!.player.x, y: window.__game!.player.y, f: window.__game!.player.facing, m: window.__game!.player.moving, r: window.__game!.room }));
export const overlayCount = (page: Page) => page.locator('.bottom-screen .overlay').count();

export async function load(page: Page, query = '') {
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => !!window.__game);
  await page.locator('canvas').waitFor();
}

/** press A until the dialogue box is gone (first press completes the typing, next advances) */
export async function advanceDialogue(page: Page) {
  for (let i = 0; i < 10 && (await page.locator('[data-testid=dialogue]').count()) > 0; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
  }
  await expect(page.locator('[data-testid=dialogue]')).toHaveCount(0);
}

/** press B (and A to finish dialogue lines) until no overlay is left */
export async function dismissAll(page: Page) {
  for (let i = 0; i < 12 && (await overlayCount(page)) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
  await expect.poll(() => overlayCount(page), { timeout: 5000 }).toBe(0);
}


/** Poll until the player is in `room` (the stairs fade for ~0.7 s). Never sleep: poll `__game.room`. */
export async function waitRoom(page: Page, room: string) {
  await expect.poll(() => page.evaluate(() => window.__game!.room), { timeout: 15_000 }).toBe(room);
}
/** Poll until the player stands still on (x, y). */
export async function waitTile(page: Page, x: number, y: number) {
  await expect.poll(async () => {
    const t = await tile(page);
    return t.m ? null : `${t.x},${t.y}`;
  }, { timeout: 15_000 }).toBe(`${x},${y}`);
}
