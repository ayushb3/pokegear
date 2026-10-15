import { expect, test, type Page } from '@playwright/test';
import { advanceDialogue, dismissAll, load, tile } from '../helpers';

declare global {
  interface Window {
    __synth: { contexts: number; osc: { type: string; freq: number }[]; noise: number; live(from?: number): number };
  }
}

/** Patch AudioContext BEFORE the app loads so every oscillator the synth starts is recorded. */
async function patchAudio(page: Page) {
  await page.addInitScript(() => {
    const log = { contexts: 0, osc: [] as { type: string; freq: number }[], noise: 0 };
    const all: { o: OscillatorNode; stopAt: number; ctx: AudioContext }[] = [];
    // oscillators that will still be sounding more than 50 ms from now (never stopped, or stop scheduled later)
    const synth = Object.assign(log, { live: (from = 0) => all.slice(from).filter((r) => r.stopAt > r.ctx.currentTime + 0.05).length });
    window.__synth = synth;
    const Real = window.AudioContext;
    class Spy extends Real {
      constructor(...a: ConstructorParameters<typeof AudioContext>) {
        super(...a);
        log.contexts++;
      }
      createOscillator() {
        const o = super.createOscillator();
        const rec = { o, stopAt: Infinity, ctx: this as unknown as AudioContext };
        all.push(rec);
        const stop = o.stop.bind(o);
        o.stop = (when?: number) => {
          rec.stopAt = when ?? 0;
          stop(when);
        };
        const start = o.start.bind(o);
        o.start = (when?: number) => {
          log.osc.push({ type: o.type, freq: o.frequency.value });
          start(when);
        };
        return o;
      }
    }
    window.AudioContext = Spy as unknown as typeof AudioContext;
  });
}

async function openPiano(page: Page) {
  await page.evaluate(() => window.__game!.goTo('piano'));
  await expect(page.locator('[data-testid=dialogue]')).toContainText('sat down at the piano', { timeout: 20_000 });
  await advanceDialogue(page);
  await expect(page.locator('[data-testid=piano]')).toBeVisible();
}
/** STRICT: the overlay does not scroll and every visible descendant's box sits inside the overlay's box.
 *  (Lines a TextPages has paged out live in `.tp-flow` behind `.tp-view`'s window, so that window is what counts.) */
async function expectFits(page: Page, testid: string) {
  const r = await page.locator(`[data-testid=${testid}]`).evaluate((o) => {
    const box = o.getBoundingClientRect();
    const bad: string[] = [];
    for (const el of o.querySelectorAll('*')) {
      if (el.tagName === 'STYLE' || el.closest('.tp-flow')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const c = el.getBoundingClientRect();
      if (c.width === 0 && c.height === 0) continue;
      if (c.top < box.top - 0.5 || c.bottom > box.bottom + 0.5 || c.left < box.left - 0.5 || c.right > box.right + 0.5) {
        bad.push(`${el.tagName}.${String((el as unknown as SVGElement).className instanceof SVGAnimatedString ? '' : (el as HTMLElement).className)}`);
      }
    }
    return { bad, sh: o.scrollHeight, ch: o.clientHeight, sw: o.scrollWidth, cw: o.clientWidth };
  });
  expect(r.bad).toEqual([]);
  expect(r.sh).toBeLessThanOrEqual(r.ch);
  expect(r.sw).toBeLessThanOrEqual(r.cw);
}

/**
 * Assert that:
 * - The practicing / credit line is at most 2 lines tall (scrollHeight ≤ 2 × lineHeight, rounding to 1px)
 * - Both the text line and the keys container are fully inside the overlay (no clipping)
 */
async function expectTwoLineLayout(page: Page) {
  // Text line: ≤ 2 lines — scrollHeight should not exceed 2 × computed line-height
  const lineCheck = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid=piano-practicing],[data-testid=piano-credit]');
    if (!el) return { ok: false, reason: 'line element not found' };
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
    const maxH = lh * 2 + 1; // 1px rounding tolerance
    const sh = el.scrollHeight;
    const bh = el.getBoundingClientRect().height;
    return { ok: sh <= maxH, scrollH: sh, boundH: bh, maxH, lh };
  });
  expect(lineCheck.ok, `practicing line scrollHeight ${lineCheck.scrollH} > 2×lineHeight ${lineCheck.maxH}`).toBe(true);

  // Keys: fully inside the overlay (no clipping at bottom)
  const keysCheck = await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>('[data-testid=piano]');
    const keys = document.querySelector<HTMLElement>('[data-testid=piano-keys]');
    if (!overlay || !keys) return { ok: false, reason: 'missing elements' };
    const ob = overlay.getBoundingClientRect();
    const kb = keys.getBoundingClientRect();
    return { ok: kb.bottom <= ob.bottom + 0.5, keysBottom: kb.bottom, overlayBottom: ob.bottom };
  });
  expect(keysCheck.ok, `keys bottom ${keysCheck.keysBottom} > overlay bottom ${keysCheck.overlayBottom}`).toBe(true);
}
const freqs = (page: Page) => page.evaluate(() => window.__synth.osc.map((o) => Math.round(o.freq * 10) / 10));
const lit = (page: Page, midi: number) => page.locator(`[data-testid=piano-key-${midi}]`);

test('piano: muted nudge, keys light silently, tap the note to turn sound on, then keys / cursor / piece all sound', async ({ page }) => {
  await patchAudio(page);
  await load(page);
  const before = await tile(page);
  await openPiano(page);
  const opened = await tile(page);

  // placeholders and slots
  await expect(page.locator('[data-testid=piano-sample]')).toHaveCount(0); // real piece, no sample tag
  await expectFits(page, 'piano'); // idle: control, nowPracticing, muted note, keys
  await expectTwoLineLayout(page); // practicing line ≤ 2 lines; keys inside overlay
  await expect(page.locator('[data-testid=piano-practicing]')).toContainText('Now practicing: in the pool, Kensuke Ushio (Chainsaw Man). Just starting.');
  await expect(page.locator('[data-testid=piano-video]')).toHaveCount(0); // videoUrl is null

  // muted: the note is shown, keys still light, nothing is synthesised and no AudioContext exists
  await expect(page.locator('[data-testid=piano-muted]')).toContainText('Sound off');
  await page.keyboard.down('KeyA');
  await expect(lit(page, 60)).toHaveAttribute('data-lit', '1');
  await page.keyboard.up('KeyA');
  await expect(lit(page, 60)).not.toHaveAttribute('data-lit', '1');
  expect(await page.evaluate(() => window.__synth.osc.length)).toBe(0);
  expect(await page.evaluate(() => window.__synth.contexts)).toBe(0);

  // tapping the note toggles the same sound state the speaker uses
  await page.locator('[data-testid=piano-muted]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=sound]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid=piano-muted]')).toHaveCount(0);

  // computer keys: A = C4, D = E4, W = C#4 (the host's movement keys do not fire)
  await page.keyboard.down('KeyA');
  await page.keyboard.down('KeyD');
  await expect(lit(page, 60)).toHaveAttribute('data-lit', '1');
  await expect(lit(page, 64)).toHaveAttribute('data-lit', '1');
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyW');
  let f = await freqs(page);
  expect(f).toEqual(expect.arrayContaining([261.6, 329.6, 277.2]));
  expect(await tile(page)).toEqual(opened); // A / W did not walk the player

  // tap / click a key (pointer) and the arrows + A cursor
  await lit(page, 72).dispatchEvent('pointerdown');
  await lit(page, 72).dispatchEvent('pointerup');
  await page.keyboard.press('ArrowLeft'); // cursor 72 -> 71
  await page.keyboard.press('Space');
  await expect(lit(page, 71)).toHaveAttribute('data-lit', '1');
  f = await freqs(page);
  expect(f).toEqual(expect.arrayContaining([523.3, 493.9]));
  // pulse (custom wave) for the keys
  expect(await page.evaluate(() => window.__synth.osc.every((o) => o.type === 'custom'))).toBe(true);

  // Ayush's piece: melody on pulse, bass on triangle; keys light up; Stop toggles
  const piece = page.locator('[data-testid=piano-piece]');
  const n0 = await page.evaluate(() => window.__synth.osc.length);
  await piece.dispatchEvent('pointerdown');
  await expect(piece).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__synth.osc.length)).toBeGreaterThan(n0 + 20);
  // while it plays the credit takes the nowPracticing line: "in the pool, Kensuke Ushio. Arrangement"
  const credit = page.locator('[data-testid=piano-credit]');
  await expect(credit).toContainText('in the pool, Kensuke Ushio. Arrangement');
  // credit line wraps to ≤ 2 lines (no horizontal overflow)
  expect(await credit.evaluate((e) => e.scrollHeight <= parseFloat(getComputedStyle(e).lineHeight) * 2 + 1)).toBe(true);
  const link = page.locator('[data-testid=piano-credit-link]');
  await expect(link).toHaveText('Arrangement');
  await expect(link).toHaveAttribute('href', 'https://musescore.com/user/39419628/scores/28891190');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expectFits(page, 'piano'); // playing
  await expectTwoLineLayout(page); // credit line ≤ 2 lines; keys inside overlay

  const types = await page.evaluate(() => [...new Set(window.__synth.osc.map((o) => o.type))]);
  expect(types.sort()).toEqual(['custom', 'triangle']);
  await expect(page.locator('[data-testid=piano-keys] [data-lit]').first()).toBeVisible();
  await piece.dispatchEvent('pointerdown');
  await expect(piece).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-testid=piano-keys] [data-lit]')).toHaveCount(0);
  // Stop cuts every pre-scheduled note, not just the visuals
  await expect.poll(() => page.evaluate((n) => window.__synth.live(n), n0)).toBe(0);

  // Play again after Stop starts afresh: no doubled voices (the first run's notes are all cut)
  const n1 = await page.evaluate(() => window.__synth.osc.length);
  await piece.dispatchEvent('pointerdown');
  await expect(piece).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__synth.osc.length)).toBeGreaterThan(n1 + 20);
  const perRun = await page.evaluate(() => window.__synth.osc.length) - n1;
  expect(await page.evaluate((n) => window.__synth.live(n), n1)).toBe(perRun);
  await piece.dispatchEvent('pointerdown');
  await expect(piece).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate((n) => window.__synth.live(n), n1)).toBe(0);

  // leaving the overlay while it plays stops it
  const n2 = await page.evaluate(() => window.__synth.osc.length);
  await piece.dispatchEvent('pointerdown');
  await expect(piece).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__synth.osc.length)).toBeGreaterThan(n2 + 20);
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate((n) => window.__synth.live(n), n2)).toBe(0);
  await dismissAll(page);
  expect(await tile(page)).toEqual(opened);
  expect(opened.m).toBe(false);
  expect(before).toBeDefined();
});

/** Focused layout test: practicing line ≤ 2 lines AND keyboard fully inside overlay at 375×812 and 1440×900.
 *  The playwright.config.ts projects run every test in both viewports, so this covers both. */
test('piano: practicing line ≤ 2 lines and keyboard inside overlay at all viewports', async ({ page }) => {
  await load(page);
  await openPiano(page);
  await expectFits(page, 'piano');
  await expectTwoLineLayout(page);
  // also check while the piece credit is shown (start playing, then check)
  // (sound is muted by default so this is safe: no AudioContext created)
  // credit line is shown when playing — we cannot start the piece without sound unlock on all browsers,
  // so we verify the idle practicing line only here. The full-sound test above covers credit.
});

test('piano: reduced motion keeps the light but drops the bounce', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  await openPiano(page);
  await page.keyboard.down('KeyS');
  const key = lit(page, 62);
  await expect(key).toHaveAttribute('data-lit', '1');
  expect(await key.evaluate((e) => getComputedStyle(e).transform)).toBe('none');
  expect(await key.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  await page.keyboard.up('KeyS');
});
