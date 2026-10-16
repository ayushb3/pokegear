/**
 * Town Map overlay.
 *
 * TOP screen (`MapTop.tsx`, shared with the photo board when it is opened from here) – world level: world map with pins and cluster badges.
 * TOP screen – sub-level (region / place-with-cities): zoomed region map at full 256×192
 *   with all member pins, the selected one blinking, and selected country shaded.
 *   A short cross-fade replaces the world map on level change (none under reduced-motion).
 *   The top label tracks the level: "TOWN MAP" vs "TOWN MAP · Mediterranean" (no place counters anywhere).
 *
 * BOTTOM screen – world level (content h = 92u at --u=1px):
 *   ◀ i/N ▶ (nav header, 44u touch target)
 *   name row (16u): region / place name (+ "· N photos" on a place with photos)
 *   detail row (16u): member names (region) or place.line (place)
 *   Total: 44 + 2 + 16 + 2 + 16 = 80u ✓ fits inside 92u
 *
 * BOTTOM screen – region / place level (content h = 92u at --u=1px):
 *   breadcrumb h2 (4u top padding + 16u = 20u)
 *   ScrollList (flex-1: 58u at 1x = 3 whole 16u rows + 10u spare; a 4th row would not fit)
 *   selected entry line (16u + 4u air below, so it never touches the inner frame line)
 *   Total: 20 + 58 + 16 + 4 = 98u (box 100u, 92u clean interior inside the 3u frame inset; measured at 375x812)
 *
 * Navigation:
 *   ◀ / left (rendered as ▶ + scaleX(-1)), ▶ / right: step entries, wrap
 *   A (space): zoom into region if zoomable; else "Photos" when the selected place has photos (swaps to the corkboard,
 *     that place's filter preselected, with a return trip back here: see photoPlace / navPath in nav.ts); else next.
 *     A region pin never offers Photos (A zooms); its countries do, one level down.
 *   B (esc): up one level; at world closes the overlay
 *   Tap world-map pin: selects entry (toWorld from any depth)
 *   Tap region-map pin or ScrollList row: selects; tapping selected zoomable zooms
 */
import { useCallback, useEffect, useMemo, useReducer, type CSSProperties } from 'react';
import { dim } from '../../../../world/api';
import { PLACES, PLACES_DATA, REGIONS } from '../../../../content/places';
import MapTop from './MapTop';
import {
  initWorld,
  isZoomable,
  navReducer,
  breadcrumb,
  entryLine,
  entryName,
  navPath,
  photoPlace,
  restoreNav,
  type WorldEntry,
} from './nav';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import ScrollList, { type ScrollItem } from '../../ScrollList';
import { PHOTOS } from '../../../../content/photos';

const TAG_CSS: CSSProperties = {
  border: 'calc(var(--u) * 1) solid #22222c',
  background: '#f3dd86',
  padding: '0 calc(var(--u) * 2)',
  fontSize: 'calc(var(--u) * 16)',
  lineHeight: 'calc(var(--u) * 16)',
  height: 'calc(var(--u) * 16)',
  boxSizing: 'content-box',
  display: 'inline-block',
  verticalAlign: 'middle',
};

/** ▶ glyph flipped horizontally for use as left arrow (◀ is not in the HGSS pixel font). */
const FlipArrow = () => (
  <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }} aria-hidden="true">▶</span>
);

const css: Record<string, CSSProperties> = {
  // ── bottom-screen: world level card ──────────────────────────────────────
  // Budget at --u=1px: header 44u + gap 2u + name 16u + gap 2u + detail 16u = 80u ≤ 92u ✓
  card: {
    contain: 'inline-size',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--u) * 2)',
    padding: 'calc(var(--u) * 2) calc(var(--u) * 4)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--u) * 3)',
    whiteSpace: 'nowrap',
    lineHeight: 'calc(var(--u) * 16)',
    flexShrink: 0,
  },
  navBtn: {
    font: 'inherit',
    background: 'none',
    border: 0,
    /* vertical padding provides the 44u touch target */
    padding: 'calc(var(--u) * 14) calc(var(--u) * 6)',
    cursor: 'pointer',
    minWidth: 'calc(var(--u) * 44)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#22222c',
    boxSizing: 'border-box',
  },
  counter: {
    flex: 1,
    textAlign: 'center',
    fontSize: 'calc(var(--u) * 16)',
  },
  name: {
    fontSize: 'calc(var(--u) * 16)',
    fontWeight: 'bold',
    margin: 0,
    lineHeight: 'calc(var(--u) * 16)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
  },
  /** Second row under name: member names (region) or place.line (place). 16u. */
  detail: {
    margin: 0,
    fontSize: 'calc(var(--u) * 16)',
    lineHeight: 'calc(var(--u) * 16)',
    color: '#6b6b78',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
  },

  // ── bottom-screen: sub-level (no inset) ─────────────────────────────────
  // Budget at --u=1px: all padding consumed by .overlay (border 2u); set padding:0
  // to reclaim the .overlay's 4u+4u padding. --row overridden to 16u.
  // breadcrumb(4 pad + 16) + list(58) + entry(16 + 4 pad) = 98u ✓ 3 rows at 16u/row
  gear: {
    contain: 'inline-size',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    // Override .overlay's 4u padding; use 6u side padding for visual alignment
    padding: '0 calc(var(--u) * 6)',
    overflow: 'hidden',
    flex: 1,
    // no gap: items sit flush (breadcrumb margin already 0; entryLine is flex sibling)
    // Override --row to 16u so 3 whole rows fit at --u=1px in the available 58u list height
    ['--row' as string]: 'calc(var(--u) * 16)',
  },
  breadcrumb: {
    color: '#6b6b78',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
    // Override .overlay h2 default: cancel the 2u bottom margin and set explicit 16u height
    margin: 0,
    lineHeight: 'calc(var(--u) * 16)',
    // 4u top padding keeps the text off the frame; 4 + 16 = 20u
    paddingTop: 'calc(var(--u) * 4)',
    boxSizing: 'content-box',
    height: 'calc(var(--u) * 16)',
  },
  listWrap: {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  entryLine: {
    fontSize: 'calc(var(--u) * 16)',
    lineHeight: 'calc(var(--u) * 16)',
    height: 'calc(var(--u) * 16)',
    paddingBottom: 'calc(var(--u) * 4)',
    boxSizing: 'content-box',
    color: '#6b6b78',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
  },
};


// Photos per place id (the corkboard's filter counts), for the "Photos" A action
const PHOTO_COUNT = new Map<string, number>();
for (const p of PHOTOS) PHOTO_COUNT.set(p.place, (PHOTO_COUNT.get(p.place) ?? 0) + 1);
const hasPhotos = (id: string) => (PHOTO_COUNT.get(id) ?? 0) > 0;

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Town Map: pixel-art world map on top screen, navigation on bottom screen.
 * Supports drill-down: world → region → place (with cities).
 */
export default function TownMap({ ctx, props }: OverlayComponentProps) {
  const host = useOverlay();

  // props.nav = a navPath() saved when we swapped to the photo board; B there brings us back to exactly this spot
  const [navState, dispatch] = useReducer(navReducer, undefined, () =>
    restoreNav(initWorld(PLACES, REGIONS), props.nav as unknown[] | undefined),
  );

  // dim the world while map is open
  useEffect(() => {
    dim(true);
    return () => dim(false);
  }, []);

  const zoomable = isZoomable(navState);
  const photosOf = photoPlace(navState, hasPhotos);
  const totalEntries = navState.entries.length;

  const prev = useCallback(() => dispatch({ type: 'prev' }), []);
  const next = useCallback(() => dispatch({ type: 'next' }), []);
  const zoom = useCallback(() => dispatch({ type: 'zoom' }), []);

  const handleB = useCallback(() => {
    if (navState.level === 'world') ctx.close();
    else dispatch({ type: 'back' });
  }, [navState.level, ctx]);

  const openPhotos = useCallback(
    (place: string) =>
      ctx.replace('corkboard', { place, returnTo: { id: 'townmap', props: { nav: navPath(navState) } } }),
    [ctx, navState],
  );

  const handleA = useCallback(() => {
    if (zoomable) zoom();
    else if (photosOf) openPhotos(photosOf);
    else next();
  }, [zoomable, zoom, photosOf, openPhotos, next]);

  useOverlayInput({
    left:  prev,
    right: next,
    up:    prev,
    down:  next,
    a:     handleA,
    b:     handleB,
    labels: {
      a: zoomable ? 'Zoom' : photosOf ? 'Photos' : 'Next',
      b: navState.level === 'world' ? 'Close' : 'Up',
    },
  });

  const { announce } = host;
  useEffect(() => {
    const bc = breadcrumb(navState);
    const nm = entryName(navState);
    const ln = entryLine(navState);
    const prefix = bc ? `${bc}. ` : '';
    const ph = photoPlace(navState, hasPhotos);
    const photos = ph ? ` A for ${PHOTO_COUNT.get(ph)} ${PHOTO_COUNT.get(ph) === 1 ? 'photo' : 'photos'}.` : '';
    announce(`${prefix}Town Map. ${navState.idx + 1} of ${totalEntries}: ${nm}. ${ln}.${photos}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState]);

  const listItems: ScrollItem[] = useMemo(
    () =>
      navState.entries.map((e, i) => {
        const label =
          e.kind === 'place' ? e.place.name : e.kind === 'city' ? e.city.name : '';
        return { key: String(i), label };
      }),
    [navState.entries],
  );

  // ── Bottom: world level ───────────────────────────────────────────────────
  if (navState.level === 'world') {
    const e = navState.entries[navState.idx] as WorldEntry | undefined;
    const name = entryName(navState);
    const N = totalEntries;

    // Name row: the name (no place counter); a place with photos adds "· N photos"
    // A place with photos says how many, next to its name (the A label then reads "Photos")
    const nPhotos = e?.kind === 'place' ? (PHOTO_COUNT.get(e.place.id) ?? 0) : 0;
    const nameText = nPhotos > 0 ? `${name} · ${nPhotos} ${nPhotos === 1 ? 'photo' : 'photos'}` : name;

    // Detail row: for regions show member names; for places show line
    const detailText = e?.kind === 'region'
      ? e.places.map((p) => p.name).join(', ')
      : (e?.kind === 'place' ? e.place.line : '');

    return (
      <>
        <MapTop navState={navState} dispatch={dispatch} />
        <div className="overlay townmap" data-testid="townmap" style={css.card}>
          <div style={css.header}>
            <button
              type="button" style={css.navBtn}
              aria-label="Previous entry" data-testid="tm-prev"
              onPointerDown={(e) => { e.preventDefault(); prev(); }}
            ><FlipArrow /></button>
            <span style={css.counter} data-testid="tm-counter">
              {navState.idx + 1}/{N}
            </span>
            <button
              type="button" style={css.navBtn}
              aria-label="Next entry" data-testid="tm-next"
              onPointerDown={(e) => { e.preventDefault(); next(); }}
            >▶</button>
            {PLACES_DATA.sample && (
              <span style={TAG_CSS} data-testid="tm-sample-tag">Sample</span>
            )}
          </div>
          <p style={css.name} data-testid="tm-name">{nameText}</p>
          <p style={css.detail} data-testid="tm-line" title={detailText}>{detailText}</p>
        </div>
      </>
    );
  }

  // ── Bottom: sub-level (region or place-with-cities) — no inset ────────────
  return (
    <>
      <MapTop navState={navState} dispatch={dispatch} />
      <div
        className="overlay townmap"
        data-testid="townmap"
        data-level={navState.level}
        style={css.gear}
      >
        {/* breadcrumb — uses .overlay h2: 16u font, 2u margin-bottom, muted colour */}
        <h2 style={css.breadcrumb} data-testid="tm-breadcrumb">
          {breadcrumb(navState)}
        </h2>

        {/* ScrollList fills the remaining space (flex-1, 3 whole rows at --u=1px) */}
        <div style={css.listWrap}>
          <ScrollList
            items={listItems}
            selected={navState.idx}
            onActivate={(i) => {
              const alreadySel = i === navState.idx;
              dispatch({ type: 'setIdx', idx: i });
              if (alreadySel && isZoomable(navState)) zoom();
            }}
          />
        </div>

        {/* selected entry line */}
        <div style={css.entryLine} data-testid="tm-line">
          {entryLine(navState)}
        </div>
      </div>
    </>
  );
}
