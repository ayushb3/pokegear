/**
 * E2E tests: reactive plants (decor that reacts to A / a tap).
 *
 * Facing a plant and pressing A, or tapping its tile (`__game.walkTo` is the programmatic tap),
 * freezes the world, shows an emote, plays a ~900 ms shake (`.world-box[data-anim="x,y"]`, not under
 * reduced motion) and then opens the dialogue. The same plant again shows different lines.
 */
import { expect, test, type Page } from '@playwright/test';
import { advanceDialogue, dismissAll, load, overlayCount, tile, waitRoom, waitTile } from '../helpers';

const dlg = (page: Page) => page.locator('[data-testid=dialogue]');

/** The programmatic equivalent of tapping a tile. */
const tap = (page: Page, x: number, y: number) =>
  page.evaluate(([tx, ty]) => (window.__game as unknown as { walkTo(x: number, y: number): boolean }).walkTo(tx!, ty!), [x, y]);

async function waitFacing(page: Page, dir: string) {
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          f: window.__game!.player.facing,
          m: window.__game!.player.moving,
          idle: window.__game!.isIdle,
        })),
      { timeout: 5_000 },
    )
    .toMatchObject({ f: dir, m: false, idle: true });
}

/** Tap a plant, wait for the dialogue to show. */
async function reactTo(page: Page, x: number, y: number, text: string) {
  await tap(page, x, y);
  await expect(dlg(page)).toContainText(text, { timeout: 20_000 });
}

const ariaLabel = (page: Page) => page.locator('.world-view').first().getAttribute('aria-label');

test.describe('plants: reactive decor', () => {
  test('tapping a plant walks next to it, shakes, then opens the dialogue; B/A closes, player stays put', async ({ page }) => {
    await load(page, '&drop=none'); // plants drop items at random: pin the plain watering
    expect(await ariaLabel(page)).toContain(', and 2 plants.');

    await tap(page, 13, 5);
    // The shake flag shows while the animation plays; tolerate it having already finished.
    await page.waitForFunction(() => {
      const box = document.querySelector('.world-box') as HTMLElement | null;
      return box?.dataset.anim === '13,5' || !!document.querySelector('[data-testid=dialogue]');
    }, undefined, { timeout: 20_000 });
    await expect(dlg(page)).toContainText('Water Gun', { timeout: 10_000 });

    await advanceDialogue(page);
    await expect(page.locator('.world-box')).not.toHaveAttribute('data-anim', /.+/);

    const t = await tile(page);
    expect(Math.abs(t.x - 13) + Math.abs(t.y - 5)).toBe(1);
    const vec: Record<string, [number, number]> = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
    const v = vec[t.f as string]!;
    expect([t.x + v[0], t.y + v[1]]).toEqual([13, 5]);
    expect(t.m).toBe(false);
    expect(t.r).toBe('bedroom');
    expect(await overlayCount(page)).toBe(0);
  });

  test('keyboard: face the plant, press A, B closes on the same tile', async ({ page }) => {
    await load(page, '&drop=none'); // plants drop items at random: pin the plain watering
    await tap(page, 12, 5);
    await waitTile(page, 12, 5);
    await page.keyboard.press('ArrowRight'); // tap: turn only, (13,5) is the plant
    await waitFacing(page, 'right');

    await page.keyboard.press('Space');
    await expect(dlg(page)).toContainText('Water Gun', { timeout: 10_000 });

    await dismissAll(page);
    expect(await tile(page)).toMatchObject({ x: 12, y: 5, f: 'right', m: false, r: 'bedroom' });
  });

  test('the same plant again says it has had enough water; a different plant starts fresh', async ({ page }) => {
    await load(page, '&drop=none'); // plants drop items at random: pin the plain watering
    await reactTo(page, 13, 5, 'Water Gun');
    await dismissAll(page);

    await reactTo(page, 13, 5, 'plenty of water');
    await dismissAll(page);

    await reactTo(page, 0, 9, 'Water Gun'); // the other bedroom plant: first time for THAT plant
    await dismissAll(page);
  });

  test('downstairs plants react too, and both rooms announce 2 plants', async ({ page }) => {
    await load(page, '&drop=none'); // plants drop items at random: pin the plain watering
    expect(await ariaLabel(page)).toContain(', and 2 plants.');

    await page.evaluate(() => window.__game!.goTo('fridge'));
    await waitRoom(page, 'downstairs');
    await expect(dlg(page)).toBeVisible({ timeout: 20_000 });
    await dismissAll(page);
    expect(await ariaLabel(page)).toContain(', and 2 plants.');

    await reactTo(page, 13, 9, 'Water Gun');
    await dismissAll(page);
    expect((await tile(page)).r).toBe('downstairs');
    expect(await ariaLabel(page)).toContain(', and 2 plants.');
  });

  test('plants have no bag slot', async ({ page }) => {
    await load(page, '&drop=none'); // plants drop items at random: pin the plain watering
    const texts = await page.locator('.slot').allInnerTexts();
    const labels = await page.locator('.slot').evaluateAll((els) =>
      els.map((e) => `${e.getAttribute('aria-label') ?? ''} ${(e as HTMLElement).dataset.slot ?? ''}`),
    );
    for (const s of [...texts, ...labels]) expect(s).not.toMatch(/plant/i);
  });

  test('reduced motion: the dialogue opens with no shake animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await load(page, '&drop=none'); // plants drop items at random: pin the plain watering

    await tap(page, 13, 5);
    await expect(dlg(page)).toContainText('Water Gun', { timeout: 20_000 });
    const anim = await page.evaluate(() => (document.querySelector('.world-box') as HTMLElement | null)?.dataset.anim);
    expect(anim).toBeUndefined();
    await dismissAll(page);
  });
});

/**
 * Tap the dialogue forward one line at a time until it shows `text`. A tap only counts once the current line is fully typed
 * (the ▼ is on), and the next one waits for the text to change, so a slow machine can never skip past the wanted line.
 */
async function advanceTo(page: Page, text: string) {
  const read = () => dlg(page).innerText({ timeout: 2_000 }).catch(() => '');
  for (let i = 0; i < 12; i++) {
    await dlg(page).locator('.more.on').waitFor({ state: 'attached', timeout: 5_000 }); // the current line is fully typed
    const now = await read();
    if (now.includes(text)) return;
    await dlg(page).dispatchEvent('pointerdown');
    await expect.poll(read, { timeout: 5_000 }).not.toBe(now);
  }
  await expect(dlg(page)).toContainText(text);
}
const dropSlot = (page: Page) => page.evaluate(() => (document.querySelector('.world-box') as HTMLElement | null)?.dataset.drop ?? null);

test.describe('plants: item drops (?debug&drop=<id|none> forces the roll)', () => {
  for (const [id, line] of [
    ['oran-berry', 'Oran Berry'],
    ['pecha-berry', 'Pecha Berry'],
    ['cheri-berry', 'Cheri Berry'],
    ['medal', 'gymnastics medals'],
    ['labubu', 'Labubu'],
    ['jellycat', 'Jellycat'],
  ] as const) {
    test(`forced ${id}: the item is up during the dialogue, then it clears`, async ({ page }) => {
      await load(page, `&drop=${id}`);
      await tap(page, 13, 5);
      await expect(dlg(page)).toContainText('Water Gun', { timeout: 20_000 });
      expect(await dropSlot(page)).toBe(`item.${id}`);
      await advanceTo(page, 'Something fell out of the plant!');
      await advanceTo(page, line);
      expect(await dropSlot(page)).toBe(`item.${id}`); // still up on the last line
      await dismissAll(page);
      await expect.poll(() => dropSlot(page), { timeout: 5_000 }).toBeNull(); // faded and removed once the world resumed
      const t = await tile(page);
      expect(t.m).toBe(false);
    });
  }

  test('forced no-drop: the plain watering, and nothing is ever shown', async ({ page }) => {
    await load(page, '&drop=none');
    await tap(page, 13, 5);
    await expect(dlg(page)).toContainText('Water Gun', { timeout: 20_000 });
    await advanceTo(page, 'perks up');
    expect(await dropSlot(page)).toBeNull();
    await expect(dlg(page)).not.toContainText('fell out');
    await dismissAll(page);
    expect(await dropSlot(page)).toBeNull();
  });

  test('the override only works with ?debug', async ({ page }) => {
    await page.goto('/?drop=medal'); // no ?debug: a shared link cannot rig the plants (random roll; just check no crash + override ignored)
    await page.locator('canvas').waitFor();
    // dropOverride() is unit-tested; here we only assert the page loads and exposes no debug handle
    expect(await page.evaluate(() => !!window.__game)).toBe(false);
  });

  test('reduced motion: the item is a still sprite beside the dialogue', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await load(page, '&drop=labubu');
    await tap(page, 13, 5);
    await expect(dlg(page)).toContainText('Water Gun', { timeout: 20_000 });
    expect(await dropSlot(page)).toBe('item.labubu');
    expect(await page.evaluate(() => (document.querySelector('.world-box') as HTMLElement | null)?.dataset.anim)).toBeUndefined();
    await dismissAll(page);
    await expect.poll(() => dropSlot(page), { timeout: 5_000 }).toBeNull();
  });
});

