import { expect, test, type Page } from '@playwright/test';
import { advanceDialogue, dismissAll, load, tile } from '../helpers';

async function openJournal(page: Page) {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('journal'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  const opened = await tile(page);
  await advanceDialogue(page);
  return opened;
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
const ind = (page: Page) => page.locator('[data-testid=journal-indicator]');
const proj = (page: Page) => page.locator('[data-testid=journal-project]');
const pageText = (page: Page) => page.locator('[data-testid=journal-page]').innerText();

// Placeholder entries are filtered out, so only the two real entries show: Portfolio (2026-10-03) and BubblyChef (2026-09-28).
test('object journal: opens on the project with the newest entry, prev/next stay put on a single entry, B closes on the same tile', async ({ page }) => {
  const opened = await openJournal(page);
  await expectFits(page, 'journal');
  const tabs = page.locator('[data-testid=journal-tab]');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.first()).toHaveAttribute('data-project', 'portfolio'); // owns 2026-10-03, the newest entry
  await expect(proj(page)).toHaveText('Portfolio');
  await expect(ind(page)).toHaveAttribute('data-index', '1');
  await expect(ind(page)).toHaveAttribute('data-count', '1');
  expect(await pageText(page)).toContain('2026-10-03');
  await page.keyboard.press('ArrowRight');
  await expect(ind(page)).toHaveAttribute('data-index', '1'); // one entry: stays
  await page.keyboard.press('ArrowLeft');
  await expect(ind(page)).toHaveAttribute('data-index', '1');
  await expect(proj(page)).toHaveText('Portfolio');
  await dismissAll(page);
  expect(await tile(page)).toEqual(opened);
});

test('journal: up/down and tapping a tab switch project, each showing its newest entry', async ({ page }) => {
  await openJournal(page);
  const tabs = page.locator('[data-testid=journal-tab]');
  await page.keyboard.press('ArrowDown');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(ind(page)).toHaveAttribute('data-index', '1');
  await expect(proj(page)).toHaveText('BubblyChef');
  await expectFits(page, 'journal');
  const text = await pageText(page);
  expect(text).toContain('2026-09-28');
  expect(text).not.toContain('(sample)'); // approved copy, no longer a sample
  await page.keyboard.press('ArrowUp');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  expect(await pageText(page)).toContain('2026-10-03');
  await tabs.nth(1).dispatchEvent('pointerdown');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(await pageText(page)).toContain('2026-09-28');
  await dismissAll(page);
});

test('journal: A pages through the entry text; on the last page of a single entry it stays put', async ({ page }) => {
  await openJournal(page);
  await expect(ind(page)).toHaveAttribute('data-index', '1');
  const tp = page.locator('[data-testid=text-pages]');
  const pages = Number(await tp.getAttribute('data-pages'));
  for (let i = 1; i < pages; i++) {
    await page.keyboard.press('Space');
    await expect(tp).toHaveAttribute('data-page', String(i + 1));
  }
  await page.keyboard.press('Space'); // last page + A -> no older entry in this project
  await expect(ind(page)).toHaveAttribute('data-index', '1');
  await expect(proj(page)).toHaveText('Portfolio');
  await dismissAll(page);
});

test('journal: the arrows and dots are one row of their own, inside the box, with the arrows side by side', async ({ page }) => {
  await openJournal(page);
  const r = await page.evaluate(() => {
    const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const o = q('[data-testid=journal]');
    const nav = q('.journal .nav');
    const l = q('.journal .btn.l');
    const rr = q('.journal .btn.r');
    const dots = q('[data-testid=journal-indicator]');
    const scrn = q('.journal .scrn');
    return { navInside: nav.bottom <= o.bottom && nav.top >= scrn.bottom, apart: rr.left - l.right, dotsMid: dots.left > l.right && dots.right < rr.left };
  });
  expect(r.navInside).toBe(true);
  expect(r.apart).toBeGreaterThan(0);
  expect(r.dotsMid).toBe(true);
  await dismissAll(page);
});
