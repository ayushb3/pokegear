/** Pure paging/selection maths for the photo board (one row of 4 photos a page). */
export const PAGE_SIZE = 4;
export type Dir = 'up' | 'down' | 'left' | 'right';

export const pageCount = (n: number): number => Math.max(1, Math.ceil(n / PAGE_SIZE));
export const pageOf = (sel: number): number => Math.floor(sel / PAGE_SIZE);
export const cellOf = (sel: number): number => sel % PAGE_SIZE;
/** Indices shown on the page that holds `sel`. */
export function pageIndices(sel: number, n: number): number[] {
  const start = pageOf(sel) * PAGE_SIZE;
  return Array.from({ length: Math.max(0, Math.min(PAGE_SIZE, n - start)) }, (_, i) => start + i);
}

/**
 * Move the selection over the (filtered) list. One row of 4 cells: left / right step one photo, so passing either end of the
 * row turns the page (wrapping at the ends of the list). Up / down jump a whole page back / forward (wrapping).
 *
 * Page-change rule (never keep the column): any page change lands on the FIRST photo of the new page, except stepping LEFT
 * from a page's first photo, which lands on the LAST photo of the previous page. Stepping one photo at a time gives that for
 * free; a page jump goes to `page * PAGE_SIZE`.
 */
export function move(sel: number, dir: Dir, n: number): number {
  if (n <= 0) return 0;
  if (dir === 'left' || dir === 'right') return (((sel + (dir === 'left' ? -1 : 1)) % n) + n) % n;
  const pages = pageCount(n);
  const page = (pageOf(sel) + (dir === 'up' ? -1 : 1) + pages) % pages;
  return page * PAGE_SIZE;
}

/* ---------- place filter -------------------------------------------------- */

/** One stop on the filter bar: `place: null` = every photo. */
export interface Filter {
  place: string | null;
  /** Bar label, upper case ("ALL", "UNITED STATES"). */
  label: string;
  /** Spoken / sentence-case name ("All photos", "United States"). */
  name: string;
  count: number;
}

/**
 * The filter bar's stops: ALL first, then one per place in order of FIRST APPEARANCE in `photos` (photos.json is ordered by trip,
 * newest first, so that is the trip order). Never sorted by anything else.
 */
export function filtersOf<T extends { place: string }>(photos: readonly T[], nameOf: (place: string) => string): Filter[] {
  const counts = new Map<string, number>();
  for (const p of photos) counts.set(p.place, (counts.get(p.place) ?? 0) + 1);
  const out: Filter[] = [{ place: null, label: 'ALL', name: 'All photos', count: photos.length }];
  for (const [place, count] of counts) {
    const name = nameOf(place);
    out.push({ place, label: name.toUpperCase(), name, count });
  }
  return out;
}

/** Step the filter bar by `delta`, wrapping at both ends. */
export const stepFilter = (i: number, delta: number, n: number): number => (n <= 0 ? 0 : (((i + delta) % n) + n) % n);

/** Index of the filter for `place` (0 = ALL when the place is unknown or has no photos). */
export function filterIndex(filters: readonly Filter[], place: string | null | undefined): number {
  if (!place) return 0;
  const i = filters.findIndex((f) => f.place === place);
  return i < 0 ? 0 : i;
}

/** The photos a filter shows, in their original order. */
export function applyFilter<T extends { place: string }>(photos: readonly T[], f: Filter | undefined): T[] {
  return !f || f.place === null ? [...photos] : photos.filter((p) => p.place === f.place);
}

/** Screen-reader line for a filter change ("Japan, 8 photos"). */
export const filterAnnouncement = (f: Filter): string => `${f.name}, ${f.count} ${f.count === 1 ? 'photo' : 'photos'}`;
