import { expect, test, type Page } from '@playwright/test';
import battleData from '../src/content/battle.json' with { type: 'json' };
import { advanceDialogue, dismissAll, load, tile, waitRoom, waitTile } from './helpers';

const walkTo = async (page: Page, x: number, y: number) => {
  await page.evaluate(([tx, ty]) => (window.__game as unknown as { walkTo(x: number, y: number): boolean }).walkTo(tx!, ty!), [x, y]);
};

/** The battle text box: press A through the current text run (keyed by its first line) until the screen moves on. */
async function readThrough(page: Page, expectFirstLine: RegExp) {
  const b = page.locator('[data-testid=battle]');
  await expect(b).toHaveAttribute('data-text', expectFirstLine);
  const t = (await b.getAttribute('data-text')) as string;
  for (let i = 0; i < 12; i++) {
    if ((await b.count()) === 0 || (await b.getAttribute('data-text')) !== t) return; // moved on (or the battle closed)
    await page.keyboard.press('Space');
    await page.waitForTimeout(60);
  }
  await expect(b).not.toHaveAttribute('data-text', t);
}

test('the front door: down from the bedroom, out the mat, the yard, and back in', async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('mailbox')); // two hops: stairs, then the door
  await waitRoom(page, 'downstairs');
  await waitRoom(page, 'yard');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await advanceDialogue(page);
  const box = page.locator('[data-testid=mailbox]');
  await expect(box).toBeVisible();
  await expect(box.locator('.sl-row').first()).toContainText('Email');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText('Front yard');
  expect(await page.locator('.idle-box .slot').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slot))).toEqual(['mailbox', 'sign']); // the Card is a pad button (#61)
  await expect(page.locator('.top-screen [role=img]')).toHaveAttribute('aria-label', /front yard.*mailbox.*sign/i);
  // the mat below the door takes you back inside, landing below the mat downstairs
  await walkTo(page, 6, 3);
  await waitTile(page, 6, 3);
  await page.keyboard.down('ArrowUp');
  await waitRoom(page, 'downstairs');
  await page.keyboard.up('ArrowUp');
  await expect.poll(() => tile(page)).toMatchObject({ x: 6, y: 8, f: 'up', m: false, r: 'downstairs' });
});

test('the sign is the hint', async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('sign'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid=live]')).toContainText("Ayush's house");
  await page.keyboard.press('Space'); // finish the line
  await page.keyboard.press('Space'); // the second line
  await expect(page.locator('[data-testid=live]')).toContainText('tall grass', { timeout: 5_000 });
  await dismissAll(page);
});

test('tall grass: a wild RECRUITER appears; every move is a résumé line; winning leads to the links; the yard comes back', async ({ page }) => {
  test.setTimeout(120_000); // two room hops, a wipe and a full four-move battle: ~60 s on a CI runner
  await load(page);
  await page.evaluate(() => window.__game!.goTo('sign'));
  await waitRoom(page, 'downstairs'); // two hops: each leg gets its own budget (CI runners are slow)
  await waitRoom(page, 'yard');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 30_000 });
  await dismissAll(page);
  // into the right-hand grass, then across it: every shortest path from (9,4) to (13,9) stays in the grass, and under
  // ?debug the encounter fires on exactly the 6th grass step
  await walkTo(page, 9, 4);
  await waitTile(page, 9, 4);
  await walkTo(page, 13, 9);
  const battle = page.locator('[data-testid=battle]');
  await expect(battle).toBeVisible({ timeout: 20_000 });
  const at = await tile(page);
  expect(at.r).toBe('yard');
  expect(at.m).toBe(false);
  // the wipe (about a second), then the scene on the top screen and the first line
  const scene = page.locator('.top-screen [data-testid=battle-scene]');
  await expect(scene).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid=live]')).toContainText('A wild RECRUITER appeared!');
  await expect(scene).toHaveAttribute('data-enemy-hp', '100');
  await readThrough(page, /appeared/);
  await expect(battle).toHaveAttribute('data-screen', 'menu');
  await expect(page.locator('[data-testid=lbl-b]')).toHaveText('Run');
  // B at the menu is RUN: never strands the player
  // (checked in a separate test below); here: FIGHT, all four moves
  for (let i = 0; i < 4; i++) {
    await expect(battle).toHaveAttribute('data-screen', 'menu');
    await page.keyboard.press('Space'); // FIGHT
    await expect(battle).toHaveAttribute('data-screen', 'moves');
    await expect(page.locator('[data-testid=battle-move-info]')).toContainText('PP');
    await page.locator(`[data-testid=battle-move-${i}]`).dispatchEvent('pointerdown');
    await expect(page.locator('[data-testid=live]')).toContainText(battleData.moves[i]!.text.slice(0, 24)); // the move's own line
    await expect(scene).toHaveAttribute('data-enemy-hp', String(100 - 25 * (i + 1)));
    await readThrough(page, /^OSHAWOTT used/);
    if (i < 3) {
      await expect(page.locator('[data-testid=live]')).toContainText('RECRUITER used');
      await readThrough(page, /^RECRUITER used/); // the recruiter's turn
    }
  }
  await expect(scene).toHaveAttribute('data-enemy-hp', '0');
  await expect(scene).toHaveAttribute('data-player-hp', '64');
  await expect(page.locator('[data-testid=live]')).toContainText('wants to connect');
  await readThrough(page, /wants to connect/);
  await expect(battle).toHaveAttribute('data-screen', 'links');
  await expect(battle.locator('.sl-row').first()).toContainText('LinkedIn');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  await expect(page.locator('.top-screen [data-testid=battle-scene]')).toHaveCount(0);
  // same tile, the world is live again (the encounter hold is released)
  expect(await tile(page)).toEqual(at);
  await expect.poll(() => page.evaluate(() => (window.__game as unknown as { isInEncounter: boolean }).isInEncounter)).toBe(false);
  await walkTo(page, 6, 5); // out of the grass, onto the path
  await waitTile(page, 6, 5);
});

test('a spent move has no PP; RUN leaves the battle at once', async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('sign'));
  await waitRoom(page, 'downstairs'); // two hops: each leg gets its own budget (CI runners are slow)
  await waitRoom(page, 'yard');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 30_000 });
  await dismissAll(page);
  await walkTo(page, 4, 4); // the left-hand grass, then across it
  await waitTile(page, 4, 4);
  await walkTo(page, 0, 9);
  const battle = page.locator('[data-testid=battle]');
  await expect(battle).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.top-screen [data-testid=battle-scene]')).toBeVisible({ timeout: 10_000 });
  await readThrough(page, /appeared/);
  await page.keyboard.press('Space'); // FIGHT
  await expect(battle).toHaveAttribute('data-screen', 'moves');
  await page.keyboard.press('Space'); // move 0
  await readThrough(page, /^OSHAWOTT used/);
  await readThrough(page, /^RECRUITER used/);
  await page.keyboard.press('Space'); // FIGHT
  await expect(page.locator('[data-testid=battle-move-0]')).toHaveAttribute('data-spent', '');
  await expect(page.locator('[data-testid=battle-move-info]')).toContainText('PP 0/1');
  await page.keyboard.press('Space'); // the spent move
  await expect(page.locator('[data-testid=live]')).toContainText('no PP left');
  await readThrough(page, /no PP left/);
  await expect(battle).toHaveAttribute('data-screen', 'moves');
  await page.keyboard.press('Escape'); // back to the menu
  await expect(battle).toHaveAttribute('data-screen', 'menu');
  await page.keyboard.press('Escape'); // B at the menu = RUN
  await expect(page.locator('[data-testid=live]')).toContainText('Got away safely!');
  await readThrough(page, /Got away/);
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  expect((await tile(page)).r).toBe('yard');
});

test('the résumé opens nowhere before the final links screen (the bag only plays a turn)', async ({ page }) => {
  await load(page);
  // record every window.open and every request for the PDF
  await page.evaluate(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = (url?: string | URL) => {
      w.__opened.push(String(url));
      return null;
    };
  });
  const pdfRequests: string[] = [];
  page.on('request', (r) => r.url().includes('/resume.pdf') && pdfRequests.push(r.url()));
  const opened = () => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  await page.evaluate(() => window.__game!.goTo('sign'));
  await waitRoom(page, 'downstairs');
  await waitRoom(page, 'yard');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 30_000 });
  await dismissAll(page);
  await walkTo(page, 4, 4);
  await waitTile(page, 4, 4);
  await walkTo(page, 0, 9);
  const battle = page.locator('[data-testid=battle]');
  await expect(battle).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.top-screen [data-testid=battle-scene]')).toBeVisible({ timeout: 10_000 });
  await readThrough(page, /appeared/);
  // BAG > RÉSUMÉ ×1: costs a turn, opens nothing
  await page.locator('[data-testid=battle-menu-1]').dispatchEvent('pointerdown');
  await expect(battle).toHaveAttribute('data-screen', 'bag');
  await page.keyboard.press('Space');
  await readThrough(page, /handed over/);
  await readThrough(page, /^RECRUITER used/);
  expect(await opened()).toEqual([]);
  // the count is real: back in the bag the résumé is ×0 and greyed, and a second use is refused without a turn
  const hp = await page.locator('.top-screen [data-testid=battle-scene]').getAttribute('data-player-hp');
  await page.locator('[data-testid=battle-menu-1]').dispatchEvent('pointerdown');
  await expect(battle).toHaveAttribute('data-screen', 'bag');
  const item = page.locator('[data-testid=battle-bag-0]');
  await expect(item).toHaveText('RÉSUMÉ ×0');
  await expect(item).toHaveAttribute('data-spent', '');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=live]')).toContainText('There are no RÉSUMÉS left!');
  await readThrough(page, /no RÉSUMÉS left/);
  await expect(battle).toHaveAttribute('data-screen', 'bag'); // straight back to the bag: no recruiter turn
  await expect(page.locator('.top-screen [data-testid=battle-scene]')).toHaveAttribute('data-player-hp', hp!);
  await page.keyboard.press('Escape');
  expect(await opened()).toEqual([]);
  // all four moves
  for (let i = 0; i < 4; i++) {
    await expect(battle).toHaveAttribute('data-screen', 'menu');
    await page.keyboard.press('Space');
    await page.locator(`[data-testid=battle-move-${i}]`).dispatchEvent('pointerdown');
    await readThrough(page, /^OSHAWOTT used/);
    if (i < 3) await readThrough(page, /^RECRUITER used/);
    expect(await opened()).toEqual([]);
  }
  await readThrough(page, /wants to connect/);
  await expect(battle).toHaveAttribute('data-screen', 'links');
  // the final screen: still nothing opened until the visitor picks the link
  expect(await opened()).toEqual([]);
  expect(pdfRequests).toEqual([]);
  await page.keyboard.press('ArrowDown'); // LinkedIn -> Résumé
  await page.keyboard.press('Space');
  expect(await opened()).toEqual(['/resume.pdf']);
});

test('tall grass rustles when stepped into and hides the legs while standing in it', async ({ page }) => {
  type Grass = { rustling: { x: number; y: number; frame: number }[]; tips: { x: number; y: number }[] };
  const grass = () => page.evaluate(() => (window.__game as unknown as { grass: Grass }).grass);
  await load(page);
  await page.evaluate(() => window.__game!.goTo('sign'));
  await waitRoom(page, 'downstairs');
  await waitRoom(page, 'yard');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 30_000 });
  await dismissAll(page);
  await walkTo(page, 5, 5); // the lawn beside the left patch
  await waitTile(page, 5, 5);
  await expect.poll(async () => (await grass()).rustling).toEqual([]);
  await walkTo(page, 4, 5); // one step into the grass (the encounter only fires on the 6th under ?debug)
  // the tile rustles as the step begins, through frames 1..3, then rests
  await expect.poll(async () => (await grass()).rustling.map((r) => `${r.x},${r.y}`), { intervals: [16] }).toContain('4,5');
  await waitTile(page, 4, 5);
  await expect.poll(async () => (await grass()).rustling, { timeout: 2_000 }).toEqual([]);
  // standing in it: the blade tips cover the player's legs on that tile (and nowhere else the player is)
  expect((await grass()).tips).toContainEqual({ x: 4, y: 5 });
  // two steps back out onto the lawn (the follower trails one tile behind): nobody is in the grass, no tips drawn
  await walkTo(page, 6, 5);
  await waitTile(page, 6, 5);
  await expect.poll(async () => (await grass()).tips).toEqual([]);
});
