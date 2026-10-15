import { expect, test, type Page } from '@playwright/test';
import { advanceDialogue, dismissAll, load, overlayCount, tile } from '../helpers';
import { PLACES, REGIONS } from '../../src/content/places';
import { buildWorldEntries } from '../../src/ui/overlay/overlays/townmap/nav';
import { PHOTOS } from '../../src/content/photos';

// Build the world entries (with regions collapsed) once for all tests.
const WORLD_ENTRIES = buildWorldEntries(PLACES, REGIONS);
const WORLD_N = WORLD_ENTRIES.length;

// Index of the mediterranean region stub in world entries
const MED_IDX = WORLD_ENTRIES.findIndex((e) => e.kind === 'region' && e.region.id === 'mediterranean');

async function openMap(page: Page) {
  await load(page);
  await page.evaluate(() => window.__game!.goTo('townmap'));
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  const opened = await tile(page);
  await advanceDialogue(page);
  await expect(page.locator('[data-testid=townmap]')).toBeVisible();
  return opened;
}

/** Navigate to the mediterranean region on the world list and return. */
async function selectMediterranean(page: Page) {
  // Step right until we reach the mediterranean entry (counter shows MED_IDX+1)
  for (let i = 0; i < MED_IDX; i++) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`${MED_IDX + 1}/${WORLD_N}`);
  await expect(page.locator('[data-testid=tm-name]')).toContainText('Mediterranean');
}

/** Navigate to Mediterranean and zoom in. */
async function zoomToMediterranean(page: Page) {
  await selectMediterranean(page);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=tm-breadcrumb]')).toHaveText('World › Mediterranean');
}

test('town map: opens with a world map on top screen and first entry in card', async ({ page }) => {
  await openMap(page);

  // top screen portal must be present
  await expect(page.locator('.tm-top')).toBeVisible();

  // bottom card shows the first world entry
  const firstEntry = WORLD_ENTRIES[0]!;
  const firstName =
    firstEntry.kind === 'region' ? firstEntry.region.name : firstEntry.place.name;
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`1/${WORLD_N}`);
  await expect(page.locator('[data-testid=tm-name]')).toContainText(firstName);
});

test('town map: ◀ ▶ buttons and arrow keys step through entries and wrap', async ({ page }) => {
  await openMap(page);

  const second = WORLD_ENTRIES[1]!;
  const secondName = second.kind === 'region' ? second.region.name : second.place.name;

  // right arrow moves to next entry
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`2/${WORLD_N}`);
  // use containsText since region entries have "· N places" appended
  await expect(page.locator('[data-testid=tm-name]')).toContainText(secondName);

  // on-screen ▶ button
  await page.locator('[data-testid=tm-next]').click();
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`3/${WORLD_N}`);

  // on-screen prev button (now a flipped ▶, still data-testid=tm-prev)
  await page.locator('[data-testid=tm-prev]').click();
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`2/${WORLD_N}`);
});

test('town map: A on a plain place advances; wraps from last back to first', async ({ page }) => {
  await openMap(page);

  for (let i = 1; i < WORLD_N; i++) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`${WORLD_N}/${WORLD_N}`);

  // wrap back
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`1/${WORLD_N}`);
});

test('town map: mediterranean entry (no place counter) and "A to zoom" A-button label', async ({ page }) => {
  await openMap(page);
  await selectMediterranean(page);

  await expect(page.locator('[data-testid=tm-name]')).toHaveText('Mediterranean');
  // A label should say "Zoom"
  await expect(page.locator('[data-testid=lbl-a]')).toHaveText('Zoom');
});

test('town map: A on mediterranean region zooms to sub-level view', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);

  // Breadcrumb should be visible
  await expect(page.locator('[data-testid=tm-breadcrumb]')).toHaveText('World › Mediterranean');

  // ScrollList should show mediterranean's places
  await expect(page.locator('[data-testid=scroll-list]')).toBeVisible();

  // B label becomes "Up"
  await expect(page.locator('[data-testid=lbl-b]')).toHaveText('Up');
});

test('town map: B from mediterranean region goes back to world level', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);

  // B goes back
  await page.keyboard.press('Escape');

  // Back at world level: breadcrumb gone, counter visible again
  await expect(page.locator('[data-testid=tm-breadcrumb]')).toHaveCount(0);
  await expect(page.locator('[data-testid=tm-counter]')).toBeVisible();

  // Should be back at mediterranean idx
  await expect(page.locator('[data-testid=tm-name]')).toContainText('Mediterranean');
});

test('town map: region → B → B (world) → B closes overlay', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);

  // First B: back to world level
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=tm-counter]')).toBeVisible();
  await expect(page.locator('[data-testid=tm-name]')).toContainText('Mediterranean');

  // Second B: close overlay
  await page.keyboard.press('Escape');
  await expect.poll(() => overlayCount(page)).toBe(0);
});

test('town map: tapping a pin on the world map selects the entry', async ({ page }) => {
  await openMap(page);

  // The second world entry (idx=1) — get its pin id
  const secondEntry = WORLD_ENTRIES[1]!;
  const pinId = secondEntry.kind === 'region' ? secondEntry.region.id : secondEntry.place.id;
  const secondPin = page.locator(`[data-testid=pin-${pinId}]`).first();
  await secondPin.click();

  const secondName = secondEntry.kind === 'region' ? secondEntry.region.name : secondEntry.place.name;
  await expect(page.locator('[data-testid=tm-name]')).toContainText(secondName);
});

test('town map: B from world level closes the overlay and returns player to same tile', async ({ page }) => {
  const opened = await openMap(page);

  await page.keyboard.press('Escape');
  await expect.poll(() => overlayCount(page)).toBe(0);
  expect(await tile(page)).toEqual(opened);
});

test('town map: B from world level closes the overlay (B label is "Close" at world)', async ({ page }) => {
  await openMap(page);

  await expect(page.locator('[data-testid=lbl-b]')).toHaveText('Close');
});

test('town map: Sample tag is hidden when places.json has sample:false', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('[data-testid=tm-sample-tag]')).toHaveCount(0);
});

test('town map: photo placeholder is not shown for places without a photo', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('[data-testid=tm-photo-placeholder]')).toHaveCount(0);
});

test('town map: nav buttons have tap targets >= 44 native px wide and tall', async ({ page }) => {
  await openMap(page);
  const prev = page.locator('[data-testid=tm-prev]');
  const box = (await prev.boundingBox())!;
  // --u resolves to var(--px, 2px); read --px directly since it's set as a plain px value.
  const u = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')),
  );
  const minPx = 44 * u;
  expect(box.width).toBeGreaterThanOrEqual(minPx - 1);
  expect(box.height).toBeGreaterThanOrEqual(minPx - 1);
});

test('town map: dismiss with B and focus is restored', async ({ page }) => {
  const opened = await openMap(page);
  await dismissAll(page);
  expect(await tile(page)).toEqual(opened);
});

test('town map: region level shows >= 3 whole list rows (inset removed)', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);

  // No inset map in sub-level any more
  await expect(page.locator('[data-testid=tm-inset]')).toHaveCount(0);

  // ScrollList must have at least 3 rendered rows (the mediterranean places are listed)
  const rows = page.locator('.sl-row');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(3);
});

test('town map: top-screen shows zoomed region map at sub-level (not world map alone)', async ({ page }) => {
  await openMap(page);

  // At world level: world map image exists and is visible
  await expect(page.locator('[data-testid=tm-world-map]')).toBeVisible();

  // Zoom to Mediterranean
  await zoomToMediterranean(page);

  // At sub-level: region map image present (may be fully opaque now)
  await expect(page.locator('[data-testid=tm-region-map]')).toBeVisible();

  // Region map src references the mediterranean map
  const src = await page.locator('[data-testid=tm-region-map]').getAttribute('src');
  expect(src).toContain('mediterranean');
});

test('town map: no "N places" counters anywhere (top label, region name row)', async ({ page }) => {
  await openMap(page);

  const label = page.locator('.tm-top [aria-hidden="true"]').last();
  await expect(label).toHaveText('TOWN MAP');
  await selectMediterranean(page);
  await expect(page.locator('[data-testid=tm-name]')).toHaveText('Mediterranean');
  await expect(page.locator('[data-testid=townmap]')).not.toContainText(/\d+ places/);
});

/**
 * Nothing clips: every descendant's content box sits inside the overlay's INNER rect (box inset 4u: the clean
 * 92u interior), each list row sits inside the list box, the breadcrumb / list / entry line never overlap, and
 * the entry line keeps >= 4u of air below. Single-line text is not cut (unless it carries a title: ellipsis + title).
 */
async function expectFits(page: Page) {
  const bad = await page.evaluate(() => {
    const root = document.querySelector('[data-testid=townmap]') as HTMLElement;
    const r = root.getBoundingClientRect();
    const u = parseFloat(getComputedStyle(root).getPropertyValue('--u')) || r.height / 100;
    const inset = 4 * u;
    const inner = { l: r.left + inset, t: r.top + inset, r: r.right - inset, b: r.bottom - inset };
    const out: string[] = [];
    if (root.scrollHeight > root.clientHeight + 1) out.push(`root scrollHeight ${root.scrollHeight} > ${root.clientHeight}`);
    // content box: padding is air, not text
    const box = (el: Element) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { left: b.left, right: b.right, top: b.top + parseFloat(cs.paddingTop), bottom: b.bottom - parseFloat(cs.paddingBottom), width: b.width, height: b.height };
    };
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      const b = box(el);
      if (b.width === 0 || b.height === 0) continue;
      if (el.matches('.sl-cue') || el.children.length > 0) continue; // cues overlay the list edge; containers are checked via their leaves
      const tag = `${el.tagName}.${el.className}[${el.dataset.testid ?? ''}]`;
      if (b.left < inner.l - 1 || b.right > inner.r + 1 || b.top < inner.t - 1 || b.bottom > inner.b + 1) {
        out.push(`${tag} outside inner rect: ${[b.left, b.top, b.right, b.bottom].map(Math.round)} vs ${[inner.l, inner.t, inner.r, inner.b].map(Math.round)}`);
      }
      if (el.dataset.testid && /^tm-(name|line|breadcrumb)$/.test(el.dataset.testid) && !el.title && el.scrollWidth > el.clientWidth + 1) {
        out.push(`${tag} text is cut (${el.scrollWidth} > ${el.clientWidth})`);
      }
    }
    const sl = root.querySelector('.sl');
    if (sl) {
      const s = box(sl);
      for (const row of Array.from(root.querySelectorAll('.sl-row'))) {
        const b = box(row);
        if (b.top < s.top - 1 || b.bottom > s.bottom + 1) out.push(`.sl-row ${Math.round(b.top)}-${Math.round(b.bottom)} outside .sl ${Math.round(s.top)}-${Math.round(s.bottom)}`);
      }
      const bc = root.querySelector('[data-testid=tm-breadcrumb]');
      const ln = root.querySelector('[data-testid=tm-line]');
      if (bc && ln) {
        if (box(bc).bottom > s.top + 1) out.push('breadcrumb overlaps list');
        if (s.bottom > box(ln).top + 1) out.push('list overlaps entry line');
        if (parseFloat(getComputedStyle(ln).paddingBottom) < 4 * u - 0.5) out.push('entry line has < 4u of air below');
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
}

test('town map: nothing clips at world level, region level and on a country with photos', async ({ page }) => {
  await openMap(page);
  await expectFits(page);
  await stepTo(page, PHOTO_IDX);
  await expect(page.locator('[data-testid=tm-name]')).toContainText('photos');
  await expectFits(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=townmap]')).toHaveCount(0);
  await openMap(page);
  await zoomToMediterranean(page);
  await expectFits(page);
  // the breadcrumb has 4u of air above its text
  const pad = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=tm-breadcrumb]') as HTMLElement;
    return parseFloat(getComputedStyle(b).paddingTop);
  });
  expect(pad).toBeGreaterThanOrEqual(4);
});

test('town map: top-screen label at sub-level shows just the region name (not full breadcrumb)', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);

  const label = page.locator('.tm-top [aria-hidden="true"]').last();
  // Should say "TOWN MAP · Mediterranean", NOT "TOWN MAP · World › Mediterranean"
  await expect(label).toContainText('Mediterranean');
  const text = await label.textContent() ?? '';
  expect(text).not.toContain('World');
});

test('town map: world-level region card shows member country names in the detail row', async ({ page }) => {
  await openMap(page);
  await selectMediterranean(page);

  // tm-line now carries the member names for region entries at world level
  const detail = page.locator('[data-testid=tm-line]');
  await expect(detail).toBeVisible();
  const text = await detail.textContent();
  // All member country names should appear in the text
  for (const name of ['France', 'Spain', 'Portugal', 'Italy', 'Morocco', 'Tunisia', 'Greece']) {
    expect(text).toContain(name);
  }
});

test('town map: world-level detail row is inside the card boundary', async ({ page }) => {
  await openMap(page);
  await selectMediterranean(page);

  // The detail row (tm-line) must be fully inside the overlay card
  const cardBox = await page.locator('[data-testid=townmap]').boundingBox();
  const lineBox = await page.locator('[data-testid=tm-line]').boundingBox();
  expect(cardBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  // Bottom edge of detail row must not exceed bottom edge of card
  expect(lineBox!.y + lineBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1);
});

test('town map: zoom to mediterranean → selected country has full-size highlight mask on top screen', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);

  // The full-size highlight mask element should be visible for the selected country (France)
  await expect(page.locator('[data-testid=tm-hl-mask]')).toBeVisible();
  const src = await page.locator('[data-testid=tm-hl-mask]').getAttribute('src');
  expect(src).toContain('france');

  // Navigate to Spain (idx 1) — highlight should update to spain mask
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid=tm-hl-mask]')).toBeVisible();
  const src2 = await page.locator('[data-testid=tm-hl-mask]').getAttribute('src');
  expect(src2).toContain('spain');
});

test('town map: region-map pins count equals region member count', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);

  // All member pins should be rendered in the zoomed top-screen map
  const medPlaces = PLACES.filter((p) => p.region === 'mediterranean');
  const regionPins = page.locator('[data-testid^="region-pin-"]');
  await expect(regionPins).toHaveCount(medPlaces.length);
});

test('town map: cluster pin has pixel-art badge element visible on world map', async ({ page }) => {
  await openMap(page);

  // The mediterranean pin should have a badge element
  const badge = page.locator('[data-testid="badge-mediterranean"]');
  await expect(badge).toBeVisible();
});

test('town map: sub-level entry line (tm-line) is inside overlay boundary', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);

  // The entry line at sub-level must not overflow outside the overlay
  const overlayBox = await page.locator('[data-testid=townmap]').boundingBox();
  const lineBox = await page.locator('[data-testid=tm-line]').boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  expect(lineBox!.y + lineBox!.height).toBeLessThanOrEqual(overlayBox!.y + overlayBox!.height + 1);
});

/* ---------- Town Map -> Photos -> B returns here ---------------------------- */

const photoCount = (id: string) => PHOTOS.filter((p) => p.place === id).length;
// first world-level PLACE (not a region) with photos, e.g. Japan
const PHOTO_IDX = WORLD_ENTRIES.findIndex((e) => e.kind === 'place' && photoCount(e.place.id) > 0);
const PHOTO_PLACE = (WORLD_ENTRIES[PHOTO_IDX] as { kind: 'place'; place: { id: string; name: string } }).place;
// first world-level place WITHOUT photos (A stays "Next")
const NO_PHOTO_IDX = WORLD_ENTRIES.findIndex((e) => e.kind === 'place' && photoCount(e.place.id) === 0);

async function stepTo(page: Page, idx: number) {
  for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`${idx + 1}/${WORLD_N}`);
}

test('town map: A says "Photos" on a place with photos, "Zoom" on a region, "Next" on a place without', async ({ page }) => {
  await openMap(page);
  await stepTo(page, PHOTO_IDX);
  await expect(page.locator('[data-testid=lbl-a]')).toHaveText('Photos');
  await expect(page.locator('[data-testid=tm-name]')).toContainText(`${PHOTO_PLACE.name} · ${photoCount(PHOTO_PLACE.id)} photos`);
  await page.keyboard.press('Escape');
  await openMap(page);
  await stepTo(page, MED_IDX);
  await expect(page.locator('[data-testid=lbl-a]')).toHaveText('Zoom');
  if (NO_PHOTO_IDX >= 0) {
    await page.keyboard.press('Escape');
    await openMap(page);
    await stepTo(page, NO_PHOTO_IDX);
    await expect(page.locator('[data-testid=lbl-a]')).toHaveText('Next');
  }
});

test('town map: Photos opens the board on that place; B returns to the same entry; B again closes, focus restored, world resumes', async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    window.__focus = document.activeElement;
    window.__game!.goTo('townmap');
  });
  await expect(page.locator('[data-testid=dialogue]')).toBeVisible({ timeout: 20_000 });
  const opened = await tile(page);
  await advanceDialogue(page);
  await expect(page.locator('[data-testid=townmap]')).toBeVisible();
  await stepTo(page, PHOTO_IDX);

  await page.keyboard.press('Space');
  const board = page.locator('[data-testid=corkboard]');
  await expect(board).toBeVisible();
  await expect(page.locator('[data-testid=townmap]')).toHaveCount(0);
  const n = photoCount(PHOTO_PLACE.id);
  await expect(board.locator('[data-testid=photo-filter-label]')).toHaveText(`${PHOTO_PLACE.name.toUpperCase()} ${n}`);
  await expect(page.locator('[data-testid=live]')).toContainText(`${PHOTO_PLACE.name}, ${n} photo`);
  await expect(page.locator('[data-testid=lbl-b]')).toHaveText('Map');
  // the player never walked downstairs: same tile and room the whole trip
  expect(await tile(page)).toEqual(opened);

  // enlarge, B back to the board (one level), then B back to the map at the same entry
  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=photo-enlarged]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=photo-enlarged]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=townmap]')).toBeVisible();
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`${PHOTO_IDX + 1}/${WORLD_N}`);
  await expect(page.locator('[data-testid=tm-name]')).toContainText(PHOTO_PLACE.name);
  await expect(page.locator('[data-testid=lbl-a]')).toHaveText('Photos');
  await expect(page.locator('[data-testid=lbl-b]')).toHaveText('Close');

  // second B closes: no overlay, same tile, focus back where it was, world resumed (the player can walk)
  await page.keyboard.press('Escape');
  await expect.poll(() => overlayCount(page)).toBe(0);
  expect(await tile(page)).toEqual(opened);
  expect(await page.evaluate(() => document.activeElement === window.__focus)).toBe(true);
  await page.evaluate(() => window.__game!.goTo('bed'));
  await expect.poll(async () => {
    const t = await tile(page);
    return `${t.x},${t.y}`;
  }).not.toBe(`${opened.x},${opened.y}`);
});

test('town map: Photos from inside a region returns to the region level, same country selected, same parent stack', async ({ page }) => {
  await openMap(page);
  await zoomToMediterranean(page);
  const med = WORLD_ENTRIES[MED_IDX] as { kind: 'region'; places: { id: string; name: string }[] };
  const idx = med.places.findIndex((p, i) => i > 0 && photoCount(p.id) > 0);
  expect(idx).toBeGreaterThan(0);
  const country = med.places[idx]!;
  for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid=lbl-a]')).toHaveText('Photos');

  await page.keyboard.press('Space');
  await expect(page.locator('[data-testid=photo-filter-label]')).toHaveText(`${country.name.toUpperCase()} ${photoCount(country.id)}`);
  // change the filter on the board; the map still comes back where it was
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');

  await expect(page.locator('[data-testid=tm-breadcrumb]')).toHaveText('World › Mediterranean');
  await expect(page.locator('[data-testid=tm-line]')).toBeVisible();
  await expect(page.locator(`[data-testid=scroll-list] .sl-row.sel`)).toContainText(country.name);
  // parent stack intact: B goes up to the world level on the Mediterranean entry, then closes
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=tm-counter]')).toHaveText(`${MED_IDX + 1}/${WORLD_N}`);
  await page.keyboard.press('Escape');
  await expect.poll(() => overlayCount(page)).toBe(0);
});
