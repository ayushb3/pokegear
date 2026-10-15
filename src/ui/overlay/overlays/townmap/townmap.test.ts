import { describe, expect, it } from 'vitest';
import { badgeSize } from './MapTop';
import { PLACES, PLACES_DATA, REGIONS } from '../../../../content/places';
import assets from '../../../../assets/assets.json';
import {
  project,
  projectBbox,
  projectRegion,
  padBbox,
  MAP_W,
  MAP_H,
  LON_MIN,
  LON_MAX,
  LAT_MAX,
  LAT_MIN,
} from './projection';
import {
  buildWorldEntries,
  initWorld,
  isZoomable,
  navReducer,
  breadcrumb,
  entryLine,
  entryName,
  insetSlot,
  mod,
  navPath,
  photoPlace,
  restoreNav,
  type WorldState,
  type RegionState,
  type PlaceState,
  type NavState,
} from './nav';
import type { Place, Region, City } from '../../../../content/places';

// ─── places.json shape ────────────────────────────────────────────────────────
describe('places data', () => {
  it('has at least one place', () => {
    expect(PLACES.length).toBeGreaterThan(0);
  });

  it('all place ids are unique', () => {
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every place has a non-empty name and line', () => {
    for (const p of PLACES) {
      expect(p.name.length, `${p.id}.name`).toBeGreaterThan(0);
      expect(p.line.length, `${p.id}.line`).toBeGreaterThan(0);
    }
  });

  it('every lat is in [-90, 90] and lon in [-180, 180]', () => {
    for (const p of PLACES) {
      expect(p.lat, `${p.id}.lat`).toBeGreaterThanOrEqual(-90);
      expect(p.lat, `${p.id}.lat`).toBeLessThanOrEqual(90);
      expect(p.lon, `${p.id}.lon`).toBeGreaterThanOrEqual(-180);
      expect(p.lon, `${p.id}.lon`).toBeLessThanOrEqual(180);
    }
  });

  it('every world pin projects inside the 256x192 image', () => {
    for (const p of PLACES) {
      const [x, y] = project(p.lon, p.lat);
      expect(x, `${p.id} x`).toBeGreaterThanOrEqual(0);
      expect(x, `${p.id} x`).toBeLessThanOrEqual(MAP_W);
      expect(y, `${p.id} y`).toBeGreaterThanOrEqual(0);
      expect(y, `${p.id} y`).toBeLessThanOrEqual(MAP_H);
    }
  });

  it('PLACES_DATA.sample is a boolean', () => {
    expect(typeof PLACES_DATA.sample).toBe('boolean');
  });

  it('includes the two known places', () => {
    const ids = new Set(PLACES.map((p) => p.id));
    expect(ids.has('italy')).toBe(true);
    expect(ids.has('japan')).toBe(true);
  });

  it('mediterranean region is defined with correct fields', () => {
    const med = REGIONS.find((r) => r.id === 'mediterranean');
    expect(med).toBeDefined();
    expect(med!.name).toBe('Mediterranean');
    expect(med!.bbox).toHaveLength(4);
    expect(med!.map).toBe('townmap.mediterranean');
  });

  it('mediterranean region has the five expected places tagged', () => {
    const medIds = new Set(
      PLACES.filter((p) => p.region === 'mediterranean').map((p) => p.id),
    );
    expect(medIds.has('france')).toBe(true);
    expect(medIds.has('spain')).toBe(true);
    expect(medIds.has('portugal')).toBe(true);
    expect(medIds.has('italy')).toBe(true);
    expect(medIds.has('morocco')).toBe(true);
  });

  it('every place region references a known region id', () => {
    const regionIds = new Set(REGIONS.map((r) => r.id));
    for (const p of PLACES) {
      if (p.region) {
        expect(regionIds.has(p.region), `${p.id}.region`).toBe(true);
      }
    }
  });

  it('every region map slot and its -inset slot exist in assets.json', () => {
    for (const r of REGIONS) {
      const slot = r.map as keyof typeof assets;
      const inset = `${r.map}-inset` as keyof typeof assets;
      expect(assets[slot], `region ${r.id}: slot ${r.map}`).toBeDefined();
      expect(assets[inset], `region ${r.id}: slot ${r.map}-inset`).toBeDefined();
    }
  });

  it('every place with a map slot has that slot and its -inset slot in assets.json', () => {
    for (const p of PLACES) {
      if (p.map) {
        const slot = p.map as keyof typeof assets;
        const inset = `${p.map}-inset` as keyof typeof assets;
        expect(assets[slot], `place ${p.id}: slot ${p.map}`).toBeDefined();
        expect(assets[inset], `place ${p.id}: slot ${p.map}-inset`).toBeDefined();
      }
    }
  });
});

// ─── world projection ─────────────────────────────────────────────────────────
describe('projection', () => {
  it('top-left corner maps to (0, 0)', () => {
    const [x, y] = project(LON_MIN, LAT_MAX);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  it('bottom-right corner maps to (MAP_W, MAP_H)', () => {
    const [x, y] = project(LON_MAX, LAT_MIN);
    expect(x).toBe(MAP_W);
    expect(y).toBe(MAP_H);
  });

  it('Greenwich meridian/equator projects near the centre', () => {
    const [x, y] = project(0, 0);
    expect(x).toBe(128);
    const expectedY = Math.round((LAT_MAX / (LAT_MAX - LAT_MIN)) * MAP_H);
    expect(y).toBe(expectedY);
  });

  it('Japan projects into the right half of the map', () => {
    const [x] = project(138.25, 36.2);
    expect(x).toBeGreaterThan(MAP_W / 2);
    expect(x).toBeLessThanOrEqual(MAP_W);
  });
});

// ─── bbox projection ──────────────────────────────────────────────────────────
describe('projectBbox', () => {
  it('projects the top-left corner of a bbox to (0, 0)', () => {
    // top-left = (lonW, latN) → x=0, y=0
    const [x, y] = projectBbox(-10, 60, -10, 30, 40, 60);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  it('projects the bottom-right corner of a bbox to (MAP_W, MAP_H)', () => {
    // bottom-right = (lonE, latS) → x=MAP_W, y=MAP_H
    const [x, y] = projectBbox(40, 30, -10, 30, 40, 60);
    expect(x).toBe(MAP_W);
    expect(y).toBe(MAP_H);
  });

  it('projects a midpoint correctly', () => {
    // lon = -10..40 (span 50), lat = 30..60 (span 30)
    // midpoint lon = 15, lat = 45
    const [x, y] = projectBbox(15, 45, -10, 30, 40, 60);
    expect(x).toBe(Math.round(((15 - (-10)) / 50) * MAP_W)); // 128
    expect(y).toBe(Math.round(((60 - 45) / 30) * MAP_H)); // 96
  });
});

// ─── padBbox ──────────────────────────────────────────────────────────────────
describe('padBbox', () => {
  it('pads a too-tall bbox to 4:3', () => {
    // 4:3 bbox: 40 lon span, 30 lat span → ratio = 4/3 already exact
    const [lonW, latS, lonE, latN] = padBbox(-10, 30, 30, 60);
    expect(lonE - lonW).toBeCloseTo((latN - latS) * (MAP_W / MAP_H), 5);
  });

  it('pads a too-wide bbox to 4:3', () => {
    // 80 lon span, 10 lat span → too wide → expand lat
    const [lonW, latS, lonE, latN] = padBbox(-40, 45, 40, 55);
    expect(lonE - lonW).toBeCloseTo((latN - latS) * (MAP_W / MAP_H), 5);
  });

  it('returns unchanged if already 4:3', () => {
    const [lonW, latS, lonE, latN] = padBbox(0, 0, 40, 30);
    expect(lonW).toBeCloseTo(0);
    expect(latS).toBeCloseTo(0);
    expect(lonE).toBeCloseTo(40);
    expect(latN).toBeCloseTo(30);
  });

  it('is symmetric (expansion is centred)', () => {
    const raw: [number, number, number, number] = [-10, 30, 10, 60];
    const [lonW, , lonE] = padBbox(...raw);
    const centreRaw = (-10 + 10) / 2;
    const centrePadded = (lonW + lonE) / 2;
    expect(centrePadded).toBeCloseTo(centreRaw, 5);
  });
});

// ─── projectRegion ────────────────────────────────────────────────────────────
describe('projectRegion', () => {
  it('projects a point inside the mediterranean bbox to a valid pixel', () => {
    const medBbox: [number, number, number, number] = [-15, 25, 30, 72];
    const [x, y] = projectRegion(2.2, 46.6, medBbox); // France centroid
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(MAP_W);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(MAP_H);
  });

  it('uses padded bbox (same centroid as padBbox)', () => {
    const bbox: [number, number, number, number] = [-15, 25, 30, 72];
    const [lonW, latS, lonE, latN] = padBbox(...bbox);
    const [x1] = projectBbox(2.2, 46.6, lonW, latS, lonE, latN);
    const [x2] = projectRegion(2.2, 46.6, bbox);
    expect(x1).toBe(x2);
  });
});

// ─── buildWorldEntries ────────────────────────────────────────────────────────
describe('buildWorldEntries', () => {
  const PLACES_FIXTURE: Place[] = [
    { id: 'uiuc', name: 'UIUC', line: 'Study', lat: 40, lon: -88 },
    { id: 'france', name: 'France', line: 'Visit', lat: 46, lon: 2, region: 'mediterranean' },
    { id: 'spain', name: 'Spain', line: 'Visit', lat: 40, lon: -3, region: 'mediterranean' },
    { id: 'japan', name: 'Japan', line: 'Visit', lat: 36, lon: 138 },
    { id: 'italy', name: 'Italy', line: 'Visit', lat: 42, lon: 12, region: 'mediterranean' },
  ];
  const REGIONS_FIXTURE: Region[] = [
    { id: 'mediterranean', name: 'Mediterranean', bbox: [-15, 25, 30, 72], map: 'townmap.mediterranean' },
  ];

  it('collapses all mediterranean places into one region stub', () => {
    const entries = buildWorldEntries(PLACES_FIXTURE, REGIONS_FIXTURE);
    const regions = entries.filter((e) => e.kind === 'region');
    expect(regions).toHaveLength(1);
    expect((regions[0] as { kind: 'region'; region: Region }).region.id).toBe('mediterranean');
  });

  it('preserves the order of entries (region appears where first member appears)', () => {
    const entries = buildWorldEntries(PLACES_FIXTURE, REGIONS_FIXTURE);
    // uiuc first, then mediterranean region (first mediterranean place = france at idx 1), then japan
    expect(entries[0]!.kind).toBe('place');
    expect((entries[0] as { kind: 'place'; place: Place }).place.id).toBe('uiuc');
    expect(entries[1]!.kind).toBe('region');
    expect(entries[2]!.kind).toBe('place');
    expect((entries[2] as { kind: 'place'; place: Place }).place.id).toBe('japan');
  });

  it('region stub contains all three mediterranean places in order', () => {
    const entries = buildWorldEntries(PLACES_FIXTURE, REGIONS_FIXTURE);
    const regionEntry = entries.find((e) => e.kind === 'region') as
      | { kind: 'region'; places: Place[] }
      | undefined;
    expect(regionEntry).toBeDefined();
    const ids = regionEntry!.places.map((p) => p.id);
    expect(ids).toEqual(['france', 'spain', 'italy']);
  });

  it('treats places with unknown region as standalone', () => {
    const orphan: Place = { id: 'orphan', name: 'X', line: 'x', lat: 0, lon: 0, region: 'unknown' };
    const entries = buildWorldEntries([orphan], []);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe('place');
  });

  it('handles places with no regions', () => {
    const standalone: Place[] = [
      { id: 'a', name: 'A', line: 'la', lat: 0, lon: 0 },
      { id: 'b', name: 'B', line: 'lb', lat: 10, lon: 10 },
    ];
    const entries = buildWorldEntries(standalone, []);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === 'place')).toBe(true);
  });
});

// ─── mod helper ───────────────────────────────────────────────────────────────
describe('mod', () => {
  it('wraps negative numbers', () => {
    expect(mod(-1, 5)).toBe(4);
  });
  it('wraps forward', () => {
    expect(mod(6, 5)).toBe(1);
  });
});

// ─── navReducer: world level ──────────────────────────────────────────────────
describe('navReducer — world level', () => {
  const PLACES_FIXTURE: Place[] = [
    { id: 'uiuc', name: 'UIUC', line: 'Study', lat: 40, lon: -88 },
    { id: 'france', name: 'France', line: 'Visit', lat: 46, lon: 2, region: 'mediterranean' },
    { id: 'spain', name: 'Spain', line: 'Visit', lat: 40, lon: -3, region: 'mediterranean' },
    { id: 'japan', name: 'Japan', line: 'Visit', lat: 36, lon: 138 },
  ];
  const REGIONS_FIXTURE: Region[] = [
    { id: 'mediterranean', name: 'Mediterranean', bbox: [-15, 25, 30, 72], map: 'townmap.mediterranean' },
  ];

  function world(): WorldState {
    return initWorld(PLACES_FIXTURE, REGIONS_FIXTURE);
  }

  it('initial state starts at idx 0, world level', () => {
    const s = world();
    expect(s.level).toBe('world');
    expect(s.idx).toBe(0);
  });

  it('stack is empty at world level', () => {
    const s = world();
    expect(s.stack).toHaveLength(0);
  });

  it('next wraps around', () => {
    let s: NavState = world();
    const N = s.entries.length;
    for (let i = 0; i < N; i++) s = navReducer(s, { type: 'next' });
    expect(s.idx).toBe(0);
  });

  it('prev wraps backward', () => {
    const s = navReducer(world(), { type: 'prev' });
    const N = world().entries.length;
    expect(s.idx).toBe(N - 1);
  });

  it('setIdx clamps', () => {
    const s = navReducer(world(), { type: 'setIdx', idx: 999 });
    expect(s.idx).toBe(world().entries.length - 1);
  });

  it('zoom on region → region state', () => {
    // Navigate to the mediterranean region entry
    let s: NavState = world();
    while (s.level === 'world') {
      const e = s.entries[s.idx];
      if (e?.kind === 'region') break;
      s = navReducer(s, { type: 'next' });
    }
    const after = navReducer(s, { type: 'zoom' });
    expect(after.level).toBe('region');
  });

  it('back at world level returns world (component handles close)', () => {
    const s = world();
    const after = navReducer(s, { type: 'back' });
    // back at world: no state change (returns the same world level)
    expect(after.level).toBe('world');
  });

  it('zoom on non-zoomable place advances', () => {
    const s = world(); // idx 0 = uiuc (standalone place, no cities)
    const after = navReducer(s, { type: 'zoom' });
    expect(after.level).toBe('world');
    expect((after as WorldState).idx).toBe(1);
  });

  it('world-level place with cities is zoomable', () => {
    const cities: City[] = [{ id: 'c1', name: 'City', line: 'L', lat: 35, lon: 135 }];
    const places: Place[] = [
      { id: 'japan', name: 'Japan', line: 'Visit', lat: 36, lon: 138, cities, bbox: [130, 30, 145, 45] },
    ];
    const s = initWorld(places, []);
    expect(isZoomable(s)).toBe(true);
  });

  it('zoom on world-level place with cities goes straight to place level', () => {
    const cities: City[] = [
      { id: 'tokyo', name: 'Tokyo', line: 'Capital', lat: 35.7, lon: 139.7 },
      { id: 'osaka', name: 'Osaka', line: 'Second city', lat: 34.7, lon: 135.5 },
    ];
    const places: Place[] = [
      {
        id: 'japan',
        name: 'Japan',
        line: 'Visit',
        lat: 36,
        lon: 138,
        cities,
        bbox: [130, 30, 145, 45],
        map: 'townmap.japan',
      },
    ];
    const s = initWorld(places, []);
    const after = navReducer(s, { type: 'zoom' });
    expect(after.level).toBe('place');
    expect((after as PlaceState).entries).toHaveLength(2);
    expect((after as PlaceState).entries[0]!.city.id).toBe('tokyo');
    // breadcrumb: "World › Japan"
    expect(breadcrumb(after)).toBe('World › Japan');
    // stack has the world frame
    expect(after.stack).toHaveLength(1);
    expect(after.stack[0]!.level).toBe('world');
  });
});

// ─── navReducer: region level ─────────────────────────────────────────────────
describe('navReducer — region level', () => {
  const PLACES_FIXTURE: Place[] = [
    { id: 'france', name: 'France', line: 'Visit', lat: 46, lon: 2, region: 'mediterranean' },
    { id: 'spain', name: 'Spain', line: 'Visit', lat: 40, lon: -3, region: 'mediterranean' },
    { id: 'japan', name: 'Japan', line: 'Visit', lat: 36, lon: 138 },
  ];
  const REGIONS_FIXTURE: Region[] = [
    { id: 'mediterranean', name: 'Mediterranean', bbox: [-15, 25, 30, 72], map: 'townmap.mediterranean' },
  ];

  function regionState(): RegionState {
    let s: NavState = initWorld(PLACES_FIXTURE, REGIONS_FIXTURE);
    // First entry at world is mediterranean region
    s = navReducer(s, { type: 'zoom' });
    expect(s.level).toBe('region');
    return s as RegionState;
  }

  it('region state has correct entries', () => {
    const s = regionState();
    expect(s.entries).toHaveLength(2); // france and spain
    expect(s.entries[0]!.kind).toBe('place');
  });

  it('stack has one world frame', () => {
    const s = regionState();
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]!.level).toBe('world');
  });

  it('breadcrumb shows region name', () => {
    const s = regionState();
    expect(breadcrumb(s)).toBe('World › Mediterranean');
  });

  it('entryName returns place name', () => {
    const s = regionState();
    expect(entryName(s)).toBe('France');
  });

  it('back from region restores full world state with correct idx', () => {
    const s = regionState();
    const back = navReducer(s, { type: 'back' });
    // Full world state — not a sentinel
    expect(back.level).toBe('world');
    expect((back as WorldState).entries.length).toBeGreaterThan(0);
    // idx is 0 (mediterranean was the first entry at world level)
    expect((back as WorldState).idx).toBe(0);
  });

  it('next at region wraps', () => {
    const s = regionState();
    const N = s.entries.length;
    let cur: NavState = s;
    for (let i = 0; i < N; i++) cur = navReducer(cur, { type: 'next' });
    expect(cur.idx).toBe(0);
  });

  it('zoom on non-zoomable place at region level advances', () => {
    const s = regionState(); // france has no cities
    const after = navReducer(s, { type: 'zoom' });
    expect(after.level).toBe('region');
    expect((after as RegionState).idx).toBe(1); // spain
  });
});

// ─── navReducer: place level (fixture cities) ─────────────────────────────────
describe('navReducer — place level (fixture cities)', () => {
  const CITIES_FIXTURE: City[] = [
    { id: 'paris', name: 'Paris', line: 'Capital', lat: 48.85, lon: 2.35 },
    { id: 'lyon', name: 'Lyon', line: 'Second city', lat: 45.75, lon: 4.83 },
  ];

  const PLACES_FIXTURE: Place[] = [
    {
      id: 'france',
      name: 'France',
      line: 'Visit',
      lat: 46,
      lon: 2,
      region: 'mediterranean',
      bbox: [-5, 42, 8, 51],
      map: 'townmap.france',
      cities: CITIES_FIXTURE,
    },
  ];
  const REGIONS_FIXTURE: Region[] = [
    { id: 'mediterranean', name: 'Mediterranean', bbox: [-15, 25, 30, 72], map: 'townmap.mediterranean' },
  ];

  function placeState(): PlaceState {
    let s: NavState = initWorld(PLACES_FIXTURE, REGIONS_FIXTURE);
    // zoom to region
    s = navReducer(s, { type: 'zoom' });
    expect(s.level).toBe('region');
    // zoom to place (france has cities)
    s = navReducer(s, { type: 'zoom' });
    expect(s.level).toBe('place');
    return s as PlaceState;
  }

  it('place state has city entries', () => {
    const s = placeState();
    expect(s.entries).toHaveLength(2);
    expect(s.entries[0]!.kind).toBe('city');
  });

  it('stack has two frames (world + region)', () => {
    const s = placeState();
    expect(s.stack).toHaveLength(2);
    expect(s.stack[0]!.level).toBe('world');
    expect(s.stack[1]!.level).toBe('region');
  });

  it('breadcrumb shows full path', () => {
    const s = placeState();
    expect(breadcrumb(s)).toBe('World › Mediterranean › France');
  });

  it('entryName returns city name', () => {
    const s = placeState();
    expect(entryName(s)).toBe('Paris');
  });

  it('entryLine returns city line', () => {
    const s = placeState();
    expect(entryLine(s)).toBe('Capital');
  });

  it('back from place restores full region state with correct idx', () => {
    const s = placeState();
    const back = navReducer(s, { type: 'back' });
    expect(back.level).toBe('region');
    // Full region state — not a sentinel
    expect((back as RegionState).entries.length).toBeGreaterThan(0);
    // idx is 0 (france was the first entry at region level)
    expect((back as RegionState).idx).toBe(0);
  });

  it('isZoomable is false at place level', () => {
    expect(isZoomable(placeState())).toBe(false);
  });

  it('zoom at place level advances (no deeper level)', () => {
    const s = placeState(); // paris idx=0
    const after = navReducer(s, { type: 'zoom' });
    expect(after.level).toBe('place');
    expect((after as PlaceState).idx).toBe(1); // lyon
  });
});

// ─── full B-up navigation: world → region → place → B → B → B ────────────────
describe('navReducer: full back-navigation sequence', () => {
  const CITIES_FIXTURE: City[] = [
    { id: 'rome', name: 'Rome', line: 'Capital', lat: 41.9, lon: 12.5 },
  ];
  const PLACES_FIXTURE: Place[] = [
    { id: 'uiuc', name: 'UIUC', line: 'Study', lat: 40, lon: -88 },
    {
      id: 'italy',
      name: 'Italy',
      line: 'Visit',
      lat: 42,
      lon: 12,
      region: 'mediterranean',
      bbox: [6, 36, 19, 48],
      map: 'townmap.italy',
      cities: CITIES_FIXTURE,
    },
  ];
  const REGIONS_FIXTURE: Region[] = [
    { id: 'mediterranean', name: 'Mediterranean', bbox: [-15, 25, 30, 72], map: 'townmap.mediterranean' },
  ];

  it('world → region → place(city) → B → B → B (correct state at each step)', () => {
    // Step 1: world, select mediterranean region (idx=1 since uiuc is idx=0)
    let s: NavState = initWorld(PLACES_FIXTURE, REGIONS_FIXTURE);
    s = navReducer(s, { type: 'next' }); // idx=1 (mediterranean region)
    expect(s.level).toBe('world');
    expect((s as WorldState).idx).toBe(1);
    expect(isZoomable(s)).toBe(true);

    // Step 2: zoom to region
    s = navReducer(s, { type: 'zoom' });
    expect(s.level).toBe('region');
    expect(breadcrumb(s)).toBe('World › Mediterranean');
    expect((s as RegionState).entries).toHaveLength(1); // only italy
    expect((s as RegionState).worldIdx).toBe(1);

    // Step 3: zoom to Italy (has cities)
    expect(isZoomable(s)).toBe(true);
    s = navReducer(s, { type: 'zoom' });
    expect(s.level).toBe('place');
    expect(breadcrumb(s)).toBe('World › Mediterranean › Italy');
    expect((s as PlaceState).entries).toHaveLength(1); // rome
    expect((s as PlaceState).worldIdx).toBe(1);

    // Step 4: B up to region — full entries, correct idx
    const backToRegion = navReducer(s, { type: 'back' });
    expect(backToRegion.level).toBe('region');
    expect((backToRegion as RegionState).entries).toHaveLength(1); // italy, not empty
    expect((backToRegion as RegionState).idx).toBe(0); // regionIdx was 0
    expect((backToRegion as RegionState).worldIdx).toBe(1);

    // Step 5: B up to world — full entries, idx pointing at mediterranean
    const backToWorld = navReducer(backToRegion, { type: 'back' });
    expect(backToWorld.level).toBe('world');
    expect((backToWorld as WorldState).entries).toHaveLength(2); // uiuc + mediterranean, not empty
    expect((backToWorld as WorldState).idx).toBe(1); // back at mediterranean

    // Step 6: B at world level = same state (component calls ctx.close())
    const atWorld = navReducer(backToWorld, { type: 'back' });
    expect(atWorld.level).toBe('world');
    expect((atWorld as WorldState).idx).toBe(1); // unchanged
  });

  it('toWorld from place level jumps to world at the given idx', () => {
    let s: NavState = initWorld(PLACES_FIXTURE, REGIONS_FIXTURE);
    s = navReducer(s, { type: 'next' }); // world idx=1
    s = navReducer(s, { type: 'zoom' }); // region
    s = navReducer(s, { type: 'zoom' }); // place
    expect(s.level).toBe('place');

    // toWorld with idx=0 should land at world idx=0 (uiuc)
    const jumped = navReducer(s, { type: 'toWorld', idx: 0 });
    expect(jumped.level).toBe('world');
    expect((jumped as WorldState).idx).toBe(0);
    expect((jumped as WorldState).stack).toHaveLength(0);
    expect((jumped as WorldState).entries).toHaveLength(2);
  });

  it('toWorld from world level is a setIdx', () => {
    const s = initWorld(PLACES_FIXTURE, REGIONS_FIXTURE);
    const after = navReducer(s, { type: 'toWorld', idx: 1 });
    expect(after.level).toBe('world');
    expect((after as WorldState).idx).toBe(1);
    expect((after as WorldState).stack).toHaveLength(0);
  });
});

// ─── display helpers ──────────────────────────────────────────────────────────
describe('entryLine at world level', () => {
  const PLACES_FIXTURE: Place[] = [
    { id: 'france', name: 'France', line: 'Visit', lat: 46, lon: 2, region: 'mediterranean' },
    { id: 'spain', name: 'Spain', line: 'Visit', lat: 40, lon: -3, region: 'mediterranean' },
    { id: 'italy', name: 'Italy', line: 'Visit', lat: 42, lon: 12, region: 'mediterranean' },
  ];
  const REGIONS_FIXTURE: Region[] = [
    { id: 'mediterranean', name: 'Mediterranean', bbox: [-15, 25, 30, 72], map: 'townmap.mediterranean' },
  ];

  it('region line shows count and A-to-zoom hint', () => {
    const s = initWorld(PLACES_FIXTURE, REGIONS_FIXTURE);
    expect(s.entries[0]!.kind).toBe('region');
    expect(entryLine(s)).toBe('3 places · A to zoom');
  });
});

// ─── insetSlot helper ────────────────────────────────────────────────────────
describe('insetSlot', () => {
  const REGIONS_FIXTURE: Region[] = [
    { id: 'mediterranean', name: 'Mediterranean', bbox: [-15, 25, 30, 72], map: 'townmap.mediterranean' },
  ];

  it('returns null at world level', () => {
    const s = initWorld([], []);
    expect(insetSlot(s)).toBeNull();
  });

  it('returns region map + -inset suffix at region level', () => {
    const PLACES_FIXTURE: Place[] = [
      { id: 'france', name: 'France', line: 'Visit', lat: 46, lon: 2, region: 'mediterranean' },
    ];
    let s: NavState = initWorld(PLACES_FIXTURE, REGIONS_FIXTURE);
    s = navReducer(s, { type: 'zoom' });
    expect(s.level).toBe('region');
    expect(insetSlot(s)).toBe('townmap.mediterranean-inset');
  });

  it('returns japan place map + -inset suffix after zooming to japan (fixture)', () => {
    const cities: City[] = [{ id: 'tokyo', name: 'Tokyo', line: 'Capital', lat: 35.7, lon: 139.7 }];
    const places: Place[] = [
      {
        id: 'japan',
        name: 'Japan',
        line: 'Visit',
        lat: 36,
        lon: 138,
        cities,
        bbox: [130, 30, 145, 45],
        map: 'townmap.japan',
      },
    ];
    let s: NavState = initWorld(places, []);
    s = navReducer(s, { type: 'zoom' });
    expect(s.level).toBe('place');
    expect(insetSlot(s)).toBe('townmap.japan-inset');
  });
});

// ─── empty entries guard ──────────────────────────────────────────────────────
describe('navReducer — empty entries (no-op guard)', () => {
  it('next with empty world entries returns state unchanged (no NaN)', () => {
    const s = initWorld([], []);
    const after = navReducer(s, { type: 'next' });
    expect(after).toBe(s);
    expect(after.idx).toBe(0);
  });

  it('prev with empty world entries returns state unchanged (no NaN)', () => {
    const s = initWorld([], []);
    const after = navReducer(s, { type: 'prev' });
    expect(after).toBe(s);
    expect(after.idx).toBe(0);
  });

  it('setIdx with empty world entries returns state unchanged', () => {
    const s = initWorld([], []);
    const after = navReducer(s, { type: 'setIdx', idx: 5 });
    expect(after).toBe(s);
    expect(after.idx).toBe(0);
  });

  it('toWorld with empty world entries returns state unchanged', () => {
    const s = initWorld([], []);
    const after = navReducer(s, { type: 'toWorld', idx: 2 });
    expect(after).toBe(s);
    expect(after.idx).toBe(0);
  });
});

// ─── world-level place with cities: zoom → back ───────────────────────────────
describe('navReducer — world place-with-cities zoom → back', () => {
  const cities: City[] = [
    { id: 'tokyo', name: 'Tokyo', line: 'Capital', lat: 35.7, lon: 139.7 },
  ];
  const PLACES_FIXTURE: Place[] = [
    { id: 'uiuc', name: 'UIUC', line: 'Study', lat: 40, lon: -88 },
    {
      id: 'japan',
      name: 'Japan',
      line: 'Visit',
      lat: 36,
      lon: 138,
      cities,
      bbox: [130, 30, 145, 45],
      map: 'townmap.japan',
    },
  ];

  it('zoom to place level then B returns world level, original idx, empty stack', () => {
    let s: NavState = initWorld(PLACES_FIXTURE, []);
    // Navigate to japan (idx=1)
    s = navReducer(s, { type: 'next' });
    expect((s as WorldState).idx).toBe(1);
    const worldIdx = (s as WorldState).idx;

    // zoom: japan has cities, no region — should go straight to place level
    s = navReducer(s, { type: 'zoom' });
    expect(s.level).toBe('place');
    expect((s as PlaceState).fromWorld).toBe(true);
    expect((s as PlaceState).region).toBeUndefined();
    expect(breadcrumb(s)).toBe('World › Japan');

    // B: back to world
    const back = navReducer(s, { type: 'back' });
    expect(back.level).toBe('world');
    expect((back as WorldState).idx).toBe(worldIdx);
    expect((back as WorldState).stack).toHaveLength(0);
    expect((back as WorldState).entries).toHaveLength(2);
  });

  it('breadcrumb does not change after next at place level', () => {
    let s: NavState = initWorld(PLACES_FIXTURE, []);
    s = navReducer(s, { type: 'next' }); // select japan
    s = navReducer(s, { type: 'zoom' }); // place level
    const bc = breadcrumb(s);

    // next moves idx but breadcrumb (level/place name) is unchanged
    const after = navReducer(s, { type: 'next' });
    expect(after.level).toBe('place');
    expect(breadcrumb(after)).toBe(bc);
  });
});

// ─── total place count (feedback items 3 & 1) ─────────────────────────────────
describe('total places count', () => {
  it('PLACES.length equals the number of individual places (16), not world entries', () => {
    // places.json has 16 places total (7 in mediterranean + 9 standalone)
    expect(PLACES.length).toBe(16);
  });

  it('buildWorldEntries collapses regions: fewer world entries than total places', () => {
    const entries = buildWorldEntries(PLACES, REGIONS);
    // 8 world entries (1 mediterranean stub + 7 standalone)
    expect(entries.length).toBeLessThan(PLACES.length);
    // sanity: at least one entry must be a region
    expect(entries.some((e) => e.kind === 'region')).toBe(true);
  });

  it('region entry count badge equals number of member places', () => {
    const entries = buildWorldEntries(PLACES, REGIONS);
    const medEntry = entries.find((e) => e.kind === 'region' && e.region.id === 'mediterranean');
    expect(medEntry).toBeDefined();
    expect(medEntry!.kind).toBe('region');
    if (medEntry!.kind === 'region') {
      // Mediterranean has 7 member places
      expect(medEntry!.places.length).toBe(7);
    }
  });
});

// ─── highlight slot resolution ────────────────────────────────────────────────
describe('highlight mask slots in assets.json', () => {
  it('every mediterranean place with an iso code has a full-size highlight slot in assets.json', () => {
    const medPlaces = PLACES.filter((p) => p.region === 'mediterranean');
    for (const place of medPlaces) {
      if (!place.iso) continue; // Hawaii/Alaska-style omission is allowed
      const slot = `townmap.mediterranean.hl.${place.id}` as keyof typeof assets;
      expect(assets[slot], `full-size highlight slot for ${place.id}`).toBeDefined();
      const assetEntry = assets[slot] as { path?: string; w?: number; h?: number } | undefined;
      expect(assetEntry?.path, `full-size highlight path for ${place.id}`).toBeTruthy();
      // Full-size: 256×192
      expect(assetEntry?.w, `${place.id} highlight w`).toBe(256);
      expect(assetEntry?.h, `${place.id} highlight h`).toBe(192);
    }
  });

  it('full-size highlight slot path matches expected pattern', () => {
    // spot-check france
    const slot = 'townmap.mediterranean.hl.france' as keyof typeof assets;
    const a = assets[slot] as { path?: string } | undefined;
    expect(a).toBeDefined();
    expect(a?.path).toContain('mediterranean.hl.france.png');
  });

  it('places with iso field have the correct 3-letter code format', () => {
    for (const p of PLACES) {
      if (p.iso) {
        expect(p.iso.length, `${p.id}.iso length`).toBe(3);
        expect(p.iso, `${p.id}.iso uppercase`).toBe(p.iso.toUpperCase());
      }
    }
  });

  it('full-size highlight slot for the selected place at region level resolves correctly', () => {
    // Simulate: at region level, france selected (idx 0 in Mediterranean)
    const medPlaces = PLACES.filter((p) => p.region === 'mediterranean');
    const franceIdx = medPlaces.findIndex((p) => p.id === 'france');
    expect(franceIdx).toBeGreaterThanOrEqual(0);
    const placeId = medPlaces[franceIdx]!.id;
    const slot = `townmap.mediterranean.hl.${placeId}` as keyof typeof assets;
    expect(assets[slot]).toBeDefined();
  });
});

describe('return trip: navPath / restoreNav / photoPlace', () => {
  const CITIES: City[] = [
    { id: 'paris', name: 'Paris', line: 'Capital', lat: 48.85, lon: 2.35 },
    { id: 'lyon', name: 'Lyon', line: 'Second city', lat: 45.75, lon: 4.83 },
  ];
  const FIX_PLACES: Place[] = [
    { id: 'japan', name: 'Japan', line: 'x', lat: 36, lon: 138 },
    { id: 'spain', name: 'Spain', line: 'x', lat: 40, lon: -4, region: 'med' },
    { id: 'france', name: 'France', line: 'x', lat: 46, lon: 2, region: 'med', bbox: [-5, 42, 8, 51], map: 'townmap.france', cities: CITIES },
    { id: 'peru', name: 'Peru', line: 'x', lat: -9, lon: -75 },
  ];
  const FIX_REGIONS: Region[] = [{ id: 'med', name: 'Med', bbox: [-15, 25, 30, 72], map: 'townmap.med' }];
  const init = () => initWorld(FIX_PLACES, FIX_REGIONS);
  // world entries: japan(0), med(1), peru(2)

  it('round-trips the world level', () => {
    const s = navReducer(init(), { type: 'setIdx', idx: 2 });
    expect(navPath(s)).toEqual([2]);
    expect(restoreNav(init(), navPath(s))).toEqual(s);
  });

  it('round-trips the region level (same selection and parent stack)', () => {
    let s: NavState = navReducer(init(), { type: 'setIdx', idx: 1 });
    s = navReducer(s, { type: 'zoom' });
    s = navReducer(s, { type: 'setIdx', idx: 0 });
    expect(navPath(s)).toEqual([1, 0]);
    const r = restoreNav(init(), JSON.parse(JSON.stringify(navPath(s))));
    expect(r).toEqual(s);
    // B from the restored state lands on the same world entry
    expect(navReducer(r, { type: 'back' })).toEqual(navReducer(s, { type: 'back' }));
  });

  it('round-trips the city level (two parent frames)', () => {
    let s: NavState = navReducer(init(), { type: 'setIdx', idx: 1 });
    s = navReducer(s, { type: 'zoom' });
    s = navReducer(s, { type: 'setIdx', idx: 1 }); // france
    s = navReducer(s, { type: 'zoom' });
    s = navReducer(s, { type: 'setIdx', idx: 1 }); // lyon
    expect(s.level).toBe('place');
    expect(navPath(s)).toEqual([1, 1, 1]);
    expect(restoreNav(init(), navPath(s))).toEqual(s);
  });

  it('ignores bad or stale paths without throwing', () => {
    expect(restoreNav(init(), undefined)).toEqual(init());
    expect(restoreNav(init(), [])).toEqual(init());
    expect(restoreNav(init(), [99])).toEqual(init());
    expect(restoreNav(init(), ['x'])).toEqual(init());
    // [0, 3]: japan is not zoomable -> stops at the world level, japan selected
    expect(restoreNav(init(), [0, 3])).toEqual(init());
    // [1, 9]: med zooms but 9 is out of range -> stays at the world level on med
    expect(navPath(restoreNav(init(), [1, 9]))).toEqual([1]);
  });

  it('photoPlace: a plain place with photos offers Photos; a region pin never does; a zoomable place zooms', () => {
    const has = (id: string) => id !== 'peru';
    let s: NavState = init();
    expect(photoPlace(s, has)).toBe('japan');
    expect(photoPlace(navReducer(s, { type: 'setIdx', idx: 1 }), has)).toBeNull(); // region: A zooms
    expect(photoPlace(navReducer(s, { type: 'setIdx', idx: 2 }), has)).toBeNull(); // no photos: A = Next
    s = navReducer(navReducer(s, { type: 'setIdx', idx: 1 }), { type: 'zoom' });
    expect(photoPlace(s, has)).toBe('spain');
    s = navReducer(s, { type: 'setIdx', idx: 1 }); // france has cities: zoomable
    expect(photoPlace(s, has)).toBeNull();
    s = navReducer(s, { type: 'zoom' }); // city level: A stays Next
    expect(photoPlace(s, has)).toBeNull();
  });
});

describe('cluster badge', () => {
  it('is a 1-native-px-per-dot chip: 5x7 for one digit, smaller than the 8x8 pin it labels', () => {
    for (let n = 1; n <= 9; n++) expect(badgeSize(n)).toEqual({ w: 5, h: 7 });
    const PIN = 8; // outline box: (S + 1) * 2 with S = 3
    expect(badgeSize(7).w).toBeLessThan(PIN);
    expect(badgeSize(7).h).toBeLessThan(PIN);
  });
  it('two digits add one 3-dot glyph and a 1-dot gap', () => {
    expect(badgeSize(12)).toEqual({ w: 9, h: 7 });
  });
});
