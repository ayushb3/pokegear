import { expect, test, type Page } from '@playwright/test';
import { advanceDialogue, dismissAll, load, overlayCount, tile } from '../helpers';

/** STRICT: the overlay does not scroll and every visible descendant's box sits inside the overlay's box. */
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

async function openMonitor(page: Page) {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('monitor'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  const opened = await tile(page);
  await advanceDialogue(page);
  await expect(page.locator('[data-testid=monitor-board]')).toBeVisible();
  return opened;
}

const minuteOf = (page: Page) => page.locator('[data-testid=monitor-board]').getAttribute('data-minute').then(Number);

test('monitor: SIM ticker board ticks, charts on the top screen, B backs out to the same tile', async ({ page }) => {
  const opened = await openMonitor(page);
  // wall-mounted (x10-11, y1): the player uses it from the floor tile below, facing up
  expect(opened.y).toBe(2);
  expect([10, 11]).toContain(opened.x);
  expect(opened.f).toBe('up');
  const board = page.locator('[data-testid=monitor-board]');
  await expect(page.locator('[data-testid=monitor-sim]')).toHaveText('SIM');
  await expect(page.locator('[data-testid=monitor-clock]')).toBeVisible();
  await expect(board.locator('.mon-row')).toHaveCount(3);
  await expect(board).toContainText('Simulated');
  await expectFits(page, 'monitor-board');

  // the simulated clock advances
  const m0 = await minuteOf(page);
  await expect.poll(() => minuteOf(page), { timeout: 10_000 }).toBeGreaterThan(m0);

  // selection
  await expect(board).toHaveAttribute('data-selected', 'OSHA');
  await page.keyboard.press('ArrowDown');
  await expect(board).toHaveAttribute('data-selected', 'ROTM');

  // A: chart on the top screen
  await page.keyboard.press('Space');
  const top = page.locator('.top-screen [data-testid=monitor-chart-top]');
  await expect(top).toBeVisible();
  await expect(top).toHaveAttribute('data-symbol', 'ROTM');
  expect(await top.locator('[data-candle]').count()).toBeGreaterThanOrEqual(3);
  await expectFits(page, 'monitor-chart-top');
  await expectFits(page, 'monitor-board');
  const c0 = await top.locator('[data-candle]').count();
  await expect.poll(() => top.locator('[data-candle]').count(), { timeout: 15_000 }).toBeGreaterThan(c0);

  // A cycles the symbol
  await page.keyboard.press('Space');
  await expect(top).toHaveAttribute('data-symbol', 'PKMN');

  // B: back to the board, B: closed
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=monitor-chart-top]')).toHaveCount(0);
  await expect(board).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => overlayCount(page)).toBe(0);
  expect(await tile(page)).toEqual(opened);
});

test('monitor: reduced motion does not tick', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMonitor(page);
  const m0 = await minuteOf(page);
  await page.waitForTimeout(1500);
  expect(await minuteOf(page)).toBe(m0);
  await expectFits(page, 'monitor-board');
  await dismissAll(page);
});
