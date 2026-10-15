/**
 * E2E tests for the title screen.
 *
 * URL conventions:
 *   /?debug          → title screen hidden (debug suppresses it by default)
 *   /?debug&title=1  → title screen shown WITH auto-dismiss disabled (noAuto=true)
 *                       so tests can assert without racing the AUTO_MS timer;
 *                       the intro animation still plays in real time (data-phase intro -> settled)
 *   /?open=card      → title screen hidden (deep link)
 *
 * Auto-dismiss verified with page.clock (fake timer).
 * Skip: a sr-only "Skip intro" button (the first Tab stop from the focused dialog, tested via
 * Tab then Enter) plus a visible "Skip" button (aria-hidden, tabIndex -1) for mouse/touch.
 * Intro assertions never wait for the world first (Pixi can outlast the intro).
 * Hidden tab: `document.visibilityState` is overridden from an init script (as e2e/lid.spec.ts
 * does) and `visibilitychange` dispatched by hand; the timers are then driven by page.clock.
 */

import { expect, test } from '@playwright/test';
import { load, tile } from './helpers';

/** Navigate to a URL and wait until the game world is ready (__game + canvas). */
async function loadFull(page: import('@playwright/test').Page, query: string) {
  await page.goto(query);
  await page.waitForFunction(() => !!window.__game);
  await page.locator('canvas').waitFor();
}

// ── Show / hide decisions ─────────────────────────────────────────────────────

test('/?debug does NOT show the title screen', async ({ page }) => {
  await load(page); // /?debug
  await expect(page.locator('[data-testid=title-screen]')).toHaveCount(0);
});

test('/?debug&title=1 DOES show the title screen with name and PRESS START', async ({ page }) => {
  await loadFull(page, '/?debug&title=1');
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();
  // Name wordmark present
  await expect(page.locator('[data-testid=title-screen]')).toContainText('Ayush Basu');
  // PRESS START present
  await expect(page.locator('[data-testid=title-screen]')).toContainText('PRESS START');
  // No visible subtitle (headline title removed per Ayush's feedback)
  await expect(page.locator('.title-subtitle')).toHaveCount(0);
});

test('/?open=card does NOT show the title screen (deep link)', async ({ page }) => {
  await loadFull(page, '/?debug&open=card');
  await expect(page.locator('[data-testid=title-screen]')).toHaveCount(0);
});

// ── Dismiss paths ─────────────────────────────────────────────────────────────

test('a keypress dismisses the title screen and the player is controllable', async ({ page }) => {
  await loadFull(page, '/?debug&title=1'); // noAuto=true, timer is off
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();
  const before = await tile(page);

  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=title-screen]')).toHaveCount(0);

  // world should be resumed: player can move
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => {
    const t = await tile(page);
    return t.f === 'right' || t.x > before.x;
  }, { timeout: 3000 }).toBe(true);
  await page.keyboard.up('ArrowRight');

  // focus is on the game area (top-screen div[tabindex=-1])
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBe('DIV');
});

test('click on the title screen dismisses it', async ({ page }) => {
  await loadFull(page, '/?debug&title=1');
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();
  await page.locator('.title-top').click();
  await expect(page.locator('[data-testid=title-screen]')).toHaveCount(0);
});

test('the dialog is focused on mount with no ring; Tab reaches the sr-only Skip intro and draws its ring on the visible Skip; Enter dismisses', async ({ page }) => {
  await loadFull(page, '/?debug&title=1');
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();

  // The dialog itself holds focus (screen readers hear its label); nothing shows a focus ring
  const onMount = await page.evaluate(() => ({
    active: document.activeElement?.getAttribute('data-testid'),
    rootOutline: getComputedStyle(document.activeElement!).outlineStyle,
    skipOutline: getComputedStyle(document.querySelector('.title-skip')!).outlineStyle,
    srVisible: !!document.querySelector('.title-skip-sr:focus-visible'),
  }));
  expect(onMount).toEqual({ active: 'title-screen', rootOutline: 'none', skipOutline: 'none', srVisible: false });

  // One Tab lands on the sr-only Skip intro (the capture handler lets Tab through) and the
  // :focus-visible ring is drawn on the visible Skip, an integer-u outline in the site colour
  await page.keyboard.press('Tab');
  const afterTab = await page.evaluate(() => {
    const skip = document.querySelector('.title-skip')!;
    const cs = getComputedStyle(skip);
    const u = parseFloat(getComputedStyle(document.querySelector('.shell')!).getPropertyValue('--u'));
    return { active: document.activeElement?.textContent?.trim(), skipOutline: cs.outlineStyle, outlineW: parseFloat(cs.outlineWidth) / u, offset: parseFloat(cs.outlineOffset) / u };
  });
  expect(afterTab).toEqual({ active: 'Skip intro', skipOutline: 'solid', outlineW: 2, offset: 1 });
  // The title is still up: Tab never dismisses
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();

  // Activate with Enter while focused — the capture-phase keydown listener fires,
  // but Enter on a focused button triggers click before keydown bubbles, so both
  // paths converge on dismiss(); the title must vanish either way.
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=title-screen]')).toHaveCount(0);
});

test('browser shortcuts pass through: Ctrl+F, Cmd+R, Alt+Left and F5 neither dismiss nor get cancelled', async ({ page }) => {
  await loadFull(page, '/?debug&title=1');
  const title = page.locator('[data-testid=title-screen]');
  await expect(title).toBeVisible();
  // record whether each keydown reached the document uncancelled (the title's capture listener runs first)
  await page.evaluate(() => {
    (window as unknown as { __keys: string[] }).__keys = [];
    document.addEventListener('keydown', (e) => {
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return; // the bare modifier press of each combo
      (window as unknown as { __keys: string[] }).__keys.push(`${e.key}:${e.defaultPrevented ? 'cancelled' : 'ok'}`);
    });
  });
  for (const combo of ['Control+f', 'Meta+r', 'Alt+ArrowLeft', 'F5']) await page.keyboard.press(combo);
  await expect(title).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)).toEqual(['f:ok', 'r:ok', 'ArrowLeft:ok', 'F5:ok']);
  // a plain key still dismisses; stopImmediatePropagation at the window capture phase means it
  // never reaches the document (nor the game): the recording does not grow
  await page.keyboard.press('Enter');
  await expect(title).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)).toEqual(['f:ok', 'r:ok', 'ArrowLeft:ok', 'F5:ok']);
});

test('sr-only Skip intro button: in DOM but not visually rendered when not focused', async ({ page }) => {
  await loadFull(page, '/?debug&title=1');
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();
  // The button exists in the DOM (sr-only, accessible; not display:none)
  await expect(page.locator('.title-skip-sr')).toHaveCount(1);
  // Move focus away from the skip button (it gets focus on mount; blur it to test unfocused state)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // When not focused, the element is clipped to 1x1 (sr-only) — no visual presence
  const box = await page.locator('.title-skip-sr').boundingBox();
  expect((box?.width ?? 0) <= 1).toBe(true);
});

// ── Auto-dismiss (fake clock) ─────────────────────────────────────────────────

test('?title=1 disables auto-dismiss (title still visible after 3 s with fake clock)', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await loadFull(page, '/?debug&title=1'); // noAuto=true
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();
  // With noAuto=true the timer never fires; fast-forwarding must leave title visible
  await page.clock.fastForward(3000);
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();
});

test('fake clock: the intro settles after INTRO_MS and the title stays up (noAuto)', async ({ page }) => {
  await page.clock.install({ time: 0 });
  // Never wait for the world before an intro assertion: Pixi can take longer than the intro.
  await page.goto('/?debug&title=1');
  const title = page.locator('[data-testid=title-screen]');
  await title.waitFor();
  await expect(title).toHaveAttribute('data-phase', 'intro');
  await page.clock.fastForward(4000);
  await expect(title).toHaveAttribute('data-phase', 'settled');
  await expect(title).toBeVisible();
});

test('a tab opened in the background holds the intro until it is looked at, then plays it from 0', async ({ page }) => {
  // visibilityState is read-only: override it before load, then flip it and dispatch the event by hand
  await page.addInitScript(() => {
    const w = window as unknown as { __vis: string };
    w.__vis = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => w.__vis });
  });
  await page.clock.install({ time: 0 });
  await page.goto('/?debug&title=1');
  const title = page.locator('[data-testid=title-screen]');
  await title.waitFor();
  await expect(title).toHaveAttribute('data-phase', 'intro');
  await expect(title).toHaveAttribute('data-epoch', '0');

  // hidden: INTRO_MS and more passes, nothing settles (the timer has not started)
  await page.clock.fastForward(4000);
  await expect(title).toHaveAttribute('data-phase', 'intro');

  // looked at: the top screen is re-keyed (every CSS beat restarts) and the intro timer starts now
  await page.evaluate(() => {
    (window as unknown as { __vis: string }).__vis = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(title).toHaveAttribute('data-epoch', '1');
  const walkTime = await page.evaluate(() => document.querySelector('.title-follower')!.getAnimations()[0].currentTime as number);
  expect(walkTime).toBeLessThan(1000); // a fresh animation, not one that ran unseen for 4 s
  await page.clock.fastForward(3100);
  await expect(title).toHaveAttribute('data-phase', 'intro');
  await page.clock.fastForward(200);
  await expect(title).toHaveAttribute('data-phase', 'settled');
  await expect(title).toHaveAttribute('data-epoch', '1');

  // once settled, hiding and showing again replays nothing
  await page.evaluate(() => {
    const w = window as unknown as { __vis: string };
    w.__vis = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    w.__vis = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(title).toHaveAttribute('data-epoch', '1');
  await expect(title).toHaveAttribute('data-phase', 'settled');
});

// ── Intro animation ("Night walk") ────────────────────────────────────────────

test('intro plays: follower walks in, then the title settles and PRESS START shows', async ({ page }) => {
  await page.goto('/?debug&title=1');
  const title = page.locator('[data-testid=title-screen]');
  await title.waitFor();
  await expect(title).toHaveAttribute('data-phase', 'intro');
  await expect(page.locator('.title-press-start')).toBeHidden();

  // The walk, sampled deterministically: seek the follower's walk animation (currentTime counts
  // from mount, delay included). 300 ms delay, steps(36) over 1700 ms from -144u: at 1300 ms,
  // 1000 ms in = 21 steps of 4u = -60u.
  const walk = await page.evaluate(() => {
    const el = document.querySelector('.title-follower')!;
    const anim = el.getAnimations()[0];
    const u = parseFloat(getComputedStyle(el).getPropertyValue('--u'));
    const x = () => new DOMMatrixReadOnly(getComputedStyle(el).transform).e;
    anim.pause();
    anim.currentTime = 0;
    const start = x();
    anim.currentTime = 1300;
    const mid = x();
    anim.play();
    return { u, start, mid };
  });
  expect(walk.u).toBeGreaterThan(0);
  expect(walk.start).toBe(-144 * walk.u);
  expect(walk.mid).toBe(-60 * walk.u);

  await expect(title).toHaveAttribute('data-phase', 'settled', { timeout: 6000 });
  await expect(page.locator('.title-press-start')).toBeVisible();
});

test('any key during the intro dismisses the whole title; player controllable', async ({ page }) => {
  await page.goto('/?debug&title=1');
  const title = page.locator('[data-testid=title-screen]');
  await title.waitFor();
  await expect(title).toHaveAttribute('data-phase', 'intro');

  await page.keyboard.press('Space');
  await expect(title).toHaveCount(0);

  // only now wait for the world, then check the player moves
  await page.waitForFunction(() => !!window.__game);
  await page.locator('canvas').waitFor();
  const before = await tile(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => {
    const t = await tile(page);
    return t.f === 'right' || t.x > before.x;
  }, { timeout: 3000 }).toBe(true);
  await page.keyboard.up('ArrowRight');
});

test('visible Skip button: bottom screen, >= 44px target, an HGSS frame on the native grid, dismisses during the intro', async ({ page }) => {
  await page.goto('/?debug&title=1');
  const title = page.locator('[data-testid=title-screen]');
  await title.waitFor();
  const skip = page.locator('.title-skip');
  await expect(skip).toBeVisible();
  await expect(skip).toHaveAttribute('aria-hidden', 'true');

  const box = (await skip.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const bottom = (await page.locator('.title-bottom').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(bottom.y);
  expect(box.y + box.height).toBeLessThanOrEqual(bottom.y + bottom.height);
  expect(box.x + box.width).toBeLessThanOrEqual(bottom.x + bottom.width);
  expect(box.x).toBeGreaterThan(bottom.x + bottom.width / 2); // right half

  // The title's bottom screen is the real bottom screen's box (border inside, 256x192 native)
  const real = (await page.locator('.bottom-screen').boundingBox())!;
  expect(bottom).toEqual(real);

  // Frame on the native grid: size, border and text offset are whole --u multiples; the body
  // is the overlay cream with the dark 1u outline (pixel review #13: one frame treatment)
  const grid = await skip.evaluate((el) => {
    const u = parseFloat(getComputedStyle(document.querySelector('.shell')!).getPropertyValue('--u'));
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const r = document.createRange();
    r.selectNodeContents(el);
    const t = r.getBoundingClientRect();
    const whole = (n: number) => Number.isInteger(n / u);
    return { w: whole(b.width), h: whole(b.height), textX: whole(t.x - b.x), textY: whole(t.y - b.y), border: parseFloat(cs.borderTopWidth) / u, bg: cs.backgroundColor, borderColor: cs.borderTopColor };
  });
  expect(grid).toEqual({ w: true, h: true, textX: true, textY: true, border: 1, bg: 'rgb(255, 246, 220)', borderColor: 'rgb(42, 42, 54)' });

  await skip.click();
  await expect(title).toHaveCount(0);
});

test('reduced motion: no title screen at all, player controllable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadFull(page, '/?debug&title=1');
  await expect(page.locator('[data-testid=title-screen]')).toHaveCount(0);
  const before = await tile(page);
  await page.locator('.top-screen').focus();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => {
    const t = await tile(page);
    return t.f === 'right' || t.x > before.x;
  }, { timeout: 3000 }).toBe(true);
  await page.keyboard.up('ArrowRight');
});

// ── QuickLinks stay interactive ───────────────────────────────────────────────

test('QuickLinks can be clicked while the title screen is showing', async ({ page }) => {
  await loadFull(page, '/?debug&title=1');
  await expect(page.locator('[data-testid=title-screen]')).toBeVisible();
  // elementFromPoint at the QuickLink centre must resolve to the anchor (not the title overlay)
  const ql = page.locator('.quick-links a').first();
  const box = await ql.boundingBox();
  expect(box).not.toBeNull();
  const topEl = await page.evaluate(({ cx, cy }) => {
    const el = document.elementFromPoint(cx, cy);
    return el?.closest('a') ? 'A' : el?.tagName ?? 'none';
  }, { cx: box!.x + box!.width / 2, cy: box!.y + box!.height / 2 });
  expect(topEl).toBe('A');
});
