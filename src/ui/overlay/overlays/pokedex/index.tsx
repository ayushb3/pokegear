import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dim, objectBox } from '../../../../world/api';
import { setOpenParam } from '../../../deeplink';
import { DEX, dexIndex, dexInfo, dexNo } from '../../../../content/pokedex';
import { type TextPagesHandle } from '../../TextPages';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import { Entry, Grid, Intro, LAST_PAGE, List, PAGES } from './top';
import { introShown, markIntroShown, markSeen, readSeen } from './seen';
import { CSS } from './styles';

export interface PokedexProps {
  /** open this entry straight away (deep link, town map, monitor) */
  slug?: string;
  /** what B returns to from an entry: the PC-box grid (PC) or the list (Start menu) */
  mode?: 'grid' | 'list';
  /** from the PC: Rotom pops out of the monitor and speaks first */
  intro?: boolean;
}

type View = 'intro' | 'grid' | 'list' | 'entry';
const ROTOM_LINE = 'Bzzt! Ayush and I built these together.';
const GRID_COLS = 2;

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const POP_MS = 520;

const press = (fn: () => void) => ({
  onPointerDown: (e: { preventDefault(): void }) => {
    e.preventDefault();
    fn();
  },
  onClick: (e: { detail: number }) => {
    if (e.detail === 0) fn(); // keyboard activation of a focused button
  },
});

/**
 * Pokédex: Rotom hosts the projects. The ENTRY takes over the TOP screen (a DOM layer over the canvas, portalled
 * next to it; the world dims and stays frozen behind); the BOTTOM screen becomes the controls.
 * B steps back one level: entry -> grid / list -> closed. The open entry is mirrored in the URL.
 */
export default function Pokedex({ props, ctx }: OverlayComponentProps<PokedexProps>) {
  const host = useOverlay();
  const startIdx = dexIndex(props.slug);
  const mode: 'grid' | 'list' = props.mode ?? (props.intro || props.slug ? 'grid' : 'list');
  // Rotom's pop + line play on the first PC open of the session only; later opens go straight to the grid
  const [playIntro] = useState(() => !!props.intro && !introShown());
  const [view, setView] = useState<View>(playIntro ? 'intro' : startIdx >= 0 ? 'entry' : mode);
  const [phase, setPhase] = useState<'pop' | 'say'>(playIntro && !reduced() ? 'pop' : 'say');
  const [idx, setIdx] = useState(Math.max(0, startIdx));
  const [page, setPage] = useState(0);
  const [seen, setSeen] = useState<string[]>(readSeen);
  const pages = useRef<TextPagesHandle>(null);
  const entry = DEX[idx]!;
  const n = DEX.length;
  const prevEntry = DEX[(idx - 1 + n) % n]!;
  const nextEntry = DEX[(idx + 1) % n]!;

  // the world dims for as long as the Pokédex is open
  useEffect(() => {
    dim(true);
    return () => dim(false);
  }, []);

  useEffect(() => {
    if (playIntro) markIntroShown();
  }, [playIntro]);

  // Rotom's pop: a short beat, then he speaks
  useEffect(() => {
    if (view !== 'intro' || phase !== 'pop') return;
    const t = window.setTimeout(() => setPhase('say'), POP_MS);
    return () => window.clearTimeout(t);
  }, [view, phase]);

  // entries opened this visit get a Poké Ball; the URL follows the open entry
  const slugNow = view === 'entry' ? entry.slug : null;
  useEffect(() => {
    if (slugNow) setSeen(markSeen(slugNow));
    setOpenParam(slugNow ? `projects/${slugNow}` : null);
  }, [slugNow]);
  useEffect(() => () => setOpenParam(null), []);

  // screen-reader mirror of whatever the top screen shows
  const { announce } = host;
  useEffect(() => {
    if (view === 'intro') announce(phase === 'pop' ? 'Bzzt!' : ROTOM_LINE);
    else if (view === 'grid' || view === 'list') announce(`Pokédex. ${dexNo(entry)} ${entry.name}, ${entry.category}. Left and right to choose, A to open, B to close.`);
    else if (page === 0) announce(`${dexNo(entry)} ${entry.name}, ${entry.category}. ${entry.types.join(', ')}. ${entry.stats.map((s) => `${s.k}: ${s.v}`).join('. ')}. ${entry.flavour.join(' ')} ${entry.ribbon.text}.`);
    else if (page === LAST_PAGE) announce(`${entry.name}: links.`);
  }, [view, phase, idx, page, entry, announce]);

  const move = useCallback((d: number) => setIdx((i) => (i + d + n) % n), [n]);
  /** switch ENTRY (wraps), landing on its first page */
  const go = (d: number) => {
    move(d);
    setPage(0);
  };
  /** turn PAGE within the entry (wraps: the arrows never go dead) */
  const turn = (d: number) => setPage((p) => (p + d + PAGES.length) % PAGES.length);
  const openAt = (i: number) => {
    setIdx(i);
    setPage(0);
    setView('entry');
  };
  const openSlug = (slug: string) => {
    const i = dexIndex(slug);
    if (i >= 0) openAt(i);
  };
  const back = () => (view === 'entry' ? setView(mode) : ctx.close());
  const advance = () => {
    if (view === 'intro') {
      if (phase === 'pop') setPhase('say');
      else setView(mode);
    } else if (view === 'entry') {
      if (page > 0 && page < LAST_PAGE) pages.current?.advance();
      else turn(1); // the last page wraps round to the first
    } else openAt(idx);
  };
  const gridMove = (d: number) => {
    const j = idx + d;
    if (j >= 0 && j < n) setIdx(j);
  };

  useOverlayInput({
    a: advance,
    b: back,
    left: () => (view === 'entry' ? turn(-1) : view === 'grid' ? gridMove(-1) : view === 'list' ? move(-1) : undefined),
    right: () => (view === 'entry' ? turn(1) : view === 'grid' ? gridMove(1) : view === 'list' ? move(1) : undefined),
    up: () => (view === 'entry' ? go(-1) : view === 'grid' ? gridMove(-GRID_COLS) : view === 'list' ? move(-1) : undefined),
    down: () => (view === 'entry' ? go(1) : view === 'grid' ? gridMove(GRID_COLS) : view === 'list' ? move(1) : undefined),
    labels: view === 'entry' ? { a: 'Page ▶', b: 'Back' } : view === 'intro' ? { a: 'Next', b: 'Close' } : { a: 'Open', b: 'Close' },
  });

  const topEl = typeof document !== 'undefined' ? document.querySelector('.top-screen') : null;
  const box = objectBox('pc');
  const from = box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : null;

  const top =
    view === 'intro' ? (
      <Intro from={from} phase={phase} />
    ) : view === 'grid' ? (
      <Grid sel={idx} seen={seen} onSelect={setIdx} onOpen={openAt} />
    ) : view === 'list' ? (
      <List
        sel={idx}
        seen={seen}
        onSelect={(i) => {
          if (i === idx) openAt(i);
          else setIdx(i);
        }}
      />
    ) : (
      <Entry e={entry} page={page} pagesRef={pages} onDone={() => setPage((p) => Math.min(LAST_PAGE, p + 1))} onGo={openSlug} />
    );

  return (
    <>
      {topEl && createPortal(top, topEl)}
      <div className="overlay dex-ctl" data-testid="pokedex" data-view={view} data-page={view === 'entry' ? page + 1 : undefined}>
        <style>{CSS}</style>
        {view === 'intro' ? (
          <div
            className="dex-say"
            data-testid="dex-say"
            onPointerDown={(e) => {
              e.preventDefault();
              advance();
            }}
          >
            <div className="dex-who">ROTOM</div>
            <div>{phase === 'pop' ? 'Bzzt!' : ROTOM_LINE}</div>
            <span className={`more${phase === 'say' ? ' on' : ''}`} aria-hidden="true">
              ▼
            </span>
          </div>
        ) : (
          <>
            {view === 'entry' && (
              <>
                <div className="dex-entry-sw" role="group" aria-label="Switch entry">
                  <button type="button" className="dex-sw" aria-label={`Previous entry, ${dexNo(prevEntry)} ${prevEntry.name}`} data-testid="dex-entry-prev" {...press(() => go(-1))}>
                    {/* ▲ (U+25B2) not in HGSS font; flip ▼ (U+25BC) instead */}
                    <span aria-hidden="true" style={{ display: 'inline-block', transform: 'scaleY(-1)' }}>▼</span>
                    <span>No.{dexNo(prevEntry).slice(4)}</span>
                  </button>
                  <div className="dex-ctl-name" data-testid="dex-ctl-name">
                    {entry.name}
                  </div>
                  <button type="button" className="dex-sw" aria-label={`Next entry, ${dexNo(nextEntry)} ${nextEntry.name}`} data-testid="dex-entry-next" {...press(() => go(1))}>
                    <span aria-hidden="true">▼</span>
                    <span>No.{dexNo(nextEntry).slice(4)}</span>
                  </button>
                </div>
              </>
            )}
            <div className="dex-ctl-row">
              <button
                type="button"
                className="dex-nav"
                aria-label={view === 'entry' ? 'Previous page' : 'Previous project'}
                data-testid={view === 'entry' ? 'dex-page-prev' : 'dex-prev'}
                {...press(() => (view === 'entry' ? turn(-1) : view === 'grid' ? gridMove(-1) : move(-1)))}
              >
                <span className="dex-nav-face"><span className="dex-flip">▶</span></span>
              </button>
              <div className="dex-pager">
                {view === 'entry' ? (
                  <>
                    <div className="dex-page-title" data-testid="dex-page-title">{PAGES[page]}</div>
                    <div className="dex-dots" aria-hidden="true">
                      {PAGES.map((p, i) => (
                        <span key={p} className={`dex-dot${i === page ? ' on' : ''}`} />
                      ))}
                    </div>
                    <div className="dex-page-no" data-testid="dex-page-no">
                      Page {page + 1}/{PAGES.length}
                    </div>
                  </>
                ) : (
                  <div className="dex-info" data-testid="dex-info">{dexInfo(entry)}</div>
                )}
              </div>
              <button
                type="button"
                className="dex-nav"
                aria-label={view === 'entry' ? 'Next page' : 'Next project'}
                data-testid={view === 'entry' ? 'dex-page-next' : 'dex-next'}
                {...press(() => (view === 'entry' ? turn(1) : view === 'grid' ? gridMove(1) : move(1)))}
              >
                <span className="dex-nav-face">▶</span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
