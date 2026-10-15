import { expect, test } from '@playwright/test';
import { dismissAll, load, tile } from './helpers';

test('bag grid: 7 slots (bedroom objects), description on hover/focus, never disabled', async ({ page }) => {
  await load(page);
  const slots = page.locator('.idle-box .slot');
  await expect(slots).toHaveCount(7);
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText("Ayush's room");
  for (let i = 0; i < 7; i++) await expect(slots.nth(i)).not.toHaveAttribute('aria-disabled', /.*/);
  await page.locator('[data-slot=pc]').focus();
  await expect(page.locator('[data-testid=idle-desc]')).toHaveText('PC: projects');
  await expect(page.locator('[data-slot=pc]')).toHaveClass(/sel/);
});

test('arrow keys still move the player while a slot has focus', async ({ page }) => {
  await load(page);
  const before = await tile(page);
  await page.locator('[data-slot=bed]').focus();
  await expect
    .poll(async () => {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowLeft');
      const t = await tile(page);
      return `${t.x},${t.y}`;
    })
    .not.toBe(`${before.x},${before.y}`);
});

test('tap walks to the object, shows its description, then the grid returns', async ({ page }) => {
  await load(page);
  await page.locator('[data-slot=bed]').dispatchEvent('pointerdown');
  await expect(page.locator('[data-testid=idle-desc]')).toHaveText('Bed: take a rest');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.idle-box')).toHaveCount(0); // covered by the dialogue
  await dismissAll(page);
  await expect(page.locator('.idle-box .slot')).toHaveCount(7);
  await expect(page.locator('[data-slot=bed]')).not.toHaveAttribute('aria-disabled', /.*/);
});

test('no horizontal scroll and the grid fits the box', async ({ page }) => {
  await load(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const ok = await page.evaluate(() => {
    const box = document.querySelector('.idle-box')!.getBoundingClientRect();
    return [...document.querySelectorAll('.idle-box .slot, .idle-desc')].every((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= box.top && r.bottom <= box.bottom + 1 && r.left >= box.left && r.right <= box.right + 1;
    });
  });
  expect(ok).toBe(true);
});

test('mobile: every bag slot has a hit area of at least 44 px (or the most the box allows)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await load(page);
  const res = await page.evaluate(() => {
    const slots = [...document.querySelectorAll<HTMLElement>('.idle-box .slot')];
    return slots.map((s) => {
      const r = s.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const owns = (y: number) => !!document.elementFromPoint(cx, y)?.closest('.slot') && document.elementFromPoint(cx, y)!.closest('.slot') === s;
      let top = r.top, bottom = r.bottom;
      while (owns(top - 0.5)) top -= 0.5;
      while (owns(bottom + 0.5)) bottom += 0.5;
      return { h: r.height, hit: bottom - top, id: s.dataset.slot };
    });
  });
  expect(res).toHaveLength(7);
  for (const r of res) {
    expect(r.hit, r.id).toBeGreaterThanOrEqual(44);
  }
});

test('mobile: header and description clicks are harmless, and the extended zone still walks', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await load(page);
  for (const sel of ['.idle-loc', '.idle-desc']) {
    const b = (await page.locator(sel).boundingBox())!;
    await page.mouse.click(b.x + 4, b.y + b.height / 2);
  }
  const first = page.locator('.idle-box .slot').first();
  const b = (await first.boundingBox())!;
  const y = b.y - 8; // above the visible slot: inside the invisible extension
  const id = await first.getAttribute('data-slot');
  const hit = await page.evaluate(([x, yy]) => document.elementFromPoint(x, yy)?.closest('.slot')?.getAttribute('data-slot') ?? null, [b.x + b.width / 2, y]);
  expect(hit).toBe(id);
  await page.mouse.click(b.x + b.width / 2, y);
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('first visit: after one step the bag rests on the PC (selected, described) until the PC is opened; hover overrides and returns', async ({ page }) => {
  await load(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid=idle-desc]')).toHaveText('PC: projects');
  await expect(page.locator('.slot[data-slot=pc]')).toHaveClass(/sel/);
  // hovering another slot shows ITS description, leaving returns to the PC
  await page.locator('[data-slot=piano]').hover();
  await expect(page.locator('[data-testid=idle-desc]')).not.toHaveText('PC: projects');
  await expect(page.locator('.slot[data-slot=pc]')).not.toHaveClass(/sel/);
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-testid=idle-desc]')).toHaveText('PC: projects');
  await expect(page.locator('.slot[data-slot=pc]')).toHaveClass(/sel/);
  // open and close the PC: no more default selection
  await page.evaluate(() => window.__game!.goTo('pc'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  await dismissAll(page);
  await expect(page.locator('.idle-box .slot')).toHaveCount(7);
  await expect(page.locator('[data-testid=idle-desc]')).not.toHaveText('PC: projects');
  await expect(page.locator('.slot[data-slot=pc]')).not.toHaveClass(/sel/);
});
