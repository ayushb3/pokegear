import { expect, test } from '@playwright/test';
import { dismissAll, load, tile, waitRoom } from './helpers';

const tab = (page: import('@playwright/test').Page, room: string) => page.locator(`[data-testid=tab-${room}]`);
const slotIds = (page: import('@playwright/test').Page) => page.locator('.idle-box .slot').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slot));

test('room tabs: three tabs, the current room selected on open; the names fit the box without clipping', async ({ page }) => {
  await load(page);
  await expect(page.locator('.bag-tab')).toHaveCount(3);
  await expect(page.locator('[role=tablist] [role=tab]')).toHaveCount(3);
  await expect(tab(page, 'bedroom')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'downstairs')).toHaveAttribute('aria-selected', 'false');
  await expect(tab(page, 'bedroom')).toHaveText("Ayush's room");
  await expect(tab(page, 'downstairs')).toHaveText('Downstairs');
  await expect(tab(page, 'yard')).toHaveText('Yard');
  const fit = await page.evaluate(() => {
    const box = document.querySelector('.idle-box')!.getBoundingClientRect();
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px'));
    return [...document.querySelectorAll<HTMLElement>('.bag-tab')].map((t) => {
      const r = t.getBoundingClientRect();
      const s = t.querySelector<HTMLElement>('.bag-tab-text')!;
      return { clipped: s.scrollWidth > s.clientWidth, inside: r.left >= box.left && r.right <= box.right + 1 && r.top >= box.top && r.bottom <= box.bottom, h: r.height / px };
    });
  });
  for (const f of fit) expect(f).toMatchObject({ clipped: false, inside: true, h: 18 });
});

test('room tabs: tapping a tab lists that room, the player does not move', async ({ page }) => {
  await load(page);
  await tab(page, 'downstairs').dispatchEvent('pointerdown');
  await expect(tab(page, 'downstairs')).toHaveAttribute('aria-selected', 'true');
  expect(await slotIds(page)).toEqual(['fridge', 'tv', 'corkboard', 'mom', 'gym']);
  await expect(page.locator('[data-testid=idle-loc]')).toHaveText('Downstairs');
  await tab(page, 'yard').dispatchEvent('pointerdown');
  expect(await slotIds(page)).toEqual(['mailbox', 'sign']);
  await tab(page, 'bedroom').dispatchEvent('pointerdown');
  expect(await slotIds(page)).toHaveLength(7);
  expect(await tile(page)).toMatchObject({ r: 'bedroom' });
});

test('room tabs: Q / E (L / R) switch tabs and wrap; the arrows still walk and never switch tabs', async ({ page }) => {
  await load(page);
  await page.keyboard.press('KeyE');
  await expect(tab(page, 'downstairs')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('KeyE');
  await expect(tab(page, 'yard')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('KeyE');
  await expect(tab(page, 'bedroom')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('KeyQ');
  await expect(tab(page, 'yard')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('PageDown');
  await expect(tab(page, 'bedroom')).toHaveAttribute('aria-selected', 'true');
  const before = await tile(page);
  await expect
    .poll(async () => {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowLeft');
      const t = await tile(page);
      return `${t.x},${t.y}`;
    })
    .not.toBe(`${before.x},${before.y}`);
  await expect(tab(page, 'bedroom')).toHaveAttribute('aria-selected', 'true');
});

test('room tabs: picking an object in another room tab walks there across rooms (goTo) and the tab follows the player', async ({ page }) => {
  await load(page);
  await page.keyboard.press('KeyE');
  await page.locator('[data-slot=fridge]').dispatchEvent('pointerdown');
  await waitRoom(page, 'downstairs');
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 25_000 });
  await dismissAll(page);
  await expect(tab(page, 'downstairs')).toHaveAttribute('aria-selected', 'true');
  expect(await slotIds(page)).toEqual(['fridge', 'tv', 'corkboard', 'mom', 'gym']);
});

test('room tabs: first visit, the PC stays the resting cursor on the bedroom tab only', async ({ page }) => {
  await load(page);
  await page.keyboard.press('ArrowDown'); // dismisses the hint
  await expect(page.locator('.slot[data-slot=pc]')).toHaveClass(/sel/);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.idle-box .slot.sel')).toHaveCount(0);
  await page.keyboard.press('KeyQ');
  await expect(page.locator('.slot[data-slot=pc]')).toHaveClass(/sel/);
  await expect(page.locator('[data-testid=idle-desc]')).toHaveText('PC: projects');
});

test('mobile: tab hit areas are at least 24 px tall (box edge to the slot rows) and 44 px wide, and they own the strip over the slots', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await load(page);
  const res = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.bag-tab')].map((t) => {
      const r = t.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const owns = (y: number) => document.elementFromPoint(cx, y)?.closest('.bag-tab') === t;
      let top = r.top, bottom = r.bottom;
      while (owns(top - 0.5)) top -= 0.5;
      while (owns(bottom + 0.5)) bottom += 0.5;
      return { hit: bottom - top, w: r.width, room: t.dataset.room };
    }),
  );
  for (const r of res) {
    expect(r.hit, r.room).toBeGreaterThanOrEqual(24);
    expect(r.w, r.room).toBeGreaterThanOrEqual(44);
  }
});

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

// The room tabs own the strip above the slots, so the top row reaches up only to the tab row's edge: it keeps ~25 px (the
// most the 100u box allows next to a tab row); the bottom row still extends down over the description for 44+.
test('mobile: bottom-row bag slots keep a 44 px hit area, top-row slots at least 24 px (the tabs own the strip above)', async ({ page }) => {
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
  res.forEach((r, i) => expect(r.hit, r.id).toBeGreaterThanOrEqual(i < 4 ? 24 : 44));
});

test('mobile: description clicks are harmless, and the extended zone still walks', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await load(page);
  {
    const b = (await page.locator('.idle-desc').boundingBox())!;
    await page.mouse.click(b.x + 4, b.y + b.height / 2);
  }
  const first = page.locator('.idle-box .slot').nth(4); // bottom row: its tap area extends over the description
  const b = (await first.boundingBox())!;
  const y = b.y + b.height + 8; // below the visible slot: inside the invisible extension
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
