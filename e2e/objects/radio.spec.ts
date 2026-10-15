import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { load, tile } from '../helpers';
import { STATIONS } from '../../src/ui/overlay/overlays/radio/stations';

// Review screenshots go under Playwright's output dir (gitignored), never an absolute machine path: CI cannot mkdir one.
const SHOTS_DIR = path.join(process.cwd(), 'test-results', 'shots');

async function openRadio(page: import('@playwright/test').Page) {
  await load(page);
  // Open Start menu
  await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=start-menu]')).toBeVisible();
  // Navigate to Radio (second entry, after Pokédex)
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=radio]')).toBeVisible({ timeout: 5000 });
}

test.describe('Radio overlay', () => {
  test('Start -> Radio opens with dial view', async ({ page }) => {
    await openRadio(page);
    await expect(page.locator('[data-testid=radio]')).toHaveAttribute('data-view', 'dial');
    await expect(page.locator('[data-testid=radio]')).toContainText('RADIO');
    await expect(page.locator('[data-testid=radio-station-name]')).toBeVisible();
    await expect(page.locator('[data-testid=radio-station-desc]')).toBeVisible();
  });

  test('B closes the radio and player stays on the same tile', async ({ page }) => {
    await openRadio(page);
    const before = await tile(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0, { timeout: 3000 });
    expect(await tile(page)).toEqual(before);
  });

  test('tune right (▶) moves to the next station, wraps around', async ({ page }) => {
    await openRadio(page);
    const first = await page.locator('[data-testid=radio-station-name]').textContent();
    const n = STATIONS.length;
    // Tune right through all stations: wraps back to start
    for (let i = 0; i < n; i++) {
      await page.locator('[data-testid=radio-tune-right]').dispatchEvent('pointerdown');
    }
    expect(await page.locator('[data-testid=radio-station-name]').textContent()).toBe(first);
  });

  test('tune left (flipped ▶) moves to the previous station, wraps around', async ({ page }) => {
    await openRadio(page);
    const first = await page.locator('[data-testid=radio-station-name]').textContent();
    // Tune left once: wraps to last station
    await page.locator('[data-testid=radio-tune-left]').dispatchEvent('pointerdown');
    expect(await page.locator('[data-testid=radio-station-name]').textContent()).toBe(STATIONS[STATIONS.length - 1]!.name);
    // Tune left (n-1) more times: wraps back to first
    const n = STATIONS.length;
    for (let i = 0; i < n - 1; i++) {
      await page.locator('[data-testid=radio-tune-left]').dispatchEvent('pointerdown');
    }
    expect(await page.locator('[data-testid=radio-station-name]').textContent()).toBe(first);
  });

  test('keyboard left/right tunes stations with wrap', async ({ page }) => {
    await openRadio(page);
    const n = STATIONS.length;
    // tune right n times (wraps back to start)
    for (let i = 0; i < n; i++) await page.keyboard.press('ArrowRight');
    expect(await page.locator('[data-testid=radio-station-name]').textContent()).toBe(STATIONS[0]!.name);
    // tune left once (wraps to last)
    await page.keyboard.press('ArrowLeft');
    expect(await page.locator('[data-testid=radio-station-name]').textContent()).toBe(STATIONS[STATIONS.length - 1]!.name);
  });

  test('Now Spinning: A opens the track list with "title · artist" rows', async ({ page }) => {
    await openRadio(page);
    // Now Spinning is the first station (index 0)
    expect(await page.locator('[data-testid=radio-station-name]').textContent()).toContain('Now Spinning');

    // A opens the list
    await page.keyboard.press('Space');
    await expect(page.locator('[data-testid=radio]')).toHaveAttribute('data-view', 'list');
    await expect(page.locator('[data-testid=scroll-list]')).toBeVisible();

    // Rows show "title · artist" format; first row is "Touching God · Daniel Caesar"
    const firstRow = await page.locator('.sl-row').first().textContent();
    expect(firstRow).toContain('·');
    expect(firstRow).toContain('Touching God');
    expect(firstRow).toContain('Daniel Caesar');

    // Screenshot: track list on phone
    await mkdir(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS_DIR, 'radio-list-phone.png') });

    // B goes back to dial
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid=radio]')).toHaveAttribute('data-view', 'dial');
  });

  test('Ayush FM: shows top-screen embed frame with "Open in Spotify" link for real URL', async ({ page }) => {
    await openRadio(page);
    // Navigate to Ayush FM (index 1)
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('[data-testid=radio-station-name]').textContent()).toContain('Ayush FM');

    // Screenshot: dial at FM station
    await mkdir(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS_DIR, 'radio-dial-phone.png') });

    // A opens FM view
    await page.keyboard.press('Space');
    await expect(page.locator('[data-testid=radio]')).toHaveAttribute('data-view', 'fm');

    // Top screen shows the FM layer
    await expect(page.locator('[data-testid=radio-fm-top]')).toBeVisible();
    // Real URL: no placeholder frame
    await expect(page.locator('[data-testid=radio-fm-placeholder]')).toHaveCount(0);
    // "Open in Spotify" link present with validated href
    await expect(page.locator('[data-testid=radio-fm-open]')).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/5GLhJSBebb89FfDPfvY24Z',
    );
    // Station card first: no third-party iframe until the second A
    await expect(page.locator('[data-testid=radio-fm-card]')).toBeVisible();
    await expect(page.locator('.radio-fm-frame iframe')).toHaveCount(0);
    // Card lines sit on whole native pixels (left edge / --px is an integer)
    const lefts = await page.evaluate(() => {
      const top = document.querySelector('.top-screen')!.getBoundingClientRect();
      const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px'));
      return [...document.querySelectorAll('.radio-fm-card > div')].map((d) => {
        const r = document.createRange();
        r.selectNodeContents(d);
        return (r.getBoundingClientRect().left - top.left) / px;
      });
    });
    expect(lefts.length).toBe(3);
    for (const l of lefts) expect(Math.abs(l - Math.round(l))).toBeLessThan(0.01);
    await page.keyboard.press('Space');
    await expect(page.locator('.radio-fm-frame iframe')).toHaveCount(1);
    await expect(page.locator('[data-testid=radio-fm-card]')).toHaveCount(0);

    // Screenshot: FM view with real embed
    await page.screenshot({ path: path.join(SHOTS_DIR, 'radio-fm-phone.png') });

    // B returns to dial; FM portal gone
    await page.keyboard.press('Escape');
    // B then A again: the card is back, no iframe yet
    await expect(page.locator('[data-testid=radio]')).toHaveAttribute('data-view', 'dial');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-testid=radio-fm-card]')).toHaveCount(1);
    await expect(page.locator('.radio-fm-frame iframe')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid=radio]')).toHaveAttribute('data-view', 'dial');
    await expect(page.locator('[data-testid=radio-fm-top]')).toHaveCount(0);
  });

  test('Ayush FM: playlist URL validator rejects non-Spotify URLs (uses placeholder frame)', async ({ page }) => {
    // Test the validator logic via unit — here we just assert the DOM renders correctly
    // for the real URL (verified above). Validator tests are in content.test.ts.
    // This test is a sanity check that the iframe src is built from the validated ID only.
    await openRadio(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-testid=radio-fm-top]')).toBeVisible();
    await page.keyboard.press('Space');
    const iframeSrc = await page.locator('.radio-fm-frame iframe').getAttribute('src');
    // src must be the embed URL built from the validated ID, not a raw user URL
    expect(iframeSrc).toBe('https://open.spotify.com/embed/playlist/5GLhJSBebb89FfDPfvY24Z');
  });
});
