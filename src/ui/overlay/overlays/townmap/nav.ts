/**
 * Pure navigation state and reducer for the Town Map drill-down.
 *
 * Levels:
 *   'world'  – world map (top screen); bottom shows the world list / region stubs
 *   'region' – zoomed in; top screen still world map + region bbox frame;
 *               bottom is a Pokégear split: inset map + ScrollList of region's places
 *   'place'  – inside a place with cities; same split with place's cities
 *
 * State now carries a `stack` of parent frames so `back` is self-contained —
 * no sentinel states or component-side patching.
 *
 * The reducer is pure and has no side effects; import it in tests directly.
 */
import type { Place, Region, City } from '../../../../content/places';

// ─── Entry types ─────────────────────────────────────────────────────────────

/** A standalone place (no region) shown at world level. */
export interface WorldPlace {
  kind: 'place';
  place: Place;
}
/** A region stub (collapsed from several places) shown at world level. */
export interface WorldRegion {
  kind: 'region';
  region: Region;
  /** Places within this region, in original places.json order. */
  places: Place[];
}

export type WorldEntry = WorldPlace | WorldRegion;

/** A place shown at region level. */
export interface RegionEntry {
  kind: 'place';
  place: Place;
}

/** A city shown at place level. */
export interface CityEntry {
  kind: 'city';
  city: City;
}

// ─── State ────────────────────────────────────────────────────────────────────

/** A saved parent frame pushed onto the stack when drilling down. */
export interface StackFrame {
  level: 'world' | 'region';
  entries: WorldEntry[] | RegionEntry[];
  idx: number;
  /** Region context (only present when level is 'region'). */
  region?: Region;
  place?: Place;
  worldIdx?: number;
}

export interface WorldState {
  level: 'world';
  entries: WorldEntry[];
  idx: number;
  /** Parent frames — empty at world level. */
  stack: StackFrame[];
}

export interface RegionState {
  level: 'region';
  region: Region;
  entries: RegionEntry[];
  idx: number;
  /** Where in the world list we came from (for worldSelIdx computation). */
  worldIdx: number;
  /** Parent frames — one frame (the world state) at region level. */
  stack: StackFrame[];
}

export interface PlaceState {
  level: 'place';
  place: Place;
  /**
   * The region this place belongs to, or `undefined` when the place was reached
   * directly from world level (i.e. a world-level place with cities).
   * Check `fromWorld` rather than testing `region` — the flag is the canonical signal.
   */
  region?: Region;
  /** True when reached from world level directly (no region parent). */
  fromWorld?: boolean;
  entries: CityEntry[];
  idx: number;
  /** Where in the world list (for worldSelIdx computation). */
  worldIdx: number;
  /** Parent frames — two frames (world + region) at place level. */
  stack: StackFrame[];
}

export type NavState = WorldState | RegionState | PlaceState;

// ─── Actions ─────────────────────────────────────────────────────────────────

export type NavAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'setIdx'; idx: number }
  | { type: 'zoom' }            // A on a zoomable entry; non-zoomable = 'next'
  | { type: 'back' }            // B: up one level; at world = close (component handles)
  | { type: 'toWorld'; idx: number };  // jump straight to world level at the given idx

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** True if the current selection is zoomable (region, or place-with-cities). */
export function isZoomable(state: NavState): boolean {
  if (state.level === 'world') {
    const e = state.entries[state.idx];
    return e?.kind === 'region' || (e?.kind === 'place' && (e.place.cities?.length ?? 0) > 0);
  }
  if (state.level === 'region') {
    const e = state.entries[state.idx];
    return e?.kind === 'place' && (e.place.cities?.length ?? 0) > 0;
  }
  return false; // place level: cities have no deeper level
}

/** Build the world-level entries from places + regions, preserving place order. */
export function buildWorldEntries(places: Place[], regions: Region[]): WorldEntry[] {
  const regionMap = new Map(regions.map((r) => [r.id, r]));
  const regionPlacesMap = new Map<string, Place[]>();

  const entries: WorldEntry[] = [];
  const seenRegions = new Set<string>();

  for (const place of places) {
    if (place.region) {
      const reg = regionMap.get(place.region);
      if (!reg) {
        // unknown region — treat as standalone
        entries.push({ kind: 'place', place });
        continue;
      }
      if (!seenRegions.has(place.region)) {
        seenRegions.add(place.region);
        const arr: Place[] = [];
        regionPlacesMap.set(place.region, arr);
        entries.push({ kind: 'region', region: reg, places: arr });
      }
      regionPlacesMap.get(place.region)!.push(place);
    } else {
      entries.push({ kind: 'place', place });
    }
  }
  return entries;
}

/** Initial world state from content data. */
export function initWorld(places: Place[], regions: Region[]): WorldState {
  return { level: 'world', entries: buildWorldEntries(places, regions), idx: 0, stack: [] };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure, self-contained reducer. Returns the next state.
 *
 * `back` at world level returns the same state unchanged —
 * the component detects `level === 'world'` before dispatching and calls `ctx.close()`.
 *
 * `back` at any sub-level pops the parent stack to restore the exact parent state,
 * with entries and idx intact — no sentinel states, no component-side patching.
 */
export function navReducer(state: NavState, action: NavAction): NavState {
  const len = state.entries.length;

  switch (action.type) {
    case 'next':
      if (len === 0) return state;
      return { ...state, idx: mod(state.idx + 1, len) } as NavState;

    case 'prev':
      if (len === 0) return state;
      return { ...state, idx: mod(state.idx - 1, len) } as NavState;

    case 'setIdx': {
      if (len === 0) return state;
      const clamped = Math.max(0, Math.min(action.idx, len - 1));
      return { ...state, idx: clamped } as NavState;
    }

    case 'zoom': {
      if (state.level === 'world') {
        const e = state.entries[state.idx];
        if (!e) return state;

        if (e.kind === 'region') {
          const frame: StackFrame = {
            level: 'world',
            entries: state.entries,
            idx: state.idx,
          };
          return {
            level: 'region',
            region: e.region,
            entries: e.places.map((p): RegionEntry => ({ kind: 'place', place: p })),
            idx: 0,
            worldIdx: state.idx,
            stack: [...state.stack, frame],
          };
        }
        if (e.kind === 'place' && (e.place.cities?.length ?? 0) > 0) {
          // World-level place with cities — zoom straight to place level.
          // breadcrumb: "World › <place name>"
          const frame: StackFrame = {
            level: 'world',
            entries: state.entries,
            idx: state.idx,
          };
          return {
            level: 'place',
            place: e.place,
            fromWorld: true,
            entries: (e.place.cities ?? []).map((c): CityEntry => ({ kind: 'city', city: c })),
            idx: 0,
            worldIdx: state.idx,
            stack: [...state.stack, frame],
          };
        }
        // non-zoomable: advance
        return navReducer(state, { type: 'next' });
      }

      if (state.level === 'region') {
        const e = state.entries[state.idx];
        if (e?.kind === 'place' && (e.place.cities?.length ?? 0) > 0) {
          const frame: StackFrame = {
            level: 'region',
            entries: state.entries,
            idx: state.idx,
            region: state.region,
            worldIdx: state.worldIdx,
          };
          return {
            level: 'place',
            place: e.place,
            region: state.region,
            entries: (e.place.cities ?? []).map((c): CityEntry => ({ kind: 'city', city: c })),
            idx: 0,
            worldIdx: state.worldIdx,
            stack: [...state.stack, frame],
          };
        }
        // non-zoomable: advance
        return navReducer(state, { type: 'next' });
      }

      if (state.level === 'place') {
        // no deeper level: advance
        return navReducer(state, { type: 'next' });
      }

      return state;
    }

    case 'back': {
      if (state.level === 'world') {
        // world level: close (caller handles)
        return state;
      }
      // Pop the parent frame from the stack.
      const parentFrame = state.stack[state.stack.length - 1];
      if (!parentFrame) return state; // should not happen

      const parentStack = state.stack.slice(0, -1);

      if (parentFrame.level === 'world') {
        return {
          level: 'world',
          entries: parentFrame.entries as WorldEntry[],
          idx: parentFrame.idx,
          stack: parentStack,
        };
      }
      if (parentFrame.level === 'region') {
        return {
          level: 'region',
          region: parentFrame.region!,
          entries: parentFrame.entries as RegionEntry[],
          idx: parentFrame.idx,
          worldIdx: parentFrame.worldIdx ?? 0,
          stack: parentStack,
        };
      }
      return state;
    }

    case 'toWorld': {
      // Jump directly to the world level from any depth.
      // Unwind the stack to find the world frame.
      if (state.level === 'world') {
        if (len === 0) return state;
        const clamped = Math.max(0, Math.min(action.idx, len - 1));
        return { ...state, idx: clamped };
      }
      // Find the world frame at the bottom of the stack.
      const worldFrame = state.stack[0];
      if (!worldFrame || worldFrame.level !== 'world') return state;
      const worldEntries = worldFrame.entries as WorldEntry[];
      if (worldEntries.length === 0) return state;
      return {
        level: 'world',
        entries: worldEntries,
        idx: Math.max(0, Math.min(action.idx, worldEntries.length - 1)),
        stack: [],
      };
    }
  }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Current entry's display name. */
export function entryName(state: NavState): string {
  if (state.level === 'world') {
    const e = state.entries[state.idx];
    if (!e) return '';
    return e.kind === 'region' ? e.region.name : e.place.name;
  }
  if (state.level === 'region') {
    return state.entries[state.idx]?.place.name ?? '';
  }
  if (state.level === 'place') {
    return state.entries[state.idx]?.city.name ?? '';
  }
  return '';
}

/** Current entry's subtitle line. */
export function entryLine(state: NavState): string {
  if (state.level === 'world') {
    const e = state.entries[state.idx];
    if (!e) return '';
    if (e.kind === 'region') {
      const n = e.places.length;
      return `${n} ${n === 1 ? 'place' : 'places'} · A to zoom`;
    }
    return e.place.line;
  }
  if (state.level === 'region') {
    return state.entries[state.idx]?.place.line ?? '';
  }
  if (state.level === 'place') {
    return state.entries[state.idx]?.city.line ?? '';
  }
  return '';
}

/** Breadcrumb shown above the card at region/place levels. Empty string at world. */
export function breadcrumb(state: NavState): string {
  if (state.level === 'region') return `World › ${state.region.name}`;
  if (state.level === 'place') {
    // Place reached directly from world (no region parent): "World › <place name>"
    if (state.fromWorld || !state.region) {
      return `World › ${state.place.name}`;
    }
    return `World › ${state.region.name} › ${state.place.name}`;
  }
  return '';
}

/** Asset slot key for the inset map at the current sub-level. Null at world level. */
export function insetSlot(state: NavState): string | null {
  if (state.level === 'region') return `${state.region.map}-inset`;
  if (state.level === 'place') return state.place.map ? `${state.place.map}-inset` : null;
  return null;
}

/** Raw bbox for pin projection at the current sub-level. Null at world level (use world project()). */
export function levelBbox(state: NavState): [number, number, number, number] | null {
  if (state.level === 'region') return state.region.bbox;
  if (state.level === 'place') {
    if (state.fromWorld || !state.region) return state.place.bbox ?? null;
    return state.place.bbox ?? state.region.bbox;
  }
  return null;
}

/** The lat/lon for the currently selected entry (for pin highlighting on the world map). */
export function selectedLatLon(state: NavState): { lat: number; lon: number } | null {
  if (state.level === 'world') {
    const e = state.entries[state.idx];
    if (!e) return null;
    if (e.kind === 'place') return { lat: e.place.lat, lon: e.place.lon };
    if (e.kind === 'region') {
      // centroid of region places
      const { places } = e;
      if (places.length === 0) return null;
      const lat = places.reduce((s, p) => s + p.lat, 0) / places.length;
      const lon = places.reduce((s, p) => s + p.lon, 0) / places.length;
      return { lat, lon };
    }
  }
  if (state.level === 'region') {
    const e = state.entries[state.idx];
    return e ? { lat: e.place.lat, lon: e.place.lon } : null;
  }
  if (state.level === 'place') {
    const e = state.entries[state.idx];
    return e ? { lat: e.city.lat, lon: e.city.lon } : null;
  }
  return null;
}

// ─── Serialisable position (for a return trip) ───────────────────────────────

/**
 * The nav position as plain indices: each parent frame's idx, then the current idx.
 * World [i]; region [worldIdx, i]; place [worldIdx, (regionIdx,) i]. JSON-safe, so it can travel in overlay props.
 */
export function navPath(state: NavState): number[] {
  return [...state.stack.map((f) => f.idx), state.idx];
}

/**
 * Rebuild a nav state from `navPath()` by replaying it on `init`: select path[0], zoom, select path[1], ...
 * Stops early (keeping what it reached) if a step is out of range or not zoomable, so stale paths never throw.
 */
export function restoreNav(init: NavState, path: readonly unknown[] | null | undefined): NavState {
  if (!Array.isArray(path) || path.length === 0) return init;
  const ok = (v: unknown, len: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < len;
  if (!ok(path[0], init.entries.length)) return init;
  let s = navReducer(init, { type: 'setIdx', idx: path[0] });
  for (let k = 1; k < path.length; k++) {
    if (!isZoomable(s)) break;
    const z = navReducer(s, { type: 'zoom' });
    const v = path[k];
    if (!ok(v, z.entries.length)) break;
    s = navReducer(z, { type: 'setIdx', idx: v });
  }
  return s;
}

/**
 * The place whose photos "Photos" would show for the current selection, or null (then A keeps Zoom / Next).
 *  - world / region level: the selected PLACE when it is not zoomable (A is free) and has photos.
 *    A region pin (e.g. Mediterranean) never offers Photos: A zooms; pick a country inside it instead.
 *  - city level: never (A there is "Next" through the cities). A place with cities is zoomable, so its photos are not offered
 *    either; today no place has cities. Revisit when one does.
 */
export function photoPlace(state: NavState, hasPhotos: (placeId: string) => boolean): string | null {
  if (state.level === 'place') return null;
  if (isZoomable(state)) return null;
  const e = state.entries[state.idx];
  if (!e || e.kind !== 'place') return null;
  return hasPhotos(e.place.id) ? e.place.id : null;
}
