import { expect, test } from '@playwright/test';
import { advanceDialogue, dismissAll, overlayCount, tile } from './helpers';

const LINKS = ['townmap', 'piano', 'journal', 'monitor', 'radio', 'phone', 'photos', 'food'];

for (const value of LINKS) {
  test(`?open=${value} opens its overlay over the room, the URL stays, B closes and the URL becomes /`, async ({ page }) => {
    await page.goto(`/?debug&open=${value}`);
    await page.waitForFunction(() => !!window.__game);
    await expect.poll(() => overlayCount(page)).toBe(1);
    await expect(page.locator('.title-top')).toHaveCount(0); // a deep link never shows the title
    expect(new URL(page.url()).searchParams.get('open')).toBe(value);
    const t0 = await tile(page);
    await dismissAll(page);
    expect(new URL(page.url()).searchParams.has('open')).toBe(false);
    expect(new URL(page.url()).searchParams.has('debug')).toBe(true); // other params survive
    expect(await tile(page)).toEqual(t0); // the player never moved
    await expect(page.locator('.idle-box .slot').first()).toBeVisible();
  });
}

test('an unknown ?open= value loads the plain room, untouched', async ({ page }) => {
  await page.goto('/?debug&open=nope');
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('.idle-box .slot').first()).toBeVisible();
  expect(await overlayCount(page)).toBe(0);
});

test('opening an object overlay from the room also reflects it in the URL, and closing clears it', async ({ page }) => {
  await page.goto('/?debug');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game!.goTo('townmap'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await advanceDialogue(page); // the narrator line, then the Town Map opens
  await expect.poll(() => new URL(page.url()).searchParams.get('open')).toBe('townmap');
  await dismissAll(page);
  expect(new URL(page.url()).searchParams.has('open')).toBe(false);
});

test('Town Map -> Photos -> B -> B: the URL goes townmap -> photos -> townmap -> /', async ({ page }) => {
  await page.goto('/?debug&open=townmap');
  await page.waitForFunction(() => !!window.__game);
  const open = () => new URL(page.url()).searchParams.get('open');
  await expect.poll(open).toBe('townmap');
  // pick a place with photos: down until A reads Photos
  const a = page.locator('[data-testid=lbl-a]');
  for (let i = 0; i < 40 && (await a.textContent()) !== 'Photos'; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
  }
  await expect(a).toHaveText('Photos');
  await page.keyboard.press('Space');
  await expect.poll(open).toBe('photos');
  await page.keyboard.press('Escape'); // board -> back to the map
  await expect.poll(open).toBe('townmap');
  await page.keyboard.press('Escape'); // map closes
  await expect.poll(open).toBeNull();
});
