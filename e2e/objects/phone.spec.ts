import { expect, test, type Page } from '@playwright/test';
import { dismissAll, load, tile, waitRoom } from '../helpers';
import { readFileSync } from 'node:fs';
const resume = JSON.parse(readFileSync('src/content/resume.json', 'utf8')) as { email: string; linkedin: string; github: string };

async function openMenu(page: Page) {
  await page.locator('[data-testid=start]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=start-menu]')).toBeVisible();
}

async function openPhone(page: Page) {
  await openMenu(page);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=phone]')).toBeVisible({ timeout: 5000 });
}

async function openMap(page: Page) {
  await openMenu(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=townmap]')).toBeVisible({ timeout: 5000 });
}

test.describe('Pokégear: Phone and Map', () => {
  test('Start -> 4x Down -> A opens the Phone on Email; links are real anchors from resume.json', async ({ page }) => {
    await load(page);
    await openPhone(page);
    await expect(page.locator('[data-testid=phone-detail]')).toHaveText(resume.email);
    const links = page.locator('[data-testid=phone-links] a');
    await expect(links).toHaveCount(4);
    await expect(links.nth(0)).toHaveAttribute('href', `mailto:${resume.email}`);
    await expect(links.nth(1)).toHaveAttribute('href', resume.linkedin);
    await expect(links.nth(2)).toHaveAttribute('href', resume.github);
    await expect(links.nth(3)).toHaveAttribute('href', '/resume.pdf');
  });

  test('Down selects the next contact; A opens a new tab; B closes on the same tile', async ({ page, context }) => {
    await load(page);
    const before = await tile(page);
    await openPhone(page);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-testid=phone-detail]')).toContainText('linkedin.com/in/');
    const popup = context.waitForEvent('page');
    await page.keyboard.press('Space');
    const p = await popup;
    await p.close();
    await page.keyboard.press('Escape');
    await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0, { timeout: 3000 });
    expect(await tile(page)).toEqual(before);
  });

  test('the Phone box does not clip', async ({ page }) => {
    await load(page);
    await openPhone(page);
    const inner = await page.evaluate(() => {
      const el = document.querySelector('[data-testid=phone]') as HTMLElement;
      return { sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth };
    });
    expect(inner.sh).toBeLessThanOrEqual(inner.ch + 1);
    expect(inner.sw).toBeLessThanOrEqual(inner.cw + 1);
  });

  test('Start -> Map opens the Town Map; B closes back to the same tile', async ({ page }) => {
    await load(page);
    const before = await tile(page);
    await openMap(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0, { timeout: 3000 });
    expect(await tile(page)).toEqual(before);
  });

  test('from downstairs: Start -> Phone and Start -> Map work', async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__game!.goTo('fridge'));
    await waitRoom(page, 'downstairs');
    await expect.poll(() => page.locator('.bottom-screen .overlay').count(), { timeout: 15_000 }).toBeGreaterThan(0);
    await dismissAll(page);
    const before = await tile(page);
    await openPhone(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0, { timeout: 3000 });
    await openMap(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0, { timeout: 3000 });
    expect(await tile(page)).toEqual(before);
  });
});
