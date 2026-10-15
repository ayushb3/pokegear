/**
 * Headless screenshot: open piano overlay at 375x812, save to test-results/shots/ (or $OUT).
 * Run from the worktree root: node scripts/piano-screenshot.mjs
 */
import { chromium } from 'playwright';

const OUT = process.env.OUT ?? 'test-results/shots/piano-2line-phone.png';
const PORT = process.env.E2E_PORT ?? '4405';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

await page.goto(`http://localhost:${PORT}/?debug`);
await page.waitForFunction(() => !!window.__game);
await page.locator('canvas').waitFor();

await page.evaluate(() => window.__game.goTo('piano'));
await page.locator('[data-testid=dialogue]').waitFor({ timeout: 20000 });

for (let i = 0; i < 8 && (await page.locator('[data-testid=dialogue]').count()) > 0; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
}

await page.locator('[data-testid=piano]').waitFor({ timeout: 5000 });
await page.screenshot({ path: OUT, fullPage: false });
console.log('Saved:', OUT);
await browser.close();
