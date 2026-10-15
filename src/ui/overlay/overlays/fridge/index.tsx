/**
 * Fridge overlay: the food log as a fridge door.
 *
 * TOP screen (DOM portal into `.top-screen`, world dimmed, like the Pokedex): a pale-blue fridge door with
 * a few magnets. The SELECTED entry's polaroid sits in the middle and follows the cursor; want-to-try
 * entries have no photo, so a blank note card is pinned there instead. Opening an entry makes the
 * polaroid large with the title under it.
 *
 * BOTTOM screen: an OverlayFrame whose red title bar is `◀ filter ▶ count`, then a vertical list of colour-coded sticky-note rows
 * (yellow cooking, pink hall of fame, blue want to try), newest first with MONTH HEADER rows
 * (not selectable; up/down skip them). Undated entries go last under UNDATED. A opens the entry: the title
 * bar becomes the section label + "n of N" in the filter, then TextPages with the place, the date, and the
 * note (none when the entry has no note). The title is NOT repeated below: the polaroid caption shows it
 * (screen readers still hear it once: the open view announces title + text).
 *
 * HEIGHT BUDGET at --u = 1 px (375 x 812), bottom screen overlay content area = 90 px:
 *   title bar (OverlayFrame .oframe-bar: 18 incl. its 1 px outline, no margin) ... 18
 *   list area ................................. 72  (rows are 20, month headers 14)
 *   so the first window holds 2 whole rows with a header between, or 3 rows; the leftover sliver is clipped
 *   open view: title bar (section + "n of N") ... 18
 *              TextPages (place, date, note) ...... 72  (4 lines at 1x: place, date and the note's first two lines;
 *              e2e checks the note starts on page 1)
 *
 * TOP screen open polaroid (224 x 176, 1 px border): photo frame 192 x 124 at top 10 (ends at 134), caption
 * strip 134..174 = 40 px, caption line-height 16, at most 2 lines (32 px), centred vertically in the strip.
 * Portrait photos are shown whole (contain) in a box of their own aspect, on polaroid paper, never letterboxed.
 *
 * The list is the overlay's own (not ScrollList) because ScrollList has no non-selectable rows. It keeps
 * the same markup/cues: all rows render, the viewport snaps to whole rows via scrollTop.
 *
 * Arrow rule: only ▶ (U+25B6) and ▼ (U+25BC) exist in the HGSS font; ◀ is ▶ flipped (scaleX(-1)).
 * Every font-size here is calc(var(--u)*16). Photos are real photographs: smooth scaling, not pixelated.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dim } from '../../../../world/api';
import TextPages, { type TextPagesHandle } from '../../TextPages';
import OverlayFrame from '../../OverlayFrame';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import data from '../../../../content/fridge.json';
import { getObjectAsset } from '../../../../assets/useAsset';
import type { FridgeData, FridgeEntry } from './types';
import { FILTERS, SECTION_LABEL, SECTION_NOTE, buildRows, filterEntries, longDate, openAnnouncement, openBlocks, shortDate, wrapTab } from './helpers';

const FRIDGE = data as unknown as FridgeData;
type View = 'list' | 'open';

const photoOf = (e: FridgeEntry) => {
  if (!e.photo) return null;
  const a = getObjectAsset(e.photo);
  return a?.path ? a : null;
};

const CSS = `
/* ---------- bottom screen ---------- */
.fridge { width: 100%; min-width: 0; box-sizing: border-box; --row: calc(var(--u) * 20); }
/* the bar itself is OverlayFrame's (.oframe-bar); in the list the arrows' own padding spaces it, so no gap */
.fridge .fd-bar { gap: 0; padding: 0 calc(var(--u) * 2); }
.fridge .fd-openbar { gap: calc(var(--u) * 8); padding: 0 calc(var(--u) * 4); }
.fridge .fd-pos { flex: none; color: #f4c9bf; }
.fridge .fd-arrow {
  flex: none;
  background: none;
  border: 0;
  padding: 0 calc(var(--u) * 3);
  font: inherit;
  color: inherit;
  text-shadow: inherit;
  cursor: pointer;
  line-height: calc(var(--u) * 16);
}
.fridge .fd-arrow:disabled { opacity: 0.35; cursor: default; }
.fridge .fd-flip { display: inline-block; transform: scaleX(-1); }
.fridge .fd-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
.fridge .fd-count { flex: none; padding: 0 calc(var(--u) * 3); color: #f4c9bf; }
.fridge .fd-sample {
  flex: none;
  background: #6e1a16;
  color: #fff;
  padding: 0 calc(var(--u) * 3);
  margin-right: calc(var(--u) * 2);
}
.fridge .fd-list { flex: 1; min-height: 0; }
.fridge .fd-scroll { height: 100%; overflow: hidden; }
.fridge .fd-scroll ul { padding-right: calc(var(--u) * 10); padding-bottom: calc(var(--u) * 68); }
.fridge .fd-list li { display: block; }
.fridge .fd-head {
  height: calc(var(--u) * 14);
  line-height: calc(var(--u) * 14);
  padding-left: calc(var(--u) * 8);
  color: #2f6fa8;
}
.fridge .fd-row {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: var(--row);
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.fridge .fd-row .cur { flex: none; line-height: var(--row); }
.fridge .fd-note {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 4);
  margin: calc(var(--u) * 1) 0;
  padding: 0 calc(var(--u) * 3);
  border: calc(var(--u) * 1) solid #2a2a36;
  box-sizing: border-box;
  height: calc(var(--row) - var(--u) * 2);
  line-height: calc(var(--row) - var(--u) * 4);
}
.fridge .fd-note.yellow { background: #fff0a8; }
.fridge .fd-note.pink   { background: #ffd3d9; }
.fridge .fd-note.blue   { background: #cfe3f7; }
.fridge .fd-row.sel .fd-note { box-shadow: 0 0 0 calc(var(--u) * 1) #b8352e; }
.fridge .fd-pin {
  flex: none;
  width: calc(var(--u) * 6);
  height: calc(var(--u) * 6);
  background: #b8352e;
  border: calc(var(--u) * 1) solid #6e1a16;
  box-sizing: border-box;
}
.fridge .fd-note.blue .fd-pin { background: #2f6fa8; border-color: #1b3f63; }
.fridge .fd-note.yellow .fd-pin { background: #e0a020; border-color: #7a5410; }
.fridge .fd-title {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fridge .fd-date { flex: none; opacity: 0.6; }
.fridge .fd-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.fridge .fd-body .tp { flex: 1; min-height: calc(var(--u) * 18); }

/* ---------- top screen: the door ---------- */
.fd-door {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  box-sizing: border-box;
  background: #bccbdb;
  color: #22222c;
  font-size: calc(var(--u) * 16);
  line-height: calc(var(--u) * 18);
  font-kerning: none;
  -webkit-font-smoothing: none;
}
.fd-door .seam {
  position: absolute; left: 0; right: 0; top: calc(var(--u) * 66);
  height: calc(var(--u) * 2); background: #9eb0c4;
}
.fd-door .handle {
  position: absolute; right: calc(var(--u) * 10); width: calc(var(--u) * 8);
  background: #6f8aa5; border: calc(var(--u) * 1) solid #4a627a; box-sizing: border-box;
}
.fd-door .h1 { top: calc(var(--u) * 14); height: calc(var(--u) * 38); }
.fd-door .h2 { top: calc(var(--u) * 84); height: calc(var(--u) * 56); }
.fd-door .card {
  position: absolute; box-sizing: border-box;
  border: calc(var(--u) * 1) solid #2a2a36;
}
.fd-door .card i {
  display: block; height: calc(var(--u) * 2); margin: 0 calc(var(--u) * 10); background: #a98c4a;
}
.fd-door .card.yellow { background: #fff0a8; }
.fd-door .card.pink   { background: #ffd3d9; }
.fd-door .card.blue   { background: #cfe3f7; }
.fd-door .pin {
  position: absolute; width: calc(var(--u) * 8); height: calc(var(--u) * 8);
  border: calc(var(--u) * 1) solid #22222c; box-sizing: border-box; background: #b8352e;
}
.fd-door .pin.gold { background: #e0a020; }
.fd-door .pin.blue { background: #2f6fa8; }
.fd-door .polaroid {
  position: absolute; box-sizing: border-box; background: #fffdf2;
  border: calc(var(--u) * 1) solid #2a2a36;
  box-shadow: calc(var(--u) * 2) calc(var(--u) * 2) 0 rgba(34, 34, 44, 0.35);
}
.fd-door .frame {
  position: absolute; overflow: hidden; background: #2a2a36;
}
.fd-door .frame img { display: block; width: 100%; height: 100%; }
.fd-door .frame img.cover { object-fit: cover; }
.fd-door .frame img.contain { object-fit: contain; }
.fd-door .frame.blank { background: #cfe3f7; }
/* portrait: the side area is polaroid paper; the photo box takes the photo's own aspect, centred */
.fd-door .frame.portrait { background: #fffdf2; }
.fd-door .frame.portrait img { margin: 0 auto; }
.fd-door .frame.blank i {
  display: block; height: calc(var(--u) * 2); margin: calc(var(--u) * 12) calc(var(--u) * 12) 0; background: #a98c4a;
}
.fd-door .strip {
  position: absolute; left: calc(var(--u) * 8); right: calc(var(--u) * 8);
  display: flex; align-items: center; justify-content: center;
}
.fd-door .cap {
  text-align: center; line-height: calc(var(--u) * 16); max-height: calc(var(--u) * 32);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
`;

/** The fridge door (top screen). `open` = the large polaroid with the title. */
function Door({ entry, open }: { entry: FridgeEntry | undefined; open: boolean }) {
  const photo = entry ? photoOf(entry) : null;
  const portrait = !!photo && photo.w < photo.h;
  const u = (n: number) => `calc(var(--u) * ${n})`;
  const frame = (w: number, h: number, left: number, top: number) => {
    // portrait: an even-width box of the photo's own aspect (contain, so nothing is cropped), on paper
    const iw = photo && portrait ? Math.min(w, 2 * Math.round((h * photo.w) / photo.h / 2)) : w;
    return (
      <div className={`frame${photo ? '' : ' blank'}${portrait ? ' portrait' : ''}`} data-testid="fridge-frame" style={{ left: u(left), top: u(top), width: u(w), height: u(h) }}>
        {photo ? (
          <img className={portrait ? 'contain' : 'cover'} src={photo.path} alt={entry?.title ?? ''} draggable={false} style={portrait ? { width: u(iw) } : undefined} />
        ) : (
          <><i /><i style={{ marginTop: u(6) }} /><i style={{ marginTop: u(6) }} /></>
        )}
      </div>
    );
  };
  return (
    <div className="fd-door" data-testid="fridge-door" data-open={open ? '' : undefined}>
      <div className="seam" />
      <div className="handle h1" />
      <div className="handle h2" />
      {!open && (
        <>
          <div className="card pink" style={{ left: u(10), top: u(12), width: u(56), height: u(40) }}><i style={{ marginTop: u(12) }} /><i style={{ marginTop: u(6) }} /></div>
          <div className="pin gold" style={{ left: u(34), top: u(8) }} />
          <div className="card yellow" style={{ left: u(8), top: u(90), width: u(56), height: u(46) }}><i style={{ marginTop: u(14) }} /><i style={{ marginTop: u(6) }} /><i style={{ marginTop: u(6) }} /></div>
          <div className="pin" style={{ left: u(32), top: u(86) }} />
          <div className="card blue" style={{ left: u(176), top: u(80), width: u(40), height: u(54) }}><i style={{ marginTop: u(14) }} /><i style={{ marginTop: u(6) }} /></div>
          <div className="pin blue" style={{ left: u(192), top: u(76) }} />
        </>
      )}
      {open ? (
        <>
          <div className="polaroid" style={{ left: u(16), top: u(8), width: u(224), height: u(176) }}>
            {frame(192, 124, 15, 10)}
            <div className="strip" style={{ top: u(134), height: u(40) }}>
              <div className="cap" data-testid="fridge-cap">{entry?.title}</div>
            </div>
          </div>
          <div className="pin" style={{ left: u(124), top: u(4) }} />
        </>
      ) : (
        <>
          <div className="polaroid" style={{ left: u(68), top: u(46), width: u(120), height: u(104) }} data-testid="fridge-polaroid">
            {frame(112, 84, 3, 4)}
          </div>
          <div className="pin" style={{ left: u(124), top: u(42) }} />
        </>
      )}
    </div>
  );
}

export default function Fridge({ ctx }: OverlayComponentProps) {
  const { announce } = useOverlay();
  const [tab, setTab] = useState(0);
  const [view, setView] = useState<View>('list');
  const [sel, setSel] = useState(0);
  const pages = useRef<TextPagesHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ up: false, down: false, clip: 0 });

  const filter = FILTERS[tab]!;
  const items = useMemo(() => filterEntries(FRIDGE.entries, filter.key), [filter.key]);
  const rows = useMemo(() => buildRows(items), [items]);
  const n = items.length;
  const entry = items[sel];

  useEffect(() => {
    dim(true);
    return () => dim(false);
  }, []);

  // keep the selected row (and its month header, when it is the first of its month) in view, in whole rows;
  // refit when the box resizes (scale step, rotation)
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root || view !== 'list') return;
    const fit = () => {
      const lis = [...root.querySelectorAll<HTMLElement>('li')];
      const at = rows.findIndex((r) => r.kind === 'entry' && r.index === sel);
      const el = lis[at];
      if (!el) return;
      const h = root.clientHeight;
      let top = root.scrollTop;
      if (h > 0) {
        const head = at > 0 && rows[at - 1]!.kind === 'head' ? lis[at - 1]! : el;
        if (head.offsetTop < top) top = head.offsetTop;
        else if (el.offsetTop + el.offsetHeight > top + h) {
          // first row whose top lets the selected row end inside the viewport
          const k = lis.findIndex((li) => el.offsetTop + el.offsetHeight - li.offsetTop <= h);
          top = lis[k < 0 ? at : k]!.offsetTop;
        }
        if (sel === 0) top = 0;
      }
      root.scrollTop = top;
      // hide the sliver of a row that does not fit whole under the last whole row
      let whole = 0;
      for (const li of lis) if (!li.classList.contains('fd-head') && li.offsetTop >= top && li.offsetTop + li.offsetHeight - top <= h) whole = li.offsetTop + li.offsetHeight - top;
      const clip = h > 0 && whole > 0 ? h - whole : 0;
      const up = top > 0;
      const lastLi = lis[lis.length - 1]!;
      const down = lastLi.offsetTop + lastLi.offsetHeight > top + h + 1;
      setScroll((o) => (o.up === up && o.down === down && o.clip === clip ? o : { up, down, clip }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    return () => ro.disconnect();
  }, [sel, rows, view, tab]);

  // announce the filter and its count on mount and whenever it changes
  useEffect(() => {
    announce(`${filter.short}, ${n} ${n === 1 ? 'note' : 'notes'}`);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // preload the neighbouring photos so the frame never flashes dark when A / up / down moves on
  useEffect(() => {
    if (view !== 'open' || n === 0) return;
    for (const d of [-1, 1]) {
      const p = photoOf(items[(sel + d + n) % n]!);
      if (p?.path) new Image().src = p.path;
    }
  }, [view, sel, items, n]);

  // the open view: the title is on the polaroid caption, not in the bottom text, so screen readers hear it here
  // (runs after TextPages' own mirror of its text, so this one wins)
  useEffect(() => {
    if (view === 'open' && entry) announce(openAnnouncement(entry, sel, n));
  }, [view, sel, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const aLabel = view === 'list' ? 'Open' : 'Next';
  const bLabel = view === 'open' ? 'Back' : 'Close';

  const switchTab = (next: number) => {
    if (view === 'open') return;
    const t = wrapTab(next);
    if (t === tab) return;
    setTab(t);
    setSel(0);
  };
  /** select entry i; in the list it is announced (the open view's text mirrors itself) */
  const select = (i: number) => {
    setSel(i);
    const e = items[i];
    if (e && view === 'list') announce([e.title, e.place, longDate(e.date)].filter(Boolean).join(', '));
  };
  const move = (d: number) => {
    if (n === 0) return;
    select((sel + d + n) % n);
  };

  useOverlayInput({
    left: () => switchTab(tab - 1),
    right: () => switchTab(tab + 1),
    up: () => move(-1),
    down: () => move(1),
    a: () => {
      if (view === 'list') { if (entry) setView('open'); }
      else pages.current?.advance(); // the last page's onDone opens the next entry
    },
    b: () => (view === 'open' ? setView('list') : ctx.close()),
    labels: { a: aLabel, b: bLabel },
  });

  const topEl = typeof document !== 'undefined' ? document.querySelector('.top-screen') : null;
  const sampleTag = entry?.sample ? (
    <span className="fd-sample" data-testid="fridge-sample">Sample</span>
  ) : null;

  // ONE frame for both views (OverlayFrame): the list's bar is ◀ filter [Sample] count ▶, the open view's bar is the
  // entry's section + "n of N" in the current filter
  const bar =
    view === 'list' ? (
      <>
            <button type="button" tabIndex={-1} className="fd-arrow" aria-label="Previous filter" data-testid="fridge-prev"
              onPointerDown={(e) => { e.preventDefault(); switchTab(tab - 1); }}>
              <span className="fd-flip" aria-hidden="true">▶</span>
            </button>
            <span className="fd-name" data-testid={`fridge-tab-${filter.key ?? 'all'}`}>{filter.label}</span>
            {sampleTag}
            <span className="fd-count" aria-hidden="true" data-testid="fridge-count">{n}</span>
            <button type="button" tabIndex={-1} className="fd-arrow" aria-label="Next filter" data-testid="fridge-next"
              onPointerDown={(e) => { e.preventDefault(); switchTab(tab + 1); }}>
              ▶
            </button>
      </>
    ) : entry ? (
      SECTION_LABEL[entry.section]
    ) : null;
  // open view: "n of N" sits beside the heading (not in it)
  const aside = view === 'open' && entry ? <span className="fd-pos" data-testid="fridge-pos">{sel + 1} of {n}</span> : null;

  return (
    <OverlayFrame title={bar} aside={aside} className="fridge" data-testid="fridge" barProps={{ className: view === 'list' ? 'fd-bar' : 'fd-bar fd-openbar' }}>
      <style>{CSS}</style>
      {topEl && createPortal(<Door entry={entry} open={view === 'open'} />, topEl)}

      {view === 'list' ? (
        <>
          <div className="sl fd-list" data-testid="scroll-list" style={{ clipPath: `inset(0 0 ${scroll.clip}px 0)` }}>
            <div className="fd-scroll" ref={listRef}>
            <ul>
              {rows.map((r) =>
                r.kind === 'head' ? (
                  <li key={`h-${r.label}`} className="fd-head" data-testid="fridge-month" aria-hidden="true">{r.label}</li>
                ) : (
                  <li key={`e-${r.index}`}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`fd-row${r.index === sel ? ' sel' : ''}`}
                      aria-current={r.index === sel || undefined}
                      data-testid="fridge-row"
                      onPointerDown={(e) => { e.preventDefault(); if (r.index === sel) setView('open'); else select(r.index); }}
                    >
                      <span className="cur">{r.index === sel ? '▶' : ''}</span>
                      <span className={`fd-note ${SECTION_NOTE[r.entry.section]}`} title={r.entry.title}>
                        <span className="fd-pin" aria-hidden="true" />
                        <span className="fd-title">{r.entry.title}</span>
                        <span className="fd-date">{shortDate(r.entry.date)}</span>
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
            </div>
            <span className={`sl-cue sl-up${scroll.up ? ' on' : ''}`} aria-hidden="true" style={{ display: 'inline-block', transform: 'scaleY(-1)' }}>▼</span>
            <span className={`sl-cue sl-down${scroll.down ? ' on' : ''}`} aria-hidden="true" style={{ bottom: scroll.clip }}>▼</span>
          </div>
        </>
      ) : entry ? (
        <div className="fd-body" data-testid="fridge-open">
          <TextPages key={`${tab}-${sel}`} ref={pages} blocks={openBlocks(entry)} onDone={() => setSel((sel + 1) % n)} />
        </div>
      ) : null}
    </OverlayFrame>
  );
}
