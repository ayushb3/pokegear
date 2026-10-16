import { expect, test, type Page } from '@playwright/test';
import { dismissAll, load } from './helpers';

/** The desktop key hint: "Z <A label>" / "X <B label>" in the pad's top-left corner, built from the open overlay's labels.
 *  Fine pointers only; never on touch; never clipped or overlapping the pad's buttons or the overlay. */

const hint = (page: Page) => page.locator('[data-testid=key-hint]');

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector<HTMLElement>('[data-testid=key-hint]')!;
    const r = box.getBoundingClientRect();
    const hits = (sel: string) => {
      const e = document.querySelector(sel);
      if (!e) return false;
      const o = e.getBoundingClientRect();
      return !(o.right <= r.left || o.left >= r.right || o.bottom <= r.top || o.top >= r.bottom);
    };
    const spans = [...box.querySelectorAll('span')].map((s) => {
      const q = s.getBoundingClientRect();
      return { text: s.textContent, inside: q.left >= r.left - 0.5 && q.right <= r.right + 0.5 && q.top >= r.top - 0.5 && q.bottom <= r.bottom + 0.5 };
    });
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px'));
    return {
      clipped: box.scrollWidth > box.clientWidth,
      overlaps: ['.overlay', '.btn-start', '.btn-sound', '.btn-card', '.lbl-card', '.lbl-b', '.btn-b'].filter(hits),
      spans,
      fontPx: parseFloat(getComputedStyle(box).fontSize) / px,
    };
  });
}

for (const vp of [
  { width: 1440, height: 900 },
  { width: 1024, height: 700 },
]) {
  test(`${vp.width}x${vp.height} (fine pointer): the hint shows the overlay's labels, fits, never overlaps, font stays 16u`, async ({ page }) => {
    await page.setViewportSize(vp);
    await load(page);
    await expect(hint(page)).toHaveCount(0); // the idle bag has no hint
    await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
    await expect(hint(page)).toBeVisible();
    await expect(hint(page).locator('span')).toHaveText(['Z Open', 'X Close']);
    const m = await measure(page);
    expect(m.clipped).toBe(false);
    expect(m.overlaps).toEqual([]);
    expect(m.fontPx).toBe(16);
    for (const s of m.spans) expect(s.inside, s.text).toBe(true);
    await dismissAll(page);
    await expect(hint(page)).toHaveCount(0);
  });
}

test('the hint follows the overlay labels (dialogue: Next / Skip)', async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('bed'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await expect(hint(page).locator('span')).toHaveText(['Z Next', 'X Skip']);
  await dismissAll(page);
});

test('every deep-linked overlay keeps its hint inside its corner', async ({ page }) => {
  for (const open of ['townmap', 'piano', 'journal', 'monitor', 'radio', 'phone', 'photos', 'food', 'card']) {
    await page.goto(`/?debug&open=${open}`);
    await page.waitForFunction(() => !!window.__game);
    await expect(page.locator('.bottom-screen .overlay')).toBeVisible();
    await expect(hint(page)).toBeVisible();
    const m = await measure(page);
    expect(m.clipped, open).toBe(false);
    expect(m.overlaps, open).toEqual([]);
    for (const s of m.spans) expect(s.inside, `${open}: ${s.text}`).toBe(true);
  }
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test('never shown on a touch device', async ({ page }) => {
    await load(page);
    await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
    await expect(page.locator('.bottom-screen .overlay')).toBeVisible();
    await expect(hint(page)).toBeHidden();
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);
  });
});
