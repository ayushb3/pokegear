/**
 * The Town Map's TOP screen, shared: the Town Map overlay renders it for its own nav state, and the photo board renders it
 * (from the nav state it was opened from) while it is opened FROM the Town Map, so the map stays up between the two overlays.
 *
 * It portals itself into `.top-screen`: the world map with pins (and cluster badges), or the zoomed region map at sub-levels
 * with the selected pin highlighted. `dispatch` is optional: without it, pin taps do nothing (read-only view).
 * dim() is the caller's job (so the world is not un-dimmed between two overlays).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { PLACES, REGIONS } from '../../../../content/places';
import { project, projectRegion, MAP_W, MAP_H } from './projection';
import {
  buildWorldEntries,
  isZoomable,
  levelBbox,
  type NavAction,
  type NavState,
  type PlaceState,
  type RegionState,
} from './nav';
import assets from '../../../../assets/assets.json';

// ── Colours ──────────────────────────────────────────────────────────────────
const PIN         = '#e02020';
const PIN_OUT     = '#22222c';
const PIN_SEL     = '#ffe040'; // yellow — world-level selected frame
const PIN_SEL_SUB = '#ffffff'; // white — sub-level selected frame (visible over yellow hl mask)

// ── Pixel-art 3x5 bitmap font for the cluster badge ──────────────────────────
// Each glyph is 5 rows of 3 bits (MSB = leftmost pixel). One dot = ONE native px (the pin is 8x8), so the badge is a small
// 5x7 chip (3x5 glyph + 1px padding each side) that stays smaller than the pin it labels, on whole native px at every scale.
const DIGIT_PIXELS: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b001, 0b001, 0b001],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
};

const CELL = 1; // native px per dot
const GLYPH_W = 3 * CELL;
const GLYPH_H = 5 * CELL;
const GLYPH_GAP = CELL;
export const BADGE_PAD = CELL; // padding inside the chip on each side

/** Chip size in native px for a count (one glyph = 5x7). */
export function badgeSize(count: number): { w: number; h: number } {
  const n = String(count).length;
  return { w: BADGE_PAD * 2 + n * GLYPH_W + (n - 1) * GLYPH_GAP, h: BADGE_PAD * 2 + GLYPH_H };
}

/** Pixel glyph(s) as SVG <rect>s on a dark chip, top-left at (bx, by) in map coordinates (= native px; all integers). */
function PixelBadge({ count, bx, by }: { count: number; bx: number; by: number }) {
  const { w: chipW, h: chipH } = badgeSize(count);
  const rects: React.ReactNode[] = [];
  String(count).split('').forEach((ch, di) => {
    const rows = DIGIT_PIXELS[ch] ?? DIGIT_PIXELS['0']!;
    const dx = BADGE_PAD + di * (GLYPH_W + GLYPH_GAP);
    rows.forEach((row, ry) => {
      for (let bit = 2; bit >= 0; bit--) {
        if (row & (1 << bit)) {
          rects.push(
            <rect
              key={`${di}-${ry}-${bit}`}
              x={bx + dx + (2 - bit) * CELL}
              y={by + BADGE_PAD + ry * CELL}
              width={CELL}
              height={CELL}
              fill="#fff"
            />,
          );
        }
      }
    });
  });
  return (
    <g data-testid="badge-pixel">
      <rect x={bx} y={by} width={chipW} height={chipH} fill={PIN_OUT} data-testid="badge-chip" />
      {rects}
    </g>
  );
}

const css: Record<string, CSSProperties> = {
  top: {
    position: 'absolute',
    inset: 0,
    zIndex: 4,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000',
  },
  map: {
    display: 'block',
    width: 'calc(var(--u) * 256)',
    height: 'calc(var(--u) * 192)',
    imageRendering: 'pixelated',
    position: 'relative',
    flexShrink: 0,
  },
  img: {
    display: 'block',
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
  },
  /** Absolutely-positioned map image layer; used for the world map and region map cross-fade. */
  mapLayer: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
    display: 'block',
  },
  /** Full-size highlight mask (256×192) overlaid on the region map. Must be above the region map (z-index:2). */
  hlLayer: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
    display: 'block',
    pointerEvents: 'none',
    zIndex: 3,
  },
  label: {
    position: 'absolute',
    bottom: 'calc(var(--u) * 3)',
    left: 'calc(var(--u) * 3)',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: 'calc(var(--u) * 16)',
    lineHeight: 'calc(var(--u) * 16)',
    padding: '0 calc(var(--u) * 3)',
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    // Above pin SVG (z-index:4) so label is always readable
    zIndex: 5,
  },
  pinSvg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    zIndex: 4,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Centroid of a list of places for the cluster pin. */
function centroid(places: { lat: number; lon: number }[]): { lat: number; lon: number } {
  if (places.length === 0) return { lat: 0, lon: 0 };
  const lat = places.reduce((s, p) => s + p.lat, 0) / places.length;
  const lon = places.reduce((s, p) => s + p.lon, 0) / places.length;
  return { lat, lon };
}

/** Resolve an asset path from a slot key (e.g. "townmap.mediterranean"). */
function resolveAssetPath(slot: string): string | null {
  const a = (assets as Record<string, { path?: string }>)[slot];
  return a?.path ?? null;
}

// World map path from asset slot (no hardcoded path strings in code)
const WORLD_MAP_PATH: string | undefined = (assets as Record<string, { path?: string }>)['townmap.world']?.path;

export interface MapTopProps {
  navState: NavState;
  dispatch?: Dispatch<NavAction>;
}

/** The Town Map top screen for `navState`, portalled into `.top-screen` (renders nothing before the screen exists). */
export default function MapTop({ navState, dispatch }: MapTopProps) {
  const send = dispatch ?? (() => {});
  const zoom = () => send({ type: 'zoom' });

  // Track whether we're at sub-level so the top screen can cross-fade.
  // We use a separate boolean that lags one render cycle (CSS handles visual timing).
  const [topLevel, setTopLevel] = useState<'world' | 'region'>(() =>
    navState.level === 'world' ? 'world' : 'region',
  );
  const prevLevel = useRef(topLevel);

  useEffect(() => {
    const next = navState.level === 'world' ? 'world' : 'region';
    if (next !== prevLevel.current) {
      prevLevel.current = next;
      setTopLevel(next);
    }
  }, [navState.level]);

  // ── World-map pins (stable) ───────────────────────────────────────────────
  const worldEntries = useMemo(() => buildWorldEntries(PLACES, REGIONS), []);

  const worldPins = useMemo<
    { id: string; lat: number; lon: number; isRegion: boolean; count: number; worldIdx: number }[]
  >(() => {
    return worldEntries.map((e, i) => {
      if (e.kind === 'place') {
        return { id: e.place.id, lat: e.place.lat, lon: e.place.lon, isRegion: false, count: 1, worldIdx: i };
      }
      const c = centroid(e.places);
      return { id: e.region.id, lat: c.lat, lon: c.lon, isRegion: true, count: e.places.length, worldIdx: i };
    });
  }, [worldEntries]);

  const worldSelIdx: number = useMemo(() => {
    if (navState.level === 'world') return navState.idx;
    if (navState.level === 'region') return navState.worldIdx;
    if (navState.level === 'place') return navState.worldIdx;
    return -1;
  }, [navState]);

  // ── Sub-level: region map, pins, and highlight mask ───────────────────────
  const curBbox = levelBbox(navState);

  // Region map path (full 256×192 zoomed map at sub-levels)
  const regionMapPath = useMemo<string | null>(() => {
    if (navState.level === 'region') {
      return resolveAssetPath(`townmap.${navState.region.id}`);
    }
    if (navState.level === 'place') {
      // For place level: use the region's map if available, else null.
      const regionId = (navState as PlaceState).region?.id;
      return regionId ? resolveAssetPath(`townmap.${regionId}`) : null;
    }
    return null;
  }, [navState]);

  // Full-size highlight mask for the selected place within a region
  const hlMaskPath = useMemo<string | null>(() => {
    if (navState.level !== 'region') return null;
    const e = (navState as RegionState).entries[navState.idx];
    if (!e || e.kind !== 'place') return null;
    const placeId = e.place.id;
    const regionId = (navState as RegionState).region.id;
    // Full-size 256×192 highlight mask slot: "townmap.<regionId>.hl.<placeId>"
    return resolveAssetPath(`townmap.${regionId}.hl.${placeId}`);
  }, [navState]);

  // Pins projected into the zoomed region map (sub-level entries)
  const regionPins = useMemo<{ i: number; x: number; y: number }[]>(() => {
    if (!curBbox) return [];
    return navState.entries.flatMap((e, i) => {
      let lat: number, lon: number;
      if (e.kind === 'place') { lat = e.place.lat; lon = e.place.lon; }
      else if (e.kind === 'city') { lat = e.city.lat; lon = e.city.lon; }
      else return [];
      const [px, py] = projectRegion(lon, lat, curBbox);
      return [{ i, x: px, y: py }];
    });
  }, [navState.entries, curBbox]);

  // ── Top screen portal ─────────────────────────────────────────────────────
  const topEl = typeof document !== 'undefined' ? document.querySelector('.top-screen') : null;

  const labelText =
    navState.level === 'world'
      ? 'TOWN MAP'
      : `TOWN MAP · ${navState.level === 'region' ? navState.region.name : (navState as PlaceState).place.name}`;

  const top = (
    <div
      className="tm-top"
      data-testid="tm-top"
      style={css.top}
      aria-label={
        navState.level === 'world'
          ? 'World map'
          : `Zoomed map`
      }
    >
      <div style={css.map}>
        {/* World map layer — always rendered; fades out at sub-level */}
        <img
          src={WORLD_MAP_PATH}
          alt=""
          aria-hidden="true"
          style={css.mapLayer}
          className={topLevel === 'region' ? 'tm-map-fade-out' : 'tm-map-active'}
          data-testid="tm-world-map"
        />

        {/* Region map layer — rendered at sub-level; fades in */}
        {regionMapPath && (
          <img
            src={regionMapPath}
            alt=""
            aria-hidden="true"
            style={css.mapLayer}
            className={topLevel === 'region' ? 'tm-map-fade-in' : 'tm-map-hidden'}
            data-testid="tm-region-map"
          />
        )}

        {/* Full-size highlight mask — overlaid on region map for selected country */}
        {topLevel === 'region' && hlMaskPath && (
          <img
            src={hlMaskPath}
            alt=""
            aria-hidden="true"
            style={css.hlLayer}
            data-testid="tm-hl-mask"
          />
        )}

        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          shapeRendering="crispEdges"
          style={css.pinSvg}
          aria-hidden="true"
        >
          {/* World-level pins — shown when at world level */}
          {topLevel === 'world' && worldPins.map((pin) => {
            const [x, y] = project(pin.lon, pin.lat);
            const sel = pin.worldIdx === worldSelIdx;
            const S = 3;
            return (
              <g
                key={pin.id}
                data-testid={`pin-${pin.id}`}
                onPointerDown={(e: PointerEvent) => {
                  e.preventDefault();
                  send({ type: 'toWorld', idx: pin.worldIdx });
                }}
              >
                {/* Blinking selection frame */}
                {sel && (
                  <rect
                    x={x - S - 3} y={y - S - 3}
                    width={(S + 3) * 2} height={(S + 3) * 2}
                    fill="none" stroke={PIN_SEL} strokeWidth={1}
                    className="tm-blink"
                  />
                )}
                {/* Dark outline + red fill */}
                <rect x={x - S - 1} y={y - S - 1} width={(S + 1) * 2} height={(S + 1) * 2} fill={PIN_OUT} />
                <rect x={x - S} y={y - S} width={S * 2} height={S * 2} fill={PIN} />
                {/* Pixel-art count badge for cluster pins (count > 1) */}
                {pin.isRegion && pin.count > 1 && (
                  <g data-testid={`badge-${pin.id}`}>
                    <PixelBadge count={pin.count} bx={x + S + 1 - 2} by={y - S - 1 - badgeSize(pin.count).h + 2} />
                  </g>
                )}
                {/* transparent tap target ≥ 16 native px */}
                <rect x={x - 8} y={y - 8} width={16} height={16} fill="transparent" style={{ cursor: 'pointer' }} />
              </g>
            );
          })}

          {/* Sub-level pins on the zoomed region map */}
          {topLevel === 'region' && regionPins.map(({ i, x, y }) => {
            const sel = i === navState.idx;
            const S = 3;
            return (
              <g
                key={i}
                data-testid={`region-pin-${i}`}
                onPointerDown={(e: PointerEvent) => {
                  e.preventDefault();
                  if (sel && isZoomable(navState)) zoom();
                  else send({ type: 'setIdx', idx: i });
                }}
              >
                {sel && (
                  <>
                    {/* Dark outer ring for contrast over yellow highlight */}
                    <rect
                      x={x - S - 4} y={y - S - 4}
                      width={(S + 4) * 2} height={(S + 4) * 2}
                      fill="none" stroke={PIN_OUT} strokeWidth={1}
                      className="tm-blink"
                    />
                    {/* White blinking frame — readable over yellow country highlight */}
                    <rect
                      x={x - S - 3} y={y - S - 3}
                      width={(S + 3) * 2} height={(S + 3) * 2}
                      fill="none" stroke={PIN_SEL_SUB} strokeWidth={1}
                      className="tm-blink"
                    />
                  </>
                )}
                <rect x={x - S - 1} y={y - S - 1} width={(S + 1) * 2} height={(S + 1) * 2} fill={PIN_OUT} />
                <rect x={x - S} y={y - S} width={S * 2} height={S * 2} fill={PIN} />
                {/* transparent tap target ≥ 16 native px */}
                <rect x={x - 8} y={y - 8} width={16} height={16} fill="transparent" style={{ cursor: 'pointer' }} />
              </g>
            );
          })}
        </svg>

        <div style={css.label} aria-hidden="true">{labelText}</div>

        <style>{`
          .tm-blink { animation: tm-blink 1s steps(1) infinite }
          @keyframes tm-blink { 50% { opacity: 0 } }
          @media (prefers-reduced-motion: reduce) { .tm-blink { animation: none } }

          /* Cross-fade between world and region maps */
          .tm-map-active { opacity: 1; z-index: 1; }
          .tm-map-hidden { opacity: 0; z-index: 0; }
          .tm-map-fade-out {
            opacity: 0;
            z-index: 1;
            transition: opacity 0.25s ease-out;
          }
          .tm-map-fade-in {
            opacity: 1;
            z-index: 2;
            transition: opacity 0.25s ease-in;
          }
          @media (prefers-reduced-motion: reduce) {
            .tm-map-fade-out { transition: none; }
            .tm-map-fade-in  { transition: none; }
          }
        `}</style>
      </div>
    </div>
  );

  return topEl ? createPortal(top, topEl) : null;
}
