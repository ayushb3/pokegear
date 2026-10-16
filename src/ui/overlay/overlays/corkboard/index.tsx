import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { dim } from '../../../../world/api';
import { closeOrReturn, returnToOf, useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import { PHOTOS, captionOf, photoPath } from '../../../../content/photos';
import { PLACES, REGIONS } from '../../../../content/places';
import MapTop from '../townmap/MapTop';
import { initWorld, restoreNav } from '../townmap/nav';
import {
  applyFilter,
  cellOf,
  filterAnnouncement,
  filterIndex,
  filtersOf,
  move,
  pageCount,
  pageIndices,
  pageOf,
  stepFilter,
  type Dir,
} from './board';

/** Filter bar stops: ALL, then each place in photos.json (trip) order. */
const FILTERS = filtersOf(PHOTOS, (id) => PLACES.find((p) => p.id === id)?.name ?? id);

/* ---------- styles -------------------------------------------------------- */

// Budget at --u=1px (375x812, phone-first), measured by e2e (scrollHeight), not just arithmetic:
// One row of 4 near-square cells per page: h2 18 + 2 gap, cell row 48 (cells 52x48), 2 gap, caption/page row 18 = 88px.
// Width: the grid is 226u wide; 4 x 52 + 3 x 6 = 226, so every cell edge sits on a whole native pixel (1fr gave 53.5u).
// The h2 IS the place filter bar ("◀ JAPAN 8 ▶", like the fridge's section bar), so the filter costs no extra row.
// e2e asserts the fit (scrollHeight) and cell height >= 0.8 x width at 375x812.
// Thumbnails FILL their cell (object-fit: cover). Cells are never letterboxed.
// Enlarged top screen: whole photo visible (contain) above a one-line caption.

const css: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    gap: 'calc(var(--u) * 2)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, calc(var(--u) * 52))',
    gridTemplateRows: 'calc(var(--u) * 48)',
    columnGap: 'calc(var(--u) * 6)',
    justifyContent: 'center',
    flex: 'none',
  },
  frame: {
    display: 'block',
    background: '#b8b8c8',
    border: 'calc(var(--u) * 2) solid #b8a880',
    borderRadius: 'calc(var(--u) * 2)',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    outline: 'none',
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
    minHeight: 0,
  },
  frameSel: {
    border: 'calc(var(--u) * 2) solid #d8321a',
    boxShadow: 'inset 0 0 0 calc(var(--u) * 1) #f79a2e',
  },
  thumbImg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    imageRendering: 'auto',
    display: 'block',
  },
  row: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--u) * 6)',
    height: 'var(--lh)',
    lineHeight: 'var(--lh)',
    fontSize: 'calc(var(--u) * 16)',
    color: '#52525a',
  },
  caption: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  pageNo: {
    flex: 'none',
    background: 'none',
    border: 0,
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    lineHeight: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  // Filter bar in the h2 title bar: ◀ LABEL count ▶ (◀ = ▶ mirrored; ◀ is not in the HGSS font)
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: 'var(--lh)',
    lineHeight: 'var(--lh)',
  },
  barArrow: {
    flex: 'none',
    background: 'none',
    border: 0,
    padding: '0 calc(var(--u) * 4)',
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    lineHeight: 'var(--lh)',
  },
  barLabel: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  flip: { display: 'inline-block', transform: 'scaleX(-1)' },
  // Enlarged top-screen view: stacks like the Pokédex layer (its `.dx` CSS only exists while the Pokédex is mounted, so the
  // stacking is set here)
  enlarged: {
    position: 'absolute',
    inset: 0,
    zIndex: 4,
    overflow: 'hidden',
    background: '#1a1a26',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'calc(var(--u) * 8)',
    gap: 'calc(var(--u) * 6)',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  enlargedPhoto: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    position: 'relative',
  },
  enlargedImg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    imageRendering: 'auto',
    display: 'block',
  },
  enlargedCaption: {
    color: '#e9e4cf',
    fontSize: 'calc(var(--u) * 16)',
    textAlign: 'center',
    flex: 'none',
    width: '100%',
    lineHeight: 'var(--lh)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};

/* ---------- component ---------------------------------------------------- */

/**
 * Photo board: 4 photos to a page (one row of 4), filtered by place.
 * Keys: up / down change the place filter (ALL, then each place in trip order, wrapping); left / right step one photo and turn
 * the page at either end of the row (page-change rule in `move`). Tapping the page counter jumps to the next page. A enlarges
 * onto the top screen; B steps back (enlarged -> board -> close, or back to the overlay in `props.returnTo`, e.g. the Town Map,
 * via `closeOrReturn`). `props.place` preselects that place's filter.
 */
export default function Corkboard({ ctx, props }: OverlayComponentProps) {
  const { announce } = useOverlay();
  const [fi, setFi] = useState(() => filterIndex(FILTERS, typeof props.place === 'string' ? props.place : null));
  const filter = FILTERS[fi]!;
  const shown = applyFilter(PHOTOS, filter);
  const N = shown.length;
  const pages = pageCount(N);
  const [sel, setSel] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const returnTo = returnToOf(props);
  const fromOverlay = returnTo !== null;
  // Opened FROM the Town Map: its map stays on the top screen (the nav state it left, so the same pin / region is selected)
  // until a photo is enlarged. Opened from the room (object / ?open=photos): the room stays on top, as before.
  const mapNav = useMemo(
    () =>
      returnTo?.id === 'townmap'
        ? restoreNav(initWorld(PLACES, REGIONS), (returnTo.props as { nav?: unknown[] } | undefined)?.nav)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // dim the world while a photo is enlarged, or the whole time the map is on top (so there is no un-dim between overlays)
  const dimmed = enlarged || mapNav !== null;
  useEffect(() => {
    if (dimmed) {
      dim(true);
      return () => dim(false);
    }
  }, [dimmed]);

  const say = (i: number, prefix = '') => {
    const p = shown[i];
    announce(`${prefix}Photo ${i + 1} of ${N}. ${p ? captionOf(p) : ''}`);
  };

  // announce the starting filter when opened on a place (e.g. from the Town Map)
  useEffect(() => {
    if (fi !== 0) announce(filterAnnouncement(filter));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchFilter = (delta: number) => {
    if (enlarged) return;
    const next = stepFilter(fi, delta, FILTERS.length);
    setFi(next);
    setSel(0);
    announce(filterAnnouncement(FILTERS[next]!));
  };

  const select = (i: number) => {
    setSel(i);
    say(i);
  };

  const nextPhoto = () => select((sel + 1) % N);

  // left / right step one photo (turning the page at either end of the row, wrapping); same when enlarged
  const step = (dir: Extract<Dir, 'left' | 'right'>) => select(move(sel, dir, N));

  const handleA = () => {
    if (enlarged) nextPhoto();
    else {
      setEnlarged(true);
      say(sel, 'Enlarged. ');
    }
  };

  const handleB = () => {
    if (enlarged) setEnlarged(false);
    else closeOrReturn(ctx, props);
  };

  useOverlayInput({
    // up / down change the place filter (do nothing while enlarged)
    up: () => switchFilter(-1),
    down: () => switchFilter(1),
    left: () => step('left'),
    right: () => step('right'),
    a: handleA,
    b: handleB,
    labels: enlarged ? { a: 'Next', b: 'Back' } : { a: 'View', b: fromOverlay ? 'Map' : 'Close' },
  });

  const topEl = typeof document !== 'undefined' ? document.querySelector('.top-screen') : null;
  const cur = shown[sel];
  const curPath = cur ? photoPath(cur) : null;
  const curCaption = cur ? captionOf(cur) : '';
  // Only this page's thumbnails are rendered (and only the enlarged photo on the top screen), so nothing else loads.
  const visible = pageIndices(sel, N);

  return (
    <>
      {!enlarged && mapNav && <MapTop navState={mapNav} />}
      {enlarged &&
        topEl &&
        createPortal(
          <div
            style={css.enlarged}
            data-testid="photo-enlarged"
            onPointerDown={(e: PointerEvent) => {
              e.preventDefault();
              nextPhoto();
            }}
          >
            <div style={css.enlargedPhoto}>
              {curPath && <img src={curPath} alt={curCaption} style={css.enlargedImg} data-testid="photo-enlarged-img" />}
            </div>
            {/* the img alt already carries the caption: hide the visible copy from screen readers (no double read) */}
            <div style={css.enlargedCaption} title={curCaption} aria-hidden="true">
              {curCaption}
            </div>
          </div>,
          topEl,
        )}
      <div className="overlay corkboard" data-testid="corkboard">
        <h2 style={css.bar} data-testid="photo-filter" aria-label={`Photos: ${filterAnnouncement(filter)}`}>
          <button
            type="button"
            tabIndex={-1}
            style={css.barArrow}
            aria-label="Previous place"
            data-testid="photo-filter-prev"
            disabled={enlarged}
            onPointerDown={(e: PointerEvent) => {
              e.preventDefault();
              switchFilter(-1);
            }}
          >
            <span style={css.flip} aria-hidden="true">
              ▶
            </span>
          </button>
          <span style={css.barLabel} data-testid="photo-filter-label" title={`${filter.label} ${filter.count}`}>
            {filter.label} {filter.count}
          </span>
          <button
            type="button"
            tabIndex={-1}
            style={css.barArrow}
            aria-label="Next place"
            data-testid="photo-filter-next"
            disabled={enlarged}
            onPointerDown={(e: PointerEvent) => {
              e.preventDefault();
              switchFilter(1);
            }}
          >
            ▶
          </button>
        </h2>
        <div style={css.root}>
          <div role="listbox" aria-label="Photo board" style={css.grid}>
            {visible.map((i) => {
              const p = shown[i]!;
              const path = photoPath(p);
              const isSel = i === sel;
              return (
                <button
                  key={p.id}
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-label={`Photo ${i + 1}: ${captionOf(p)}`}
                  aria-selected={isSel}
                  data-testid={`photo-frame-${cellOf(i)}`}
                  style={{ ...css.frame, ...(isSel ? css.frameSel : {}) }}
                  onPointerDown={(e: PointerEvent) => {
                    e.preventDefault();
                    if (isSel) {
                      setEnlarged(true);
                      say(i, 'Enlarged. ');
                    } else select(i);
                  }}
                >
                  {path && <img src={path} alt="" style={css.thumbImg} data-testid={`photo-thumb-${cellOf(i)}`} />}
                </button>
              );
            })}
          </div>
          <div style={css.row}>
            <span style={css.caption} data-testid="photo-caption" title={curCaption}>
              {curCaption}
            </span>
            {/* tap the page counter = jump to the next page (its FIRST photo; wraps): the touch shortcut through long filters */}
            <button
              type="button"
              tabIndex={-1}
              style={css.pageNo}
              data-testid="photo-page"
              aria-label={`Page ${pageOf(sel) + 1} of ${pages}. Next page`}
              onPointerDown={(e: PointerEvent) => {
                e.preventDefault();
                if (pages > 1) select(move(sel, 'down', N));
              }}
            >
              {pageOf(sel) + 1}/{pages}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

