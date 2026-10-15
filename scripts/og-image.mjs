// Generates the share images from the CURRENT site:
//   public/og.png   (1200x630) the bedroom at 3x next to the name and title
//   public/card.png the Trainer Card front (/?open=card), the card only, at 2x
// Name and title come from src/content/resume.json (the shared source of truth).
// Usage: build the site, serve dist/, then run the script against it:
//   npx astro build
//   E2E_SKIP_BUILD=1 E2E_PORT=4416 node scripts/e2e-server.mjs &
//   node scripts/og-image.mjs http://localhost:4416      (default http://localhost:4321)
// Captures skip the title screen and idle tour via sessionStorage flags (not ?debug, which draws the tile grid).
// Set PLAYWRIGHT_CHROMIUM_PATH to use a specific Chromium binary.
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:4321';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outOg = resolve(root, 'public/og.png');
const outCard = resolve(root, 'public/card.png');
const { name, title } = JSON.parse(await readFile(resolve(root, 'src/content/resume.json'), 'utf8'));
await mkdir(dirname(outOg), { recursive: true });

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  // 1200x1200 @1x: the stacked layout picks scale 3, so the top screen is exactly 768x576 device px
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
  // no ?debug: it draws the tile grid. Mark the title screen and idle tour as already done instead.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('title-shown', '1');
      sessionStorage.setItem('idle-tour-done', '1');
    } catch {}
  });
  await page.goto(base + '/?day=1');
  await page.locator('canvas').waitFor();
  await page.waitForSelector('.world-loading', { state: 'detached' });
  await page.waitForTimeout(900);
  const top = page.locator('.top-screen');
  const box = await top.boundingBox();
  if (!box || box.width !== 768 || box.height !== 576) {
    throw new Error(`room is not at an integer 3x scale: ${JSON.stringify(box)}`);
  }
  const room = await top.screenshot();

  // Trainer Card front: 2x means --px = 2, i.e. a 512x384 bottom screen
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto(base + '/?day=1&open=card');
  const screen = page.locator('.bottom-screen');
  await screen.waitFor();
  const card = page.locator('[data-testid="trainer-card"]');
  await card.waitFor();
  await page.waitForTimeout(900);
  const sb = await screen.boundingBox();
  if (!sb || sb.width !== 512 || sb.height !== 384) {
    throw new Error(`bottom screen is not at an integer 2x scale: ${JSON.stringify(sb)}`);
  }
  // the card itself (front page), without the on-screen A/B buttons
  await card.screenshot({ path: outCard });
  console.log('wrote', outCard);

  // compose on a page that already has the pixel font loaded
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(base + '/projects/bubblychef');
  await page.evaluate(async ({ png, name, title }) => {
    await document.fonts.ready;
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;width:1200px;height:630px;overflow:hidden;background:#16161d;display:flex;align-items:center;padding:0;font-family:"HGSS Pixel",monospace;color:#e9e4cf;-webkit-font-smoothing:none';
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    document.body.innerHTML = `
      <img src="data:image/png;base64,${png}" style="width:768px;height:576px;margin-left:36px;border:4px solid #2b2b38;image-rendering:pixelated">
      <div style="margin-left:40px;line-height:1.25">
        <div style="font-size:48px">${esc(name)}</div>
        <div style="font-size:32px;color:#b9b295;margin-top:12px">${esc(title)}</div>
      </div>`;
  }, { png: room.toString('base64'), name, title });
  await page.waitForTimeout(200);
  await page.screenshot({ path: outOg });
  console.log('wrote', outOg);
} finally {
  await browser.close();
}
