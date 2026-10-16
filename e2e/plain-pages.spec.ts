import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

const json = (f: string) => JSON.parse(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'));
const places = json('content/places.json') as { sample: boolean; places: { name: string; line: string }[] };
const piano = json('content/piano.json') as { videoUrl: string | null; pieceCredit: { title: string; url?: string }; nowPracticing: { text: string } };
const assets = json('assets/assets.json') as Record<string, { path?: string; placeholder?: boolean }>;
const journalDir = new URL('../src/content/journal/', import.meta.url);
const entries = readdirSync(journalDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => readFileSync(new URL(f, journalDir), 'utf8'))
  .filter((raw) => !/^placeholder:\s*true\s*$/m.test(raw.split(/^---$/m)[1] ?? ''))
  .map((raw) => ({ date: /^date:\s*(.+)$/m.exec(raw)![1]!.trim(), title: /^title:\s*(.+)$/m.exec(raw)![1]!.trim() }));

const PAGES = ['/places', '/log', '/music'];

test.describe('plain twin pages', () => {
  test.use({ javaScriptEnabled: false });

  test('/places lists every place with its line', async ({ page }) => {
    await page.goto('/places');
    await expect(page.locator('h1')).toHaveText('Places');
    for (const p of places.places) await expect(page.locator('li', { hasText: p.name }).first()).toContainText(p.line);
    if (places.sample) await expect(page.locator('.tag')).toHaveText('Sample');
    else await expect(page.locator('.tag')).toHaveCount(0);
  });

  test('/log lists the entries newest first with date and title', async ({ page }) => {
    await page.goto('/log');
    await expect(page.locator('h1')).toHaveText('Commit log');
    const cards = page.locator('article.card');
    await expect(cards).toHaveCount(entries.length);
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    for (const [i, e] of sorted.entries()) {
      await expect(cards.nth(i).locator('h3')).toHaveText(e.title);
      await expect(cards.nth(i).locator('time')).toHaveText(e.date);
    }
  });

  test('/music shows the piano text and a MIDI link from the asset slot', async ({ page }) => {
    await page.goto('/music');
    await expect(page.locator('h1')).toHaveText('Music');
    await expect(page.locator('body')).toContainText(piano.nowPracticing.text);
    await expect(page.locator('body')).toContainText(piano.pieceCredit.title);
    if (piano.pieceCredit.url) await expect(page.getByRole('link', { name: 'Arrangement' })).toHaveAttribute('href', piano.pieceCredit.url);
    const slot = assets['music.piece']!;
    if (slot.path && !slot.placeholder) await expect(page.getByRole('link', { name: 'Download MIDI' })).toHaveAttribute('href', slot.path);
    else await expect(page.getByRole('link', { name: 'Download MIDI' })).toHaveCount(0);
    if (!piano.videoUrl) await expect(page.getByRole('link', { name: 'Video' })).toHaveCount(0);
  });

  for (const path of PAGES) {
    test(`${path}: no scripts, links home and to /about, no sideways scroll`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      expect(await page.locator('script').count()).toBe(0);
      await expect(page.getByRole('link', { name: /Walk around the house/ }).first()).toHaveAttribute('href', '/');
      await expect(page.getByRole('link', { name: 'About Ayush' }).first()).toHaveAttribute('href', '/about');
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('plain twin pages are linked', () => {
  test.use({ javaScriptEnabled: false });

  test('the noscript list on / links /music, /log, /places and they resolve', async ({ page, request }) => {
    await page.goto('/');
    for (const href of PAGES) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
      expect((await request.get(href)).status()).toBe(200);
    }
  });

  test('with JS off the page scrolls with the wheel and the noscript links (incl. /about) are reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    await page.mouse.move(100, 300);
    await page.mouse.wheel(0, 2000);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    for (const href of ['/about', ...PAGES]) {
      const link = page.locator(`main a[href="${href}"]`).first();
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
      await expect(link).toBeInViewport();
    }
  });

  test('/about links the twins and its og:image is /card.png', async ({ page, request }) => {
    await page.goto('/about');
    for (const href of PAGES) await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/card\.png$/);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', /\/card\.png$/);
    expect((await request.get('/card.png')).status()).toBe(200);
  });
});
