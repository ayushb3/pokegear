import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const json = (f: string) => JSON.parse(readFileSync(new URL(`../src/content/${f}`, import.meta.url), 'utf8'));
const DEX = json('pokedex.json') as { slug: string; title: string; what: string; links: { label: string; url?: string }[] }[];
const card = json('trainer-card.json') as { pitch: { lines: string[] } };

test.describe('plain about page', () => {
  test.use({ javaScriptEnabled: false });

  test('renders with JS disabled: pitch, a card per Pokédex entry, links, no scripts', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('h1')).toHaveText('Ayush Basu');
    for (const line of card.pitch.lines) await expect(page.locator('body')).toContainText(line);
    await expect(page.getByRole('heading', { name: 'Experience' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
    await expect(page.locator('article.card')).toHaveCount(DEX.length);
    for (const e of DEX) {
      const c = page.locator('article.card', { has: page.getByRole('link', { name: e.title, exact: true }) });
      await expect(c.getByRole('link', { name: e.title, exact: true })).toHaveAttribute('href', `/projects/${e.slug}`);
      await expect(c).toContainText(e.what);
      for (const l of e.links.filter((x) => x.url)) await expect(c.getByRole('link', { name: l.label })).toHaveAttribute('href', l.url!);
    }
    await expect(page.getByRole('link', { name: 'Résumé (PDF)' })).toHaveAttribute('href', '/resume.pdf');
    await expect(page.getByRole('link', { name: /Walk into the room/ }).first()).toHaveAttribute('href', '/?open=card');
    expect(await page.locator('script').count()).toBe(0);
    await expect(page.locator('body')).not.toContainText('$');
  });

  test('no sideways scroll on a phone', async ({ page }) => {
    await page.goto('/about');
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.iw);
  });
});
