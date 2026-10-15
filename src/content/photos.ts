/**
 * The photo board's content. `photos.json` = `{ photos: [{ id, place, where, slot, caption?, wall? }] }`.
 * `place` is a places.json id (the country); `where` is a short label ("Kyoto"); `caption` (optional) overrides `where`.
 * `wall: true` marks the three photos drawn on the corkboard art (scripts/draw-objects.py).
 * Shared by the overlay and the plain page /photos, so it must stay fs-free.
 */
import raw from './photos.json' with { type: 'json' };
import assets from '../assets/assets.json' with { type: 'json' };
import { PLACES } from './places';

export interface Photo {
  id: string;
  place: string;
  where: string;
  slot: string;
  caption?: string;
  wall?: boolean;
}

export const PHOTOS: Photo[] = raw.photos as Photo[];

/** Country name for a photo (its place's name; falls back to the id). */
export function countryOf(p: Photo): string {
  return PLACES.find((x) => x.id === p.place)?.name ?? p.place;
}

/** One-line caption: `caption ?? where`, plus the country when it differs ("Kyoto, Japan"). */
export function captionOf(p: Photo): string {
  const base = p.caption ?? p.where;
  const country = countryOf(p);
  return base === country ? base : `${base}, ${country}`;
}

/** Published image path for a photo (from its asset slot), or null. */
export function photoPath(p: Photo): string | null {
  const a = (assets as Record<string, { path?: string; placeholder?: boolean }>)[p.slot];
  return a && !a.placeholder && a.path ? a.path : null;
}

export interface PhotoGroup {
  place: string;
  country: string;
  photos: Photo[];
}

/** Photos grouped by place, in photos.json order of first appearance. */
export function groupByPlace(photos: Photo[] = PHOTOS): PhotoGroup[] {
  const groups: PhotoGroup[] = [];
  for (const p of photos) {
    let g = groups.find((x) => x.place === p.place);
    if (!g) {
      g = { place: p.place, country: countryOf(p), photos: [] };
      groups.push(g);
    }
    g.photos.push(p);
  }
  return groups;
}
