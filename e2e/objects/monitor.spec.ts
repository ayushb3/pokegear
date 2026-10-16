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

test('monitor: Market | Journal tabs; the Journal bar chart, day detail and TradeDesk row; B backs out', async ({ page }) => {
  const opened = await openMonitor(page);
  const board = page.locator('[data-testid=monitor-board]');
  // opens on Market
  await expect(page.locator('[data-testid=monitor-tab-market]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-testid=monitor-tab-journal]')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('[data-testid=monitor-sim]')).toHaveText('SIM');

  // R (E) -> Journal
  await page.keyboard.press('KeyE');
  const chart = page.locator('[data-testid=monitor-chart]');
  await expect(chart).toBeVisible();
  await expect(board).toHaveCount(0);
  await expect(page.locator('[data-testid=monitor-tab-journal]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-testid=monitor-sample]')).toHaveText('Sample data');
  await expect(page.locator('[data-testid=monitor-month]')).toHaveText('Oct 2026');
  expect(await chart.locator('.bar-col').count()).toBeGreaterThan(15);
  for (const id of ['month', 'days', 'trades', 'avg']) await expect(page.locator(`[data-testid=monitor-stat-${id}]`)).toBeVisible();
  await expectFits(page, 'monitor-chart');

  // left / right step the bars (the d-pad stays with the page; it does not switch tabs)
  await page.keyboard.press('ArrowLeft');
  await expect(chart).toBeVisible();
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText(/R|No trade|Not logged/);

  // tap Oct 7 (a rule-break day), A = day detail
  await page.locator('[data-testid=monitor-day-7]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText('-2.1R');
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText('Loss limit');
  await page.keyboard.press('Space');
  const day = page.locator('[data-testid=monitor-day]');
  await expect(day).toContainText('Broke: Daily loss limit');
  await expect(day).toContainText('Broke: Closed by 8:00');
  await expectFits(page, 'monitor-day');
  // B: day -> chart
  await page.keyboard.press('Escape');
  await expect(chart).toBeVisible();

  // down = the TradeDesk link row
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText('TradeDesk');
  await expectFits(page, 'monitor-chart');

  // tap the Market tab -> back to the board, the clock kept running (it lives above the pages)
  await page.locator('[data-testid=monitor-tab-market]').dispatchEvent('pointerdown');
  await expect(board).toBeVisible();
  await expect(page.locator('[data-testid=monitor-tab-market]')).toHaveAttribute('aria-selected', 'true');
  expect(await minuteOf(page)).toBeGreaterThan(90);
  // Q from Market wraps to Journal, Q again back
  await page.keyboard.press('KeyQ');
  await expect(chart).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(board).toBeVisible();

  // B on a page root closes
  await page.keyboard.press('Escape');
  await expect.poll(() => overlayCount(page)).toBe(0);
  expect(await tile(page)).toEqual(opened);
});

test('monitor: the Journal TradeDesk row opens the TradeDesk Pokedex entry', async ({ page }) => {
  await openMonitor(page);
  await page.locator('[data-testid=monitor-tab-journal]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=monitor-chart]')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText('TradeDesk');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=dex-entry-page]')).toContainText('TradeDesk', { timeout: 5_000 });
  await dismissAll(page);
});

test('monitor: the Journal selected-day outline stays inside the box at both ends; marks are >= 2 texels', async ({ page }) => {
  await openMonitor(page);
  await page.keyboard.press('KeyE');
  const chart = page.locator('[data-testid=monitor-chart]');
  await expect(chart).toBeVisible();
  const outlineInside = () =>
    chart.evaluate((o) => {
      const box = o.getBoundingClientRect();
      const bar = o.querySelector('.oframe-bar')!.getBoundingClientRect();
      const col = o.querySelector('.bar-col.sel')!;
      const sel = col.getBoundingClientRect();
      const w = parseFloat(getComputedStyle(col).outlineWidth);
      // t: clear of the title bar (the outline never covers the tabs)
      return { l: sel.left - w - box.left, r: box.right - (sel.right + w), t: sel.top - w - bar.bottom, b: box.bottom - (sel.bottom + w) };
    });
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  let m = await outlineInside();
  expect(Math.min(m.l, m.r, m.t, m.b)).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft');
  m = await outlineInside();
  expect(Math.min(m.l, m.r, m.t, m.b)).toBeGreaterThanOrEqual(0);

  const u = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.bottom-screen')!).getPropertyValue('--u')) || 1);
  const thin = await chart.evaluate((o, unit) => {
    const bad: string[] = [];
    for (const el of o.querySelectorAll('.bar-abs, .bar-none, .bar-cross-pos svg')) {
      const r = el.getBoundingClientRect();
      if (r.height < 2 * unit - 0.5 || r.width < 2 * unit - 0.5) bad.push(`${r.width}x${r.height}`);
    }
    return { bad, crosses: [...o.querySelectorAll('.bar-cross-pos svg')].length };
  }, u);
  expect(thin.bad).toEqual([]);
  expect(thin.crosses).toBeGreaterThan(0);
  await dismissAll(page);
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
