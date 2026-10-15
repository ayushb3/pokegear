import { expect, test, type Page } from '@playwright/test';
import { advanceDialogue, load, tile } from '../helpers';
import { PHOTOS } from '../../src/content/photos';
import { PLACES } from '../../src/content/places';
import { filtersOf } from '../../src/ui/overlay/overlays/corkboard/board';

const FILTERS = filtersOf(PHOTOS, (id) => PLACES.find((p) => p.id === id)?.name ?? id);

async function openBoard(page: Page) {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('corkboard'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  const at = await tile(page);
  await advanceDialogue(page);
  await expect(page.locator('[data-testid=corkboard]')).toBeVisible();
  return at;
}

test('corkboard: open, cross a page boundary, enlarge, A next, B back, B closes', async ({ page }) => {
  const at = await openBoard(page);
  expect(at).toMatchObject({ r: 'downstairs', f: 'up' });
  const board = page.locator('[data-testid=corkboard]');
  await expect(board.locator('[data-testid=photo-filter-label]')).toHaveText(`ALL ${PHOTOS.length}`);

  // 4 thumbnails on page 1, frame 0 selected, page indicator n/m
  for (let i = 0; i < 4; i++) await expect(board.locator(`[data-testid=photo-frame-${i}]`)).toBeVisible();
  await expect(board.locator('[data-testid=photo-frame-0][aria-selected=true]')).toBeVisible();
  const page1 = (await board.locator('[data-testid=photo-page]').textContent())!;
  expect(page1).toMatch(/^1\/\d+$/);
  const caption1 = await board.locator('[data-testid=photo-caption]').textContent();
  expect(caption1).toContain(', '); // "Kyoto, Japan"

  // right x3 reaches the last cell, one more crosses to page 2 (cell 0)
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(board.locator('[data-testid=photo-frame-3][aria-selected=true]')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(board.locator('[data-testid=photo-page]')).toHaveText(/^2\//);
  await expect(board.locator('[data-testid=photo-frame-0][aria-selected=true]')).toBeVisible();
  // left goes back across the boundary
  await page.keyboard.press('ArrowLeft');
  await expect(board.locator('[data-testid=photo-page]')).toHaveText(/^1\//);
  await expect(board.locator('[data-testid=photo-frame-3][aria-selected=true]')).toBeVisible();
  // walk on to page 3, cell 0
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(board.locator('[data-testid=photo-page]')).toHaveText(/^3\//);
  await expect(board.locator('[data-testid=photo-frame-0][aria-selected=true]')).toBeVisible();
  const caption2 = await board.locator('[data-testid=photo-caption]').textContent();

  // only the current page's thumbnails are in the DOM
  await expect(board.locator('img')).toHaveCount(4);

  // A enlarges onto the top screen: whole photo (contain), caption below
  await page.keyboard.press('Space');
  const big = page.locator('[data-testid=photo-enlarged]');
  await expect(big).toBeVisible();
  await expect(big.locator('img')).toHaveCSS('object-fit', 'contain');
  await expect(big).toContainText(caption2!.trim());

  // A shows the next photo and the grid selection follows
  await page.keyboard.press('Space');
  await expect(board.locator('[data-testid=photo-frame-1][aria-selected=true]')).toBeVisible();

  // enlarged: left = previous, right = next
  await page.keyboard.press('ArrowLeft');
  await expect(board.locator('[data-testid=photo-frame-0][aria-selected=true]')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(board.locator('[data-testid=photo-frame-1][aria-selected=true]')).toBeVisible();

  // B back to the grid, B closes
  await page.keyboard.press('Escape');
  await expect(big).toHaveCount(0);
  await expect(board).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
  expect(await tile(page)).toEqual(at);
});

test('corkboard: wraps from the first photo back to the last page', async ({ page }) => {
  await openBoard(page);
  const board = page.locator('[data-testid=corkboard]');
  const total = Number((await board.locator('[data-testid=photo-page]').textContent())!.split('/')[1]);
  await page.keyboard.press('ArrowLeft');
  await expect(board.locator('[data-testid=photo-page]')).toHaveText(`${total}/${total}`);
  // ... onto the LAST photo of that page
  const lastCell = (PHOTOS.length - 1) % 4;
  await expect(board.locator(`[data-testid=photo-frame-${lastCell}][aria-selected=true]`)).toBeVisible();
});

test('corkboard: page-change rule (first photo of the new page; left from a first photo = previous page, last photo)', async ({ page }) => {
  await openBoard(page);
  const board = page.locator('[data-testid=corkboard]');
  const pageNo = board.locator('[data-testid=photo-page]');
  const selected = (cell: number) => board.locator(`[data-testid=photo-frame-${cell}][aria-selected=true]`);

  // tap a middle photo, then jump a page with the counter: lands on cell 0, not the same column
  await board.locator('[data-testid=photo-frame-2]').dispatchEvent('pointerdown');
  await expect(selected(2)).toBeVisible();
  await pageNo.dispatchEvent('pointerdown');
  await expect(pageNo).toHaveText(/^2\//);
  await expect(selected(0)).toBeVisible();
  // left from a page's first photo: previous page, its LAST photo
  await page.keyboard.press('ArrowLeft');
  await expect(pageNo).toHaveText(/^1\//);
  await expect(selected(3)).toBeVisible();
  // right past the end of a page: the next page's first photo
  await page.keyboard.press('ArrowRight');
  await expect(pageNo).toHaveText(/^2\//);
  await expect(selected(0)).toBeVisible();

  // a filter change starts at the first photo of the first page
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(pageNo).toHaveText(/^1\//);
  await expect(selected(0)).toBeVisible();
});

/**
 * Layout at the phone viewport (--u = 1px): title, one row of 4 cells and the caption/page row all fit inside the box with
 * nothing scrolled out, and the thumbnails fill their cells (object-fit: cover, no letterboxing).
 */
test('corkboard layout: one row of near-square cells and caption row inside the box', async ({ page }) => {
  await openBoard(page);
  // the longest filter label (worst case for the title bar), on a later page
  const longest = FILTERS.reduce((a, f, i) => (f.label.length > FILTERS[a]!.label.length ? i : a), 0);
  for (let i = 0; i < longest; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid=photo-filter-label]')).toHaveText(`${FILTERS[longest]!.label} ${FILTERS[longest]!.count}`);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');

  const r = await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="corkboard"]') as HTMLElement;
    const ob = overlay.getBoundingClientRect();
    const out: Record<string, unknown> = {
      overflowY: overlay.scrollHeight - overlay.clientHeight,
      overflowX: overlay.scrollWidth - overlay.clientWidth,
    };
    const inside = (el: Element) => {
      const b = el.getBoundingClientRect();
      return b.top >= ob.top - 1 && b.bottom <= ob.bottom + 1 && b.left >= ob.left - 1 && b.right <= ob.right + 1;
    };
    out.framesInside = [0, 1, 2, 3].every((i) => inside(document.querySelector(`[data-testid="photo-frame-${i}"]`)!));
    out.captionInside = inside(document.querySelector('[data-testid="photo-caption"]')!);
    out.pageInside = inside(document.querySelector('[data-testid="photo-page"]')!);
    // filter bar: both arrows and the whole label inside the box, label not truncated
    out.barInside = ['photo-filter-prev', 'photo-filter-label', 'photo-filter-next'].every((id) =>
      inside(document.querySelector(`[data-testid="${id}"]`)!),
    );
    const lbl = document.querySelector('[data-testid="photo-filter-label"]') as HTMLElement;
    out.labelFits = lbl.scrollWidth <= lbl.clientWidth;
    out.fill = [0, 1, 2, 3].map((i) => {
      const f = document.querySelector(`[data-testid="photo-frame-${i}"]`) as HTMLElement;
      const im = document.querySelector(`[data-testid="photo-thumb-${i}"]`) as HTMLElement;
      const fb = f.getBoundingClientRect();
      const ib = im.getBoundingClientRect();
      const fit = getComputedStyle(im).objectFit;
      // image box covers the frame's content box (frame minus its border)
      const bw = parseFloat(getComputedStyle(f).borderLeftWidth);
      return fit === 'cover' && fb.height >= 0.8 * fb.width && Math.abs(ib.width - (fb.width - 2 * bw)) < 1.5 && Math.abs(ib.height - (fb.height - 2 * bw)) < 1.5;
    });
    // integer pixels: every cell's size and its offset from the top screen are whole native px (--px CSS px each)
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 1;
    const ts = document.querySelector('.top-screen')!.getBoundingClientRect();
    const whole = (v: number) => Math.abs(v / px - Math.round(v / px)) < 0.01;
    out.cellsWhole = [0, 1, 2, 3].every((i) => {
      const b = document.querySelector(`[data-testid="photo-frame-${i}"]`)!.getBoundingClientRect();
      return whole(b.left - ts.left) && whole(b.width) && whole(b.height);
    });
    return out;
  });

  expect(r.cellsWhole, 'cell edges on whole native pixels').toBe(true);
  expect(r.overflowY).toBeLessThanOrEqual(0);
  expect(r.overflowX).toBeLessThanOrEqual(0);
  expect(r.framesInside).toBe(true);
  expect(r.captionInside).toBe(true);
  expect(r.pageInside).toBe(true);
  expect(r.barInside).toBe(true);
  expect(r.labelFits, 'longest filter label is not ellipsised').toBe(true);
  expect(r.fill, 'cells cover-fit, height >= 0.8 x width').toEqual([true, true, true, true]);
});

test('corkboard: up / down cycle the place filter (wrapping); paging, captions and counter stay inside the filter', async ({ page }) => {
  await openBoard(page);
  const board = page.locator('[data-testid=corkboard]');
  const label = board.locator('[data-testid=photo-filter-label]');
  const pageNo = board.locator('[data-testid=photo-page]');
  const first = FILTERS[1]!;

  await page.keyboard.press('ArrowDown');
  await expect(label).toHaveText(`${first.label} ${first.count}`);
  await expect(page.locator('[data-testid=live]')).toContainText(`${first.name}, ${first.count} photos`);
  await expect(pageNo).toHaveText(`1/${Math.ceil(first.count / 4)}`);
  await expect(board.locator('[data-testid=photo-frame-0][aria-selected=true]')).toBeVisible();
  const country = first.name;
  await expect(board.locator('[data-testid=photo-caption]')).toContainText(country);

  // left from the first photo wraps to the filter's LAST photo, not the whole board's
  await page.keyboard.press('ArrowLeft');
  const lastPage = Math.ceil(first.count / 4);
  await expect(pageNo).toHaveText(`${lastPage}/${lastPage}`);
  await expect(board.locator('[data-testid=photo-caption]')).toContainText(country);
  // enlarge stays inside the filter too
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=photo-enlarged]')).toContainText(country);
  await page.keyboard.press('Space'); // next = wraps to the filter's first photo
  await expect(pageNo).toHaveText(`1/${lastPage}`);
  await page.keyboard.press('Escape');

  // up from the first place goes back to ALL; up again wraps to the last place
  await page.keyboard.press('ArrowUp');
  await expect(label).toHaveText(`ALL ${PHOTOS.length}`);
  await page.keyboard.press('ArrowUp');
  const last = FILTERS[FILTERS.length - 1]!;
  await expect(label).toHaveText(`${last.label} ${last.count}`);
  await page.keyboard.press('ArrowDown');
  await expect(label).toHaveText(`ALL ${PHOTOS.length}`);

  // the on-screen bar arrows do the same
  await board.locator('[data-testid=photo-filter-next]').dispatchEvent('pointerdown');
  await expect(label).toHaveText(`${first.label} ${first.count}`);
  await board.locator('[data-testid=photo-filter-prev]').dispatchEvent('pointerdown');
  await expect(label).toHaveText(`ALL ${PHOTOS.length}`);

  // opened from the room, B at the top level closes (label says so)
  await expect(page.locator('[data-testid=lbl-b]')).toHaveText('Close');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bottom-screen .overlay')).toHaveCount(0);
});
