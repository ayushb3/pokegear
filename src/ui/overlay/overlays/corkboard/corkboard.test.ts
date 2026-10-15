import { describe, expect, it } from 'vitest';
import { applyFilter, cellOf, filterAnnouncement, filterIndex, filtersOf, move, pageCount, pageIndices, pageOf, stepFilter } from './board';
import { PHOTOS } from '../../../../content/photos';
import { PLACES } from '../../../../content/places';

describe('paging', () => {
  it('83 photos make 21 pages of 4', () => {
    expect(pageCount(83)).toBe(21);
    expect(pageCount(5)).toBe(2);
    expect(pageCount(0)).toBe(1);
  });

  it('page and cell of a selection', () => {
    expect(pageOf(0)).toBe(0);
    expect(pageOf(7)).toBe(1);
    expect(cellOf(7)).toBe(3);
  });

  it('pageIndices lists the page, shorter on a partial last page', () => {
    expect(pageIndices(5, 83)).toEqual([4, 5, 6, 7]);
    expect(pageIndices(9, 10)).toEqual([8, 9]);
  });
});

describe('move (one row of 4 per page)', () => {
  it('right and left step one photo and cross pages', () => {
    expect(move(0, 'right', 83)).toBe(1);
    expect(move(3, 'right', 83)).toBe(4);
    expect(move(4, 'left', 83)).toBe(3);
  });

  it('page-change rule: a page jump lands on the FIRST photo of the new page (never keeps the column)', () => {
    expect(move(1, 'down', 83)).toBe(4);
    expect(move(7, 'down', 83)).toBe(8);
    expect(move(6, 'up', 83)).toBe(0);
    expect(move(3, 'up', 83)).toBe(80); // first page -> last page (wraps), its first photo
    expect(move(81, 'down', 83)).toBe(0); // last page -> first page
    expect(move(79, 'down', 83)).toBe(80); // onto a partial last page: still its first photo
  });

  it('page-change rule: right past a page lands on the next first photo; left from a first photo on the previous last', () => {
    for (let page = 0; page < 20; page++) {
      expect(move(page * 4 + 3, 'right', 83)).toBe((page + 1) * 4);
      const back = move((page + 1) * 4, 'left', 83);
      expect([pageOf(back), cellOf(back)]).toEqual([page, 3]);
    }
  });

  it('wraps at both ends of the list', () => {
    expect(move(82, 'right', 83)).toBe(0); // last photo -> first page, first photo
    expect(move(0, 'left', 83)).toBe(82); // first photo -> LAST photo of the (partial) last page
    expect(move(0, 'left', 3)).toBe(2); // a single partial page
    expect(move(2, 'right', 3)).toBe(0);
    expect(move(1, 'down', 3)).toBe(0); // one page: a jump goes to its first photo
  });

  it('within a filter the same rule applies to the filtered list (8 photos = 2 pages)', () => {
    expect(move(3, 'right', 8)).toBe(4);
    expect(move(4, 'left', 8)).toBe(3);
    expect(move(0, 'left', 8)).toBe(7);
    expect(move(7, 'right', 8)).toBe(0);
    expect(move(2, 'down', 8)).toBe(4);
    expect(move(6, 'down', 8)).toBe(0);
  });

  it('handles an empty list', () => {
    expect(move(0, 'right', 0)).toBe(0);
  });
});

describe('place filter', () => {
  const photos = [
    { place: 'us' },
    { place: 'us' },
    { place: 'za' },
    { place: 'jp' },
    { place: 'za' }, // a place reappearing later keeps its FIRST position
    { place: 'jp' },
    { place: 'jp' },
  ];
  const names: Record<string, string> = { us: 'United States', za: 'South Africa', jp: 'Japan' };
  const F = filtersOf(photos, (id) => names[id] ?? id);

  it('ALL first, then places in order of first appearance, with counts', () => {
    expect(F.map((f) => [f.place, f.label, f.count])).toEqual([
      [null, 'ALL', 7],
      ['us', 'UNITED STATES', 2],
      ['za', 'SOUTH AFRICA', 2],
      ['jp', 'JAPAN', 3],
    ]);
  });

  it('wraps both ways', () => {
    expect(stepFilter(0, -1, F.length)).toBe(3);
    expect(stepFilter(3, 1, F.length)).toBe(0);
    expect(stepFilter(1, 1, F.length)).toBe(2);
    expect(stepFilter(0, 1, 0)).toBe(0);
  });

  it('applyFilter keeps the original order; ALL is everything', () => {
    expect(applyFilter(photos, F[0])).toEqual(photos);
    expect(applyFilter(photos, F[2])).toEqual([photos[2], photos[4]]);
  });

  it('filterIndex finds a place, falls back to ALL', () => {
    expect(filterIndex(F, 'jp')).toBe(3);
    expect(filterIndex(F, 'nowhere')).toBe(0);
    expect(filterIndex(F, null)).toBe(0);
  });

  it('announces "<Place>, n photos"', () => {
    expect(filterAnnouncement(F[3]!)).toBe('Japan, 3 photos');
    expect(filterAnnouncement({ place: 'x', label: 'X', name: 'X', count: 1 })).toBe('X, 1 photo');
    expect(filterAnnouncement(F[0]!)).toBe('All photos, 7 photos');
  });

  it('real photos.json: the filter bar follows trip order and counts add up', () => {
    const real = filtersOf(PHOTOS, (id) => PLACES.find((p) => p.id === id)?.name ?? id);
    const firstSeen: string[] = [];
    for (const p of PHOTOS) if (!firstSeen.includes(p.place)) firstSeen.push(p.place);
    expect(real.slice(1).map((f) => f.place)).toEqual(firstSeen);
    expect(real[0]!.count).toBe(PHOTOS.length);
    expect(real.slice(1).reduce((n, f) => n + f.count, 0)).toBe(PHOTOS.length);
    // every place id is a places.json place (so the bar shows a real name)
    for (const f of real.slice(1)) expect(PLACES.some((p) => p.id === f.place), f.place!).toBe(true);
  });
});
