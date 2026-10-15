import { expect, test } from '@playwright/test';
import { advanceDialogue, dismissAll, load, tile } from '../helpers';

async function openDex(page: import('@playwright/test').Page) {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('pc'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  const opened = await tile(page);
  await advanceDialogue(page);
  return opened;
}

async function toGrid(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-testid=dex-intro]')).toHaveAttribute('data-phase', 'say');
  await page.keyboard.press('Space'); // Rotom's line -> grid
  await expect(page.locator('[data-testid=dex-grid]')).toBeVisible();
}

test('object pc: narrator -> Rotom pops out -> PC-box grid -> B returns to the same tile', async ({ page }) => {
  const opened = await openDex(page);
  await expect(page.locator('[data-testid=dex-intro]')).toBeVisible();
  await expect(page.locator('[data-testid=dex-say]')).toContainText('Bzzt!');
  await expect(page.locator('[data-testid=dex-intro]')).toHaveAttribute('data-phase', 'say');
  await expect(page.locator('[data-testid=dex-say]')).toContainText('Ayush and I built these together');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=dex-grid]')).toBeVisible();
  await expect(page.locator('.top-screen [data-testid=dex-grid] img')).toHaveCount(4); // four animated sprites (box is full)
  await dismissAll(page);
  expect(await tile(page)).toEqual(opened);
});

test('Pokedex PC-box grid fits its frame: every sprite inside its slot, the name row not clipped', async ({ page }) => {
  await openDex(page);
  await toGrid(page);
  await expect(page.locator('.top-screen [data-testid=dex-grid] img')).toHaveCount(4);
  const r = await page.locator('[data-testid=dex-grid]').evaluate((g) => {
    const box = g.getBoundingClientRect();
    const inside = (c: DOMRect, p: DOMRect) => c.top >= p.top - 0.5 && c.bottom <= p.bottom + 0.5 && c.left >= p.left - 0.5 && c.right <= p.right + 0.5;
    const imgs = [...g.querySelectorAll<HTMLElement>('.dx-slot img')].map((i) => inside(i.getBoundingClientRect(), i.closest('.dx-slot')!.getBoundingClientRect()));
    const foot = g.querySelector<HTMLElement>('.dx-foot')!;
    return { imgs, footInside: inside(foot.getBoundingClientRect(), box), footClip: foot.scrollHeight - foot.clientHeight, sh: g.scrollHeight - g.clientHeight };
  });
  expect(r.imgs).toEqual([true, true, true, true]);
  expect(r.footInside).toBe(true);
  expect(r.footClip).toBeLessThanOrEqual(0);
  expect(r.sh).toBeLessThanOrEqual(0);
  await dismissAll(page);
});

test('Pokedex: grid -> entry (top screen) -> pages -> B steps back one level, URL follows', async ({ page }) => {
  await openDex(page);
  await toGrid(page);
  await page.keyboard.press('ArrowRight'); // BubblyChef
  await page.keyboard.press('Space'); // A opens the entry
  const top = page.locator('.top-screen [data-testid=dex-entry-page]');
  await expect(top).toContainText('BubblyChef');
  await expect(page.locator('[data-testid=dex-ribbon]')).toContainText('Built with the agent loop · 21 runs');
  await expect(page.locator('[data-testid=dex-ribbon]')).not.toContainText('$');
  expect(new URL(page.url()).search).toContain('open=projects/bubblychef');
  // the bottom screen is the controls
  await expect(page.locator('.bottom-screen [data-testid=dex-page-no]')).toHaveText('Page 1/5');
  await expect(page.locator('[data-testid=dex-entry-prev]')).toContainText('No.000');
  await expect(page.locator('[data-testid=dex-entry-next]')).toContainText('No.002');
  await page.locator('[data-testid=dex-entry-next]').dispatchEvent('pointerdown'); // next ENTRY
  await expect(top).toContainText('TradeDesk');
  await expect(page.locator('[data-testid=dex-ribbon]')).toContainText('Private — WIP');
  await page.locator('[data-testid=dex-entry-prev]').dispatchEvent('pointerdown');
  await expect(top).toContainText('BubblyChef');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=dex-what]')).toBeVisible();
  await page.keyboard.press('Escape'); // entry -> grid
  await expect(page.locator('[data-testid=dex-grid]')).toBeVisible();
  expect(new URL(page.url()).search).not.toContain('open=');
  await page.keyboard.press('Escape'); // grid -> closed
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  await expect(page.locator('.top-screen .dx')).toHaveCount(0);
});

test('Pokedex: dim on while open, off after; seen ball after opening an entry', async ({ page }) => {
  await openDex(page);
  await expect(page.locator('.world-box')).toHaveAttribute('data-dim', '');
  await toGrid(page);
  await expect(page.locator('[data-testid=dex-grid] .dx-ball')).toHaveCount(0);
  await page.keyboard.press('Space'); // open Rotom
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=dex-grid] .dx-ball')).toHaveCount(1);
  await dismissAll(page);
  await expect(page.locator('.world-box')).not.toHaveAttribute('data-dim', '');
});

test('Pokedex: full 2x2 grid reaches Stave (bottom right), local project note, no external link', async ({ page }) => {
  await openDex(page);
  await toGrid(page);
  await expect(page.locator('[data-testid=dex-grid] .dx-slot')).toHaveCount(4);
  await expect(page.locator('[data-testid=dex-grid] .dx-empty')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown'); // Stave
  await page.keyboard.press('Space');
  await expect(page.locator('.top-screen [data-testid=dex-entry-page]')).toContainText('Stave');
  await expect(page.locator('[data-testid=dex-ribbon]')).toContainText('Local only — no public repo');
  expect(new URL(page.url()).search).toContain('open=projects/stave');
  await page.keyboard.press('Space'); // What
  await page.keyboard.press('Space'); // How
  await expect(page.locator('.top-screen')).toBeVisible();
});

test('Stave plain page is generated', async ({ page }) => {
  await page.goto('/projects/stave');
  await expect(page.locator('body')).toContainText('Stave');
  await expect(page.locator('body')).toContainText('not deployed publicly');
});

test('Pokedex entry: arrows turn PAGES (wrapping), up/down switch ENTRIES, A is next page', async ({ page }) => {
  await openDex(page);
  await toGrid(page);
  await page.keyboard.press('ArrowRight'); // BubblyChef
  await page.keyboard.press('Space');
  const title = page.locator('[data-testid=dex-page-title]');
  const no = page.locator('[data-testid=dex-page-no]');
  const top = page.locator('.top-screen');
  await expect(no).toHaveText('Page 1/5');
  await page.keyboard.press('ArrowRight');
  await expect(title).toHaveText('What got built');
  await expect(top).toContainText('BubblyChef'); // same entry
  await page.keyboard.press('ArrowRight');
  await expect(title).toHaveText('How it was built');
  await page.keyboard.press('ArrowLeft');
  await expect(title).toHaveText('What got built');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // wraps from the first page to the last
  await expect(no).toHaveText('Page 5/5');
  await expect(page.locator('[data-testid=dex-links]')).toBeVisible();
  await page.keyboard.press('ArrowRight'); // and back round
  await expect(no).toHaveText('Page 1/5');
  // on-screen page arrows
  await page.locator('[data-testid=dex-page-next]').dispatchEvent('pointerdown');
  await expect(no).toHaveText('Page 2/5');
  await page.locator('[data-testid=dex-page-prev]').dispatchEvent('pointerdown');
  await expect(no).toHaveText('Page 1/5');
  // up / down switch the entry and land on its first page
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(top).toContainText('TradeDesk');
  await expect(no).toHaveText('Page 1/5');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-testid=dex-ctl-name]')).toContainText('Rotom');
  await page.keyboard.press('ArrowUp'); // wraps to the last entry
  await expect(page.locator('[data-testid=dex-ctl-name]')).toContainText('Stave');
  // A = next page, wrapping from the last page
  await page.keyboard.press('Space');
  await expect(no).toHaveText('Page 2/5');
});

test('Rotom plays once per session: second PC open goes narrator -> grid, a fresh context sees Rotom again', async ({ page, browser }, testInfo) => {
  await openDex(page);
  await expect(page.locator('[data-testid=dex-intro]')).toBeVisible(); // first open: Rotom
  await dismissAll(page);
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);

  await page.evaluate(() => window.__game!.goTo('pc'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await advanceDialogue(page); // narrator line -> straight to the grid
  await expect(page.locator('[data-testid=dex-grid]')).toBeVisible();
  await expect(page.locator('[data-testid=dex-intro]')).toHaveCount(0);
  await expect(page.locator('[data-testid=dex-say]')).toHaveCount(0);
  await dismissAll(page);

  // a fresh browser context (new session) sees Rotom again
  const ctx = await browser.newContext({ ...testInfo.project.use, viewport: page.viewportSize() });
  const p2 = await ctx.newPage();
  await openDex(p2);
  await expect(p2.locator('[data-testid=dex-intro]')).toBeVisible();
  await expect(p2.locator('[data-testid=dex-say]')).toContainText('Bzzt!');
  await ctx.close();
});

test('Pokedex DOM sits on the pixel grid: nav glyph 16u, frame in --u multiples, 44px hit area', async ({ page }) => {
  await openDex(page);
  await toGrid(page);
  await page.keyboard.press('Space');
  const u = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 1);
  const nav = page.locator('[data-testid=dex-page-next]');
  const m = await nav.evaluate((el) => {
    const f = el.querySelector('.dex-nav-face')!.getBoundingClientRect();
    return { font: parseFloat(getComputedStyle(el).fontSize), fw: f.width, fh: f.height };
  });
  expect(m.font).toBe(16 * u);
  expect(m.fw).toBe(36 * u);
  expect(m.fh).toBe(30 * u);
  const b = (await nav.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
});

test('Pokedex entry controls fit and stay tappable at the current viewport', async ({ page }) => {
  await openDex(page);
  await toGrid(page);
  await page.keyboard.press('Space'); // Rotom
  const screen = (await page.locator('.bottom-screen').boundingBox())!;
  for (const id of ['dex-page-prev', 'dex-page-next', 'dex-entry-prev', 'dex-entry-next']) {
    const b = (await page.locator(`[data-testid=${id}]`).boundingBox())!;
    expect(b.height, id).toBeGreaterThanOrEqual(id.startsWith('dex-page') ? 43 : 35); // page arrows are the big targets
    expect(b.x, id).toBeGreaterThanOrEqual(screen.x);
    expect(b.x + b.width, id).toBeLessThanOrEqual(screen.x + screen.width + 1);
    expect(b.y + b.height, id).toBeLessThanOrEqual(screen.y + screen.height + 1);
    await expect(page.locator(`[data-testid=${id}]`)).toBeEnabled();
  }
});
