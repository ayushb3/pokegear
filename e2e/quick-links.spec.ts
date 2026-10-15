import { expect, test } from '@playwright/test';
import { stackScale } from '../src/world/scale';
import { load } from './helpers';

import { readFileSync } from 'node:fs';
const json = (f: string) => JSON.parse(readFileSync(new URL(`../src/content/${f}`, import.meta.url), 'utf8'));
const resume = json('resume.json') as { email: string };

test('quick-links bar: real links with the right hrefs, outside the DS unit', async ({ page }) => {
  await load(page);
  const nav = page.getByRole('navigation', { name: 'Quick links' });
  await expect(nav.getByRole('link', { name: 'Résumé' })).toHaveAttribute('href', '/resume');
  await expect(nav.getByRole('link', { name: 'Plain site' })).toHaveAttribute('href', '/about');
  await expect(nav.getByRole('link', { name: 'Email' })).toHaveAttribute('href', `mailto:${resume.email}`);
  // the bar sits above the DS unit and inside the viewport
  const r = await page.evaluate(() => {
    const b = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return { bar: b('.quick-links'), top: b('.top-screen'), bottom: b('.bottom-screen'), iw: window.innerWidth, ih: window.innerHeight };
  });
  const apart = r.bar.bottom <= r.top.top || r.bar.left >= r.top.right || r.bar.right <= r.top.left;
  expect(apart).toBe(true); // above the DS (phones) or beside it (side room)
  expect(r.bar.right).toBeLessThanOrEqual(r.iw);
  expect(r.bar.left).toBeGreaterThanOrEqual(0);
  expect(r.bottom.bottom).toBeLessThanOrEqual(r.ih);
});

test('the DS unit still fits beside the bar (integer scale, no scroll)', async ({ page }) => {
  await load(page);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
    cw: document.querySelector('canvas')!.width,
    top: document.querySelector('.top-screen')!.getBoundingClientRect().width,
    px: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')),
  }));
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  expect(m.sh).toBeLessThanOrEqual(m.ih);
  expect(m.cw % 256).toBe(0);
  expect(m.top).toBeLessThanOrEqual(m.iw);
  expect(Math.abs(m.top - 256 * m.px)).toBeLessThan(1);
});

// On master (no bar) the scale came from the viewport minus the 4px safe margins. The bar must not cost a step.
for (const [w, h] of [[1440, 800], [1440, 900], [1366, 768]] as const) {
  test(`${w}x${h}: the bar costs no scale step (side room, zero height)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await load(page);
    const m = await page.evaluate(() => ({ px: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')), dpr: window.devicePixelRatio, bar: document.documentElement.dataset.bar }));
    expect(m.bar).toBe('side');
    expect(Math.round(m.px * m.dpr)).toBe(stackScale(w - 8, h - 8, m.dpr));
  });
}

test('375x812: bar in flow, DS still fits', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await load(page);
  const m = await page.evaluate(() => ({ bar: document.documentElement.dataset.bar ?? null, bottom: document.querySelector('.bottom-screen')!.getBoundingClientRect().bottom, ih: window.innerHeight }));
  expect(m.bar).toBeNull();
  expect(m.bottom).toBeLessThanOrEqual(m.ih);
});
