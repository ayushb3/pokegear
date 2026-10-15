import { expect, test } from '@playwright/test';
import { ALL_FURNITURE, ROOMS } from '../src/world/grid';
import { dismissAll, load, tile } from './helpers';

test('layout is crisp and does not scroll sideways', async ({ page }) => {
  await load(page);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
    cw: document.querySelector('canvas')!.width,
    ch: document.querySelector('canvas')!.height,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  expect(m.sh).toBeLessThanOrEqual(m.ih);
  expect(m.cw % 256).toBe(0);
  expect(m.ch).toBe((m.cw / 256) * 192);
});

/** Every object in the object table gets the open -> B loop automatically (no hand-written list).
 *  Per-object extras (overlays etc.) go in e2e/objects/<id>.spec.ts. */
const OBJECT_IDS = ALL_FURNITURE.filter((f) => f.id).map((f) => f.id as string);
for (const id of OBJECT_IDS) {
  test(`object ${id}: open -> B -> overlay gone, same tile and room, focus restored`, async ({ page }) => {
    await load(page);
    await page.evaluate((o) => window.__game && ((window.__focus = document.activeElement), window.__game.goTo(o)), id);
    await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
    const opened = await tile(page);
    expect(opened.m).toBe(false);
    await dismissAll(page);
    expect(await tile(page)).toEqual(opened);
    expect(await page.evaluate(() => document.activeElement === window.__focus)).toBe(true);
    // world is live again
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(100);
    await page.keyboard.up('ArrowDown');
  });
}

test('DS layout: screens stacked, same width, centred, both fit the viewport', async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    const box = (sel: string) => {
      const b = document.querySelector(sel)!.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    return { top: box('.top-screen'), bottom: box('.bottom-screen'), iw: window.innerWidth, ih: window.innerHeight };
  });
  expect(r.bottom.y).toBeGreaterThan(r.top.y + r.top.h - 1); // stacked
  expect(Math.abs(r.top.w - r.bottom.w)).toBeLessThan(1);
  expect(Math.abs(r.top.x - r.bottom.x)).toBeLessThan(1);
  expect(Math.abs(r.top.x + r.top.w / 2 - r.iw / 2)).toBeLessThan(2);
  expect(r.bottom.y + r.bottom.h).toBeLessThanOrEqual(r.ih);
});

test('keyboard walking moves the player', async ({ page }) => {
  await load(page);
  const a = await tile(page);
  await page.keyboard.down('ArrowRight'); // first press turns, holding walks
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(400);
  const b = await tile(page);
  expect(b.x).toBeGreaterThan(a.x);
  expect(b.f).toBe('right');
});

test('Start -> Trainer Card -> B', async ({ page }) => {
  await load(page);
  const before = await tile(page);
  await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=start-menu]')).toBeVisible();
  // Menu order: Pokédex (0), Radio (1), Trainer Card (2) — ArrowDown twice then Space
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=trainer-card]')).toContainText('Ayush Basu');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  expect(await tile(page)).toEqual(before);
  // keyboard M opens the menu too
  await page.keyboard.press('KeyM');
  await expect(page.locator('[data-testid=start-menu]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
});

test('deep link opens the BubblyChef entry on the top screen with the player at the PC', async ({ page }) => {
  await load(page, '&open=projects/bubblychef');
  const top = page.locator('.top-screen [data-testid=dex-entry-page]');
  await expect(top).toContainText('BubblyChef');
  await expect(top).toContainText('No. 001');
  const at = await tile(page);
  expect(at).toMatchObject({ x: 8, y: 3, f: 'up' });
  await page.keyboard.press('Escape'); // entry -> grid
  await expect(page.locator('[data-testid=dex-grid]')).toBeVisible();
  await dismissAll(page);
  expect(await tile(page)).toEqual(at);
  expect(new URL(page.url()).search).not.toContain('open=');
});

test('Start -> Pokedex list (seen balls) -> entry -> B -> list -> B', async ({ page }) => {
  await load(page);
  const before = await tile(page);
  await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
  await page.keyboard.press('Space'); // Pokedex is the first entry
  await expect(page.locator('.top-screen [data-testid=dex-list]')).toContainText('BubblyChef');
  await expect(page.locator('[data-testid=dex-list] .dx-ball')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=dex-entry-page]')).toContainText('BubblyChef');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=dex-list] .dx-ball')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  expect(await tile(page)).toEqual(before);
});

test('invalid deep link loads normally', async ({ page }) => {
  await load(page, '&open=projects/nope');
  expect(await page.locator('.bottom-screen .overlay').count()).toBe(0);
  expect(await tile(page)).toMatchObject({ x: 7, y: 7 });
});

test.describe('plain project page', () => {
  test.use({ javaScriptEnabled: false });
  test('renders with JS disabled and links into the room', async ({ page }) => {
    await page.goto('/projects/bubblychef');
    await expect(page.locator('h1')).toHaveText('BubblyChef');
    await expect(page.locator('body')).toContainText('pantry');
    await expect(page.getByRole('link', { name: /Walk into the room/ })).toHaveAttribute('href', '/?open=projects/bubblychef');
    for (const slug of ['how-i-build', 'tradedesk']) {
      await page.goto(`/projects/${slug}`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/course|education/i);
    }
  });
});

test('every line of every entry is reachable by paging, and the URL follows the entry', async ({ page }) => {
  for (const slug of ['how-i-build', 'bubblychef', 'tradedesk', 'stave']) {
    await load(page, `&open=projects/${slug}`);
    await expect(page.locator('[data-testid=dex-entry-page]')).toBeVisible();
    expect(new URL(page.url()).search).toContain(`open=projects/${slug}`);
    await page.keyboard.press('Space'); // -> What got built
    for (const testid of ['dex-what', 'dex-built', 'dex-learned']) {
      await expect(page.locator(`[data-testid=${testid}]`)).toBeVisible();
      const tp = page.locator('[data-testid=text-pages]');
      const pages = Number(await tp.getAttribute('data-pages'));
      // nothing is cut mid-glyph: the viewport height is a whole number of lines
      const cut = await page.evaluate(() => {
        const v = document.querySelector('.tp-view') as HTMLElement;
        const lh = parseFloat(getComputedStyle(document.querySelector('.tp-flow')!).lineHeight);
        return (v.clientHeight / lh) % 1;
      });
      expect(cut).toBeLessThan(0.02);
      for (let i = 1; i < pages; i++) {
        await expect(page.locator('.tp-more.on')).toHaveCount(1); // down-arrow while more follows
        await page.keyboard.press('Space');
        await expect(tp).toHaveAttribute('data-page', String(i + 1));
      }
      await expect(page.locator('.tp-more.on')).toHaveCount(0);
      await page.keyboard.press('Space'); // last text page + A -> next dex page
    }
    // Links page: buttons are >= 44 CSS px tall, and every entry links to its plain page
    await expect(page.locator('[data-testid=dex-links]')).toBeVisible();
    const heights = await page.locator('.dx-btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
    await expect(page.locator('[data-testid=dex-link-plain]')).toHaveAttribute('href', `/projects/${slug}`);
    await page.keyboard.press('Space'); // A on the last page wraps round to the first
    await expect(page.locator('[data-testid=dex-entry-page]')).toBeVisible();
    await expect(page.locator('[data-testid=dex-page-no]')).toHaveText('Page 1/5');
    await page.keyboard.press('Escape'); // entry + B -> grid
    await expect(page.locator('[data-testid=dex-grid]')).toBeVisible();
    expect(new URL(page.url()).search).not.toContain('open=');
    await page.keyboard.press('Escape'); // grid + B -> room, standing at the PC
    await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
    expect(await tile(page)).toMatchObject({ x: 8, y: 3, f: 'up' });
  }
});

test('last page of a text run never holds a single line', async ({ page }) => {
  await load(page, '&open=projects/bubblychef');
  await page.keyboard.press('Space');
  const tp = page.locator('[data-testid=text-pages]');
  const pages = Number(await tp.getAttribute('data-pages'));
  for (let i = 1; i < pages; i++) await page.keyboard.press('Space');
  const lines = await page.evaluate(() => {
    const v = document.querySelector('.tp-view') as HTMLElement;
    const lh = parseFloat(getComputedStyle(document.querySelector('.tp-flow')!).lineHeight);
    return Math.round(v.clientHeight / lh);
  });
  if (pages > 1) expect(lines).toBeGreaterThanOrEqual(2);
});

test('BubblyChef links the live site; TradeDesk has no repo link', async ({ page }) => {
  await load(page, '&open=projects/bubblychef');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight'); // pages: Entry -> ... -> Links
  await expect(page.locator('[data-testid=dex-link-live]')).toHaveAttribute('href', 'https://bubbly-chef.vercel.app');
  await expect(page.locator('[data-testid=dex-link-ext]')).toHaveCount(2); // GitHub + demo video share one row
  const [scrollH, clientH] = await page.locator('.dx-links').evaluate((el) => [el.scrollHeight, el.clientHeight]);
  expect(scrollH, 'four links fit the box without clipping').toBeLessThanOrEqual(clientH);
  await page.keyboard.press('ArrowDown'); // next ENTRY: TradeDesk, back on its entry page
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid=dex-link-live]')).toHaveCount(0);
  await expect(page.locator('[data-testid=dex-links]')).toContainText('private');
});

test('hint is one short line, shown once, and the bag grid comes back after dialogue', async ({ page }) => {
  await load(page);
  await expect(page.locator('[data-testid=idle-box]')).toContainText('Ayush Basu');
  await page.evaluate(() => window.__game!.goTo('piano'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await dismissAll(page);
  await expect(page.locator('.idle-box .slot')).toHaveCount(ROOMS.bedroom.furniture.filter((f) => f.id).length); // one slot per bedroom object (the Card is a pad button)
  await expect(page.locator('.dock')).toHaveCount(0);
  await expect(page.locator('[data-testid=idle-box]')).not.toContainText('Ayush Basu');
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText("Ayush's room");
});

test('a11y basics: h1, role=img, real buttons with focus ring, live region mirrors dialogue', async ({ page }) => {
  await load(page);
  await expect(page.locator('h1')).toHaveText('Ayush Basu — portfolio');
  await expect(page.locator('.top-screen [role=img]')).toHaveCount(1);
  await expect(page.locator('.top-screen [role=img]')).toHaveAttribute('aria-label', /bed.*pc.*piano/i);
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBe('BUTTON');
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(ring).not.toBe('none');
  await page.evaluate(() => window.__game!.goTo('piano'));
  await expect(page.locator('[data-testid=live]')).toContainText('sat down at the piano', { timeout: 20_000 });
});

/**
 * "Before the world exists" must be a state we CREATE, not one we hope to hit. The old version fired events straight after
 * `goto`: depending on machine speed they landed before React hydrated (silently dropped, nothing to assert) or after (buffered), so the
 * test passed or exercised something different from run to run. Here the lazy Pixi chunk is held at the network, we wait until the island is
 * hydrated (React has attached its props to the DOM), tap, and only then let the world load.
 */
async function holdWorld(page: import('@playwright/test').Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/_astro\/render[.-]/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/?debug');
  await page.waitForFunction(() => {
    const box = document.querySelector('.world-box');
    return !!box && Object.keys(box).some((k) => k.startsWith('__reactProps'));
  });
  await expect(page.locator('.world-loading')).toBeVisible();
  expect(await page.evaluate(() => !!window.__game)).toBe(false);
  return release;
}

test('a tap before the world exists is buffered and walks there once it does', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const release = await holdWorld(page);
  // a floor tile (room tile 10,6), in client coordinates of the 256x192 screen (room offset 16,16)
  const box = (await page.locator('.world-box').boundingBox())!;
  const tx = 10;
  const ty = 6;
  await page.locator('.world-box').dispatchEvent('pointerdown', {
    clientX: box.x + ((16 + tx * 16 + 8) / 256) * box.width,
    clientY: box.y + ((16 + ty * 16 + 8) / 192) * box.height,
  });
  release();
  await page.waitForFunction(() => !!window.__game);
  await expect.poll(async () => ({ x: (await tile(page)).x, y: (await tile(page)).y })).toEqual({ x: tx, y: ty });
  expect(errors).toEqual([]);
});

test('Start and bag slots pressed before the world exists do not throw', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const release = await holdWorld(page);
  await page.locator('.slot').first().dispatchEvent('pointerdown');
  await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
  release();
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('[data-testid=start-menu]')).toBeVisible();
  expect(errors).toEqual([]);
});
