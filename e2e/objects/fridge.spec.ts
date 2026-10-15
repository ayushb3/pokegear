import { expect, test, type Page } from '@playwright/test';
import { advanceDialogue, dismissAll, load, tile } from '../helpers';
import data from '../../src/content/fridge.json' with { type: 'json' };

type Entry = { date: string | null; section: string; title: string; note?: string; place?: string; photo?: string; sample?: boolean };
const all = data.entries as Entry[];
const metaOf = (e: Entry) => [e.place, e.date].filter(Boolean).join(' ');

async function openFridge(page: Page) {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('fridge'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  const opened = await tile(page);
  await advanceDialogue(page);
  await expect(page.locator('[data-testid=fridge]')).toBeVisible({ timeout: 5_000 });
  return opened;
}

const tabId = (page: Page) => page.locator('.fridge .fd-name').first().getAttribute('data-testid');
const selTitle = (page: Page) => page.locator('.fd-row.sel .fd-title').innerText();
const cap = (page: Page) => page.locator('[data-testid=fridge-cap]').innerText();

test('fridge: opens on ALL NOTES with the count, door on the top screen, world dims and un-dims', async ({ page }) => {
  const opened = await openFridge(page);
  await expect(page.locator('[data-testid=fridge-tab-all]')).toBeVisible();
  await expect(page.locator('[data-testid=fridge-count]')).toHaveText(String(all.length));
  await expect(page.locator('.top-screen [data-testid=fridge-door]')).toBeVisible();
  await expect(page.locator('.world-box')).toHaveAttribute('data-dim', '');
  await expect(page.locator('.fd-flip').first()).toHaveText('▶');
  // newest real entry first: it has a photo; the sample entries sit last
  await expect(page.locator('[data-testid=fridge-polaroid] img')).toHaveCount(1);
  await expect(page.locator('[data-testid=fridge-sample]')).toHaveCount(0);
  await dismissAll(page);
  await expect(page.locator('[data-testid=fridge-door]')).toHaveCount(0);
  await expect(page.locator('.world-box')).not.toHaveAttribute('data-dim', '');
  expect(await tile(page)).toEqual(opened);
});

test('fridge: the list fits at 375x812 (title bar + header + >=2 whole entry rows, no overflow)', async ({ page }) => {
  await openFridge(page);
  const r = await page.locator('[data-testid=fridge]').evaluate((overlay) => {
    const list = overlay.querySelector<HTMLElement>('.fd-list')!;
    const lb = list.getBoundingClientRect();
    const bar = overlay.querySelector<HTMLElement>('.fd-bar')!.getBoundingClientRect();
    const o = overlay.getBoundingClientRect();
    const whole = (sel: string) =>
      [...list.querySelectorAll<HTMLElement>(sel)].filter((x) => {
        const b = x.getBoundingClientRect();
        return b.top >= lb.top - 0.5 && b.bottom <= lb.bottom + 0.5;
      }).length;
    return { rows: whole('.fd-row'), items: whole('li'), barVisible: bar.top >= o.top && bar.bottom <= o.bottom, ovScroll: overlay.scrollHeight - overlay.clientHeight, ovW: overlay.scrollWidth - overlay.clientWidth };
  });
  expect(r.barVisible).toBe(true);
  expect(r.rows, 'whole entry rows').toBeGreaterThanOrEqual(2);
  expect(r.items, 'whole rows incl. month header').toBeGreaterThanOrEqual(3);
  expect(r.ovScroll).toBeLessThanOrEqual(1);
  expect(r.ovW).toBeLessThanOrEqual(0);
  await dismissAll(page);
});

test('fridge: arrows and keys switch filters (All, Cooking, Hall of Fame, Want to try) and wrap', async ({ page }) => {
  await openFridge(page);
  const order = ['all', 'cooking', 'hallOfFame', 'wantToTry'];
  for (let i = 1; i < 4; i++) {
    await page.keyboard.press('ArrowRight');
    expect(await tabId(page)).toBe(`fridge-tab-${order[i]}`);
  }
  await page.keyboard.press('ArrowRight');
  expect(await tabId(page)).toBe('fridge-tab-all');
  await page.locator('[data-testid=fridge-prev]').dispatchEvent('pointerdown');
  expect(await tabId(page)).toBe('fridge-tab-wantToTry');
  const n = all.filter((e) => e.section === 'wantToTry').length;
  await expect(page.locator('[data-testid=fridge-count]')).toHaveText(String(n));
  await expect(page.locator('[data-testid=fridge-sample]')).toHaveCount(1);
  // want-to-try has no photo: blank note card on the door
  await expect(page.locator('[data-testid=fridge-polaroid] img')).toHaveCount(0);
  await expect(page.locator('[data-testid=fridge-polaroid] .frame.blank')).toHaveCount(1);
  // samples sit under one SAMPLES header, not UNDATED
  await expect(page.locator('[data-testid=fridge-month]')).toHaveText(['SAMPLES']);
  await dismissAll(page);
});

test('fridge: scrolling crosses a month header; headers are skipped; the photo follows the cursor; up from the first wraps to the last', async ({ page }) => {
  await openFridge(page);
  await page.keyboard.press('ArrowRight'); // Cooking (photos on every entry)
  const heads = await page.locator('[data-testid=fridge-month]').count();
  expect(heads).toBeGreaterThan(1);
  const srcs = new Set<string>();
  let crossed = false;
  const monthOf = (t: string) => all.find((e) => e.title === t)?.date?.slice(0, 7);
  let prev = monthOf(await selTitle(page));
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowDown');
    const t = await selTitle(page);
    const m = monthOf(t);
    if (m !== prev) crossed = true;
    prev = m;
    const ok = await page.locator('.fd-row.sel').evaluate((row) => {
      const lb = row.closest('.fd-list')!.getBoundingClientRect();
      const b = row.getBoundingClientRect();
      return b.top >= lb.top - 0.5 && b.bottom <= lb.bottom + 0.5;
    });
    expect(ok, `selected row visible after ${i + 1} downs`).toBe(true);
    srcs.add((await page.locator('[data-testid=fridge-polaroid] img').getAttribute('src')) ?? '');
  }
  expect(crossed, 'crossed a month boundary').toBe(true);
  expect(srcs.size, 'photo changes with selection').toBeGreaterThan(5);
  // wrap: 12 cooking entries, 12 downs from the first lands back on it; up from there lands on the last
  expect(await selTitle(page)).toBe(await page.locator('.fd-row').first().locator('.fd-title').innerText());
  await page.keyboard.press('ArrowUp');
  const cooking = all.filter((e) => e.section === 'cooking').sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
  expect(await selTitle(page)).toBe(cooking[cooking.length - 1]!.title);
  await dismissAll(page);
});

test('fridge: A opens an entry (photo + title on top; section, position, place, date below, no repeated title), B back to list, B closes', async ({ page }) => {
  const opened = await openFridge(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); // Hall of Fame
  const hof = all.filter((e) => e.section === 'hallOfFame').sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
  const first = hof[0]!;
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=fridge-open]')).toBeVisible();
  await expect(page.locator('[data-testid=fridge-cap]')).toHaveText(first.title);
  await expect(page.locator('.top-screen .fd-door .frame img')).toHaveAttribute('alt', first.title);
  await expect(page.locator('[data-testid=fridge] .fd-bar')).toContainText('HALL OF FAME'); // the section is the frame's title bar
  await expect(page.locator('[data-testid=fridge-pos]')).toHaveText(`1 of ${hof.length}`);
  // the title is on the polaroid caption only; the bottom text is place, then date, each on its own line
  await expect(page.locator('[data-testid=fridge-open]')).not.toContainText(first.title);
  const lines = (await page.locator('[data-testid=fridge-open] .tp-flow .tp-text').allInnerTexts()).map((t) => t.trim());
  expect(lines[0]).toBe(first.place);
  expect(lines[1]).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  // screen readers still hear the title once
  await expect(page.locator('[data-testid=live]')).toContainText(first.title);
  await expect(page.locator('[data-testid=lbl-a]')).toHaveText('Next');
  await expect(page.locator('[data-testid=lbl-b]')).toHaveText('Back');
  // filter arrows do nothing while open
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid=fridge-open]')).toBeVisible();
  expect(await cap(page)).toBe(first.title);
  expect(await page.locator('[data-testid=fridge]').evaluate((o) => o.scrollHeight - o.clientHeight)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=scroll-list]')).toBeVisible();
  expect(await tabId(page)).toBe('fridge-tab-hallOfFame');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=fridge]')).toHaveCount(0);
  expect(await tile(page)).toEqual(opened);
});

test('fridge: open view, A pages then opens the NEXT entry (wrapping); up/down switch entries; text never overflows sideways', async ({ page }) => {
  await openFridge(page);
  await page.keyboard.press('ArrowRight'); // Cooking
  const cooking = all.filter((e) => e.section === 'cooking').sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
  await page.keyboard.press('Space');
  expect(await cap(page)).toBe(cooking[0]!.title);
  // A pages through place, date and note, then moves on to the next entry
  for (let i = 0; i < 6 && (await cap(page)) === cooking[0]!.title; i++) await page.keyboard.press('Space');
  expect(await cap(page)).toBe(cooking[1]!.title);
  await page.keyboard.press('ArrowDown');
  expect(await cap(page)).toBe(cooking[2]!.title);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await cap(page)).toBe(cooking[0]!.title);
  await page.keyboard.press('ArrowUp'); // wraps to the last
  expect(await cap(page)).toBe(cooking[cooking.length - 1]!.title);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=scroll-list]')).toBeVisible();
  await dismissAll(page);
});

test('fridge: the longest place + date line wraps inside the box (no sideways overflow, all of it pageable)', async ({ page }) => {
  await openFridge(page);
  const longest = [...all].filter((e) => !e.sample).sort((a, b) => metaOf(b).length - metaOf(a).length)[0]!;
  // walk the All list down to it, then open
  let guard = 0;
  while ((await selTitle(page)) !== longest.title && guard++ < 60) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=fridge-open]')).toBeVisible();
  const o = await page.locator('[data-testid=fridge-open] .tp-flow').evaluate((f) => ({ sw: f.scrollWidth, cw: f.clientWidth }));
  expect(o.sw, 'text overflows sideways').toBeLessThanOrEqual(o.cw);
  const text = await page.locator('[data-testid=fridge-open] .tp-flow').innerText();
  expect(text.replace(/\s+/g, ' ')).toContain(longest.place!.replace(/\s+/g, ' '));
  await dismissAll(page);
});

test('fridge: a sample want-to-try entry opens with its note paged and is last in All', async ({ page }) => {
  await openFridge(page);
  await page.keyboard.press('ArrowUp'); // wrap to the last entry of All: a sample
  expect(await selTitle(page)).toMatch(/^Sample:/);
  await expect(page.locator('[data-testid=fridge-sample]')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=text-pages]')).toBeVisible();
  await expect(page.locator('[data-testid=fridge-open]')).toContainText('Sample:');
  await dismissAll(page);
});

test('fridge: the longest title fits the polaroid caption on two whole lines, centred in its strip', async ({ page }) => {
  await openFridge(page);
  const longest = [...all].filter((e) => !e.sample).sort((a, b) => b.title.length - a.title.length)[0]!;
  let guard = 0;
  while ((await selTitle(page)) !== longest.title && guard++ < 60) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=fridge-cap]')).toHaveText(longest.title);
  const r = await page.locator('[data-testid=fridge-cap]').evaluate((c) => {
    const strip = c.parentElement!.getBoundingClientRect();
    const b = c.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(c).lineHeight);
    return { clipped: c.scrollHeight - c.clientHeight, lines: Math.round(b.height / lh), top: b.top - strip.top, bottom: strip.bottom - b.bottom };
  });
  expect(r.clipped, 'caption clipped').toBeLessThanOrEqual(0);
  expect(r.lines).toBeLessThanOrEqual(2);
  expect(Math.abs(r.top - r.bottom), 'caption centred').toBeLessThanOrEqual(1);
  await dismissAll(page);
});

test('fridge: a portrait photo is shown whole on polaroid paper (no dark side bars, no crop)', async ({ page }) => {
  await openFridge(page);
  const espetada = all.find((e) => e.title.startsWith('Chicken Espetada'))!;
  let guard = 0;
  while ((await selTitle(page)) !== espetada.title && guard++ < 60) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  const frame = page.locator('.top-screen [data-testid=fridge-frame]');
  await expect(frame).toHaveClass(/portrait/);
  const r = await frame.evaluate((f) => {
    const img = f.querySelector('img')!;
    return { bg: getComputedStyle(f).backgroundColor, fit: getComputedStyle(img).objectFit, iw: img.getBoundingClientRect().width, fw: f.getBoundingClientRect().width };
  });
  expect(r.bg).toBe('rgb(255, 253, 242)');
  expect(r.fit).toBe('contain');
  expect(r.iw).toBeLessThan(r.fw);
  await dismissAll(page);
});

test('fridge: at 375x812 the open entry shows place, date AND the start of its note on page 1 (the title bar costs one line)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-375x812', 'the 1x budget');
  await openFridge(page);
  await page.keyboard.press('Space'); // open the first (newest) entry
  await expect(page.locator('[data-testid=fridge-open]')).toBeVisible();
  const tp = page.locator('[data-testid=fridge-open] [data-testid=text-pages]');
  await expect(tp).toHaveAttribute('data-page', '1');
  const r = await tp.evaluate((el) => {
    const view = el.querySelector('.tp-view')!.getBoundingClientRect();
    const texts = [...el.querySelectorAll<HTMLElement>('.tp-flow .tp-text')];
    const note = texts[texts.length - 1]!;
    const b = note.getBoundingClientRect();
    return { n: texts.length, noteTop: b.top, viewTop: view.top, viewBottom: view.bottom, text: note.innerText };
  });
  expect(r.n, 'place, date, note').toBe(3);
  expect(r.text.length).toBeGreaterThan(0);
  expect(r.noteTop).toBeGreaterThanOrEqual(r.viewTop - 0.5);
  expect(r.noteTop, 'the note starts on page 1').toBeLessThan(r.viewBottom - 1);
  await dismissAll(page);
});
