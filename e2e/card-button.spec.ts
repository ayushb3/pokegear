import { expect, test } from '@playwright/test';
import { dismissAll, load, overlayCount, tile, waitRoom } from './helpers';

const BTN = '[data-testid=btn-card]';

test('Card button opens the Trainer Card, B closes, focus returns to the button', async ({ page }) => {
  await load(page);
  await expect(page.locator('.idle-box [data-slot=card]')).toHaveCount(0); // not a bag slot any more
  await expect(page.locator(BTN)).toHaveAccessibleName('Open the Trainer Card');
  const before = await tile(page);
  await page.locator(BTN).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid=trainer-card]')).toBeVisible();
  expect(new URL(page.url()).search).toContain('open=card');
  await page.keyboard.press('Escape');
  await expect.poll(() => overlayCount(page)).toBe(0);
  expect(new URL(page.url()).search).not.toContain('open=');
  await expect(page.locator(BTN)).toBeFocused();
  expect(await tile(page)).toEqual(before);
});

test('Card button opens by tap in both rooms; on-screen B closes it', async ({ page }) => {
  await load(page);
  for (const room of ['bedroom', 'downstairs']) {
    if (room === 'downstairs') {
      // goTo walks AND talks: wait for the fridge's dialogue and close it, so the tap never races the walk
      await page.evaluate(() => window.__game!.goTo('fridge'));
      await waitRoom(page, 'downstairs');
      await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
      await dismissAll(page);
      await expect(page.locator('.idle-box .slot')).toHaveCount(5);
    }
    await page.locator(BTN).dispatchEvent('pointerdown');
    await expect(page.locator('[data-testid=trainer-card]')).toBeVisible();
    await page.locator('[data-testid=btn-b]').dispatchEvent('pointerdown');
    await expect(page.locator('[data-testid=trainer-card]')).toHaveCount(0);
  }
});

test('Card button sits between START/sound and B/A, is >= 44px and round, caption "Card"', async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    const box = (sel: string) => {
      const b = document.querySelector(sel)!.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height };
    };
    return { icon: box('[data-testid=btn-card] img'), card: box('[data-testid=btn-card]'), cap: box('.lbl-card'), start: box('[data-testid=start]'), sound: box('[data-testid=sound]'), a: box('[data-testid=btn-a]'), b: box('[data-testid=btn-b]'), lblB: box('[data-testid=lbl-b]') };
  });
  expect(r.card.w).toBeGreaterThanOrEqual(44);
  expect(r.card.h).toBeGreaterThanOrEqual(44);
  expect(r.card.l).toBeGreaterThanOrEqual(r.sound.r);
  expect(r.card.l).toBeGreaterThanOrEqual(r.start.r);
  expect(r.card.r).toBeLessThanOrEqual(r.b.l);
  expect(r.cap.r).toBeLessThanOrEqual(r.b.l + 0.5);
  // centred in the gap between the left group and the face block, at every scale
  expect(Math.abs(r.card.l - Math.max(r.start.r, r.sound.r) - (r.b.l - r.card.r))).toBeLessThanOrEqual(1);
  // the icon (16u) stays inside the round button (it grows with the scale)
  expect(r.icon.l).toBeGreaterThan(r.card.l);
  expect(r.icon.r).toBeLessThan(r.card.r);
  expect(r.icon.t).toBeGreaterThan(r.card.t);
  expect(r.icon.b).toBeLessThan(r.card.b);
  await expect(page.locator('.lbl-card')).toHaveText('Card');
});

test('Tab order: START, sound, Card, B, A', async ({ page }) => {
  await load(page);
  await page.locator('[data-testid=start]').focus();
  const order: (string | null)[] = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null));
  }
  expect(order).toEqual(['sound', 'btn-card', 'btn-b', 'btn-a']);
});
