/**
 * Places Ayush has been. `sample: true` while the owner is still typing the full list —
 * the overlay shows a "Sample" tag until this flag is removed.
 *
 * Shape: each place has a unique id, display name, one-line reason/context, and
 * country-level lat/lon (precise city coords are fine once known).
 *
 * Hierarchy:
 *   - `regions`: optional list of region groups (e.g. "mediterranean").
 *   - A place may carry `region: "<id>"` to belong to a region.
 *   - A place may carry `cities: [{ id, name, line, lat, lon }]` and `bbox`/`map` for a
 *     zoomed city-level map. City data is fixture-only until Ayush supplies real cities.
 *
 * To add more places: append to places.json, keep `sample: true` until the list is complete.
 * To add a region: add to the `regions` array and tag each place with `region: "<id>"`.
 * To add cities: add `bbox`, `map`, and `cities` to the place.
 */
import raw from './places.json' with { type: 'json' };

export interface City {
  id: string;
  name: string;
  line: string;
  lat: number;
  lon: number;
  /**
   * Asset slot key(s) for photos of this city (e.g. ["place.photo.france-paris-1"]).
   * Written by scripts/takeout/apply.py; the Town Map overlay does not display them yet.
   * Omit until photos are available.
   */
  photos?: string[];
}

export interface Place {
  id: string;
  name: string;
  /** One line: why/when the owner was there. */
  line: string;
  lat: number;
  lon: number;
  /** Optional photo asset slot key (e.g. "photo.uiuc"). Omit until a photo is available. */
  photo?: string;
  /**
   * ISO 3166-1 alpha-3 code for the country (used to look up Natural Earth shapes).
   * Hawaii and Alaska intentionally omit this (no country-level shape to highlight).
   */
  iso?: string;
  /** Region this place belongs to (references regions[].id). */
  region?: string;
  /** Zoomed map bounding box [lonW, latS, lonE, latN]. Required if cities is set. */
  bbox?: [number, number, number, number];
  /** Asset slot key for the zoomed map PNG (e.g. "townmap.italy"). */
  map?: string;
  /** Sub-places for a further zoom level. Fixture-only until Ayush supplies real cities. */
  cities?: City[];
}

export interface Region {
  /** Unique id, matches places[].region. */
  id: string;
  /** Display name, e.g. "Mediterranean". */
  name: string;
  /** Bounding box [lonW, latS, lonE, latN] for the zoomed map. */
  bbox: [number, number, number, number];
  /** Asset slot key for the region's map PNG (e.g. "townmap.mediterranean"). */
  map: string;
}

export interface PlacesData {
  sample: boolean;
  regions?: Region[];
  places: Place[];
}

export const PLACES_DATA: PlacesData = raw as PlacesData;
export const PLACES: Place[] = PLACES_DATA.places;
export const REGIONS: Region[] = PLACES_DATA.regions ?? [];
