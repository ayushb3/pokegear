import { expect, test, type Page } from '@playwright/test';
import { advanceDialogue, dismissAll, load, tile } from '../helpers';

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

test('object monitor: bar chart -> day detail -> TradeDesk -> B back out to the same tile', async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('monitor'));
  await expect(page.locator('[data-testid=dialogue]')).toContainText('ticking', { timeout: 20_000 });
  const opened = await tile(page);
  await advanceDialogue(page);

  // chart view
  const chart = page.locator('[data-testid=monitor-chart]');
  await expect(chart).toBeVisible();
  await expect(page.locator('[data-testid=monitor-sample]')).toHaveText('Sample data');

  // 4 stat tiles always visible on the chart view
  await expect(page.locator('[data-testid=monitor-stat-month]')).toBeVisible();
  await expect(page.locator('[data-testid=monitor-stat-days]')).toBeVisible();
  await expect(page.locator('[data-testid=monitor-stat-trades]')).toBeVisible();
  await expect(page.locator('[data-testid=monitor-stat-avg]')).toBeVisible();
  await expectFits(page, 'monitor-chart'); // default: the last day (the right-hand end) is selected, its outline is inside

  // select a day with arrows; readout updates
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText(/R|No trade/);

  // click Oct 7 bar (rule-break day)
  await page.locator('[data-testid=monitor-day-7]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText('-2.1R');
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText('Loss limit');

  // open day detail with Space
  await page.keyboard.press('Space');
  const day = page.locator('[data-testid=monitor-day]');
  await expectFits(page, 'monitor-day');
  await expect(day).toContainText('Broke: Daily loss limit');
  await expect(day).toContainText('Broke: Closed by 8:00');
  await page.keyboard.press('Escape');
  await expect(chart).toBeVisible();

  // ArrowDown from a bar goes straight to the TradeDesk link row
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid=monitor-readout]')).toContainText('TradeDesk');
  await expectFits(page, 'monitor-chart');

  // Space on TradeDesk link opens it
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=dex-entry-page]')).toContainText('TradeDesk', { timeout: 5_000 });

  await dismissAll(page);
  expect(await tile(page)).toEqual(opened);
});

test('monitor: the selected-day outline stays inside the box at both ends and chart marks are >= 2 texels', async ({ page }) => {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('monitor'));
  await expect(page.locator('[data-testid=dialogue]')).toContainText('ticking', { timeout: 20_000 });
  await advanceDialogue(page);
  const chart = page.locator('[data-testid=monitor-chart]');
  await expect(chart).toBeVisible();
  const outlineInside = () =>
    chart.evaluate((o) => {
      const box = o.getBoundingClientRect();
      const col = o.querySelector('.bar-col.sel')!;
      const sel = col.getBoundingClientRect();
      const w = parseFloat(getComputedStyle(col).outlineWidth);
      return { l: sel.left - w - box.left, r: box.right - (sel.right + w), t: sel.top - w - box.top, b: box.bottom - (sel.bottom + w) };
    });
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight'); // right-hand end
  let m = await outlineInside();
  expect(Math.min(m.l, m.r, m.t, m.b)).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft'); // left-hand end
  m = await outlineInside();
  expect(Math.min(m.l, m.r, m.t, m.b)).toBeGreaterThanOrEqual(0);

  // marks: every bar / mark is at least 2 native units (--u) in both directions; the rule-break mark is a 6u X (3 cells of 2u)
  const u = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.bottom-screen')!).getPropertyValue('--u')) || 1);
  const thin = await chart.evaluate((o, unit) => {
    const bad: string[] = [];
    for (const el of o.querySelectorAll('.bar-abs, .bar-none, .bar-cross-pos svg')) {
      const r = el.getBoundingClientRect();
      if (r.height < 2 * unit - 0.5 || r.width < 2 * unit - 0.5) bad.push(`${r.width}x${r.height}`);
    }
    const crosses = [...o.querySelectorAll('.bar-cross-pos svg')].map((s) => s.getBoundingClientRect().width);
    return { bad, crosses };
  }, u);
  expect(thin.bad).toEqual([]);
  expect(thin.crosses.length).toBeGreaterThan(0);
  for (const w of thin.crosses) expect(w).toBeGreaterThanOrEqual(6 * u - 0.5);
  await dismissAll(page);
});
