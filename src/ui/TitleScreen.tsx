/**
 * HGSS-style title screen shown on first load of `/` in a session.
 *
 * Layout (one DS unit):
 *   TOP screen (256x192 native)  — night sky, stars, follower sprite, "Ayush Basu" wordmark
 *   BOTTOM screen (256x192 native) — blinking "PRESS START", visible "Skip" (bottom-right)
 *
 * The component sits ABOVE `.screens` (position:absolute inside .screens) and covers
 * both screens. The world loads underneath and stays frozen until dismissed.
 *
 * INTRO ("Night walk"), ms from mount; all beats are CSS animations with
 * animation-delay in app.css (no JS per-frame work):
 *      0–600   seven 2x2 stars pop in, 100 ms apart, then twinkle
 *    300–2000  Oshawott walks in from off-screen left (facing right, 2-frame walk, 4u steps)
 *   2000       stops and turns to face down (stand pose)
 *   2300–2800  "!" emote above it (emote.exclaim; frame 0 for 150 ms, then frame 1);
 *              gone before the name lands, so the two never overlap
 *   2600–3000  the name drops in (6 steps of 16u, 2u overshoot, settle)
 *   3200       INTRO_MS: `data-phase` flips intro -> settled; PRESS START blinks, follower bobs
 * Settled positions: name top 60u, follower (112u, 100u). Under prefers-reduced-motion the
 * title is never shown (App.tsx); belt and braces, the component starts `settled` and the CSS
 * drops every animation.
 *
 * Dismiss paths (all call `onDismiss`, at any time during or after the intro):
 *   - Any key press (capture-phase, preventDefault + stopImmediatePropagation; Tab and
 *     browser shortcuts excluded: modifier combos and F-keys pass through untouched)
 *   - Click anywhere on the DS unit area
 *   - "Skip intro" sr-only button (first Tab stop; activated via Enter/Space)
 *   - Visible "Skip" button (SHOW_SKIP_BUTTON; aria-hidden + tabIndex -1, so assistive tech
 *     and keyboard users meet a single Skip: the sr-only one)
 *   - Auto-dismiss after AUTO_MS (disabled when noAuto=true, for e2e ?title=1)
 *
 * KEY SAFETY: capture-phase + stopImmediatePropagation so the dismissing key NEVER
 * reaches OverlayHost (Esc/B) or the game (Enter/A, arrows). Tab excluded so keyboard
 * users can reach the Skip button and QuickLinks.
 *
 * BACKGROUND TAB: a link opened in a new tab (the recruiter case) mounts while hidden. The
 * intro would play unseen and the auto-dismiss would fire before anyone looked, so the
 * timers only run while the document is visible, and the top screen is re-keyed when the
 * tab is first looked at (or looked at again mid-intro), restarting every CSS beat from 0.
 * A settled title stays settled. This is also what keeps the #59 DS lid honest: the lid
 * closes on `visibilitychange` and the title can never auto-dismiss under a closed lid.
 *
 * ACCESSIBILITY: the dialog itself receives focus on mount (its label is the entry point for
 * screen readers), so no focus ring shows on load. The first Tab lands on the visually-hidden
 * "Skip intro" button; its `:focus-visible` ring is drawn on the visible "Skip" (keyboard users
 * see it, mouse/touch users never do). No aria-modal: focus is moved manually, which is
 * sufficient for an inline dialog.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getAsset, getEmoteAsset } from '../assets/useAsset';
import { AUTO_MS, INTRO_MS, SHOW_SKIP_BUTTON } from './titleScreenLogic';

interface Props {
  name: string;    // e.g. "Ayush Basu" — shown as the wordmark
  /** Called once when the screen is dismissed. */
  onDismiss: () => void;
  /** ?title=1: disables the auto-dismiss timer so e2e tests don't race. */
  noAuto?: boolean;
  /**
   * Whether to render the visible "Skip" button (bottom-right of the bottom screen) in
   * addition to the sr-only "Skip intro" one. Defaults to SHOW_SKIP_BUTTON (true).
   */
  showSkip?: boolean;
}

/**
 * Oshawott follower sprite: 64x128 native px (2 cols × 4 rows, 32px cells).
 * Rows: down, left, up, right. Row 0 col 1 = stand (settled); row 3 = walking right (intro).
 * All sizing in calc(var(--u)*N) → integer scale steps.
 * If the slot has no `path` (placeholder), fall back to the slot colour.
 */
const FOLLOWER = getAsset('sprite.follower');
/** "!" bubble: 30x16 strip of two 15x16 frames. Missing slot → no bubble. */
const EXCLAIM = getEmoteAsset('emote.exclaim');

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function TitleScreen({ name, onDismiss, noAuto, showSkip = SHOW_SKIP_BUTTON }: Props) {
  const dismissed = useRef(false);
  // Keep onDismiss in a ref so timer/listeners never need to restart on re-renders
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismissRef.current();
  }, []); // stable — deps accessed via ref

  /* Keyboard dismiss — capture phase; kills the event so it never reaches the game.
     Tab excluded: keyboard users must be able to Tab to the Skip button and QuickLinks. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      // browser shortcuts (Ctrl/Cmd+R, Ctrl+F, Alt+Left, F5, F12...) are never the player's: let them through
      if (e.ctrlKey || e.metaKey || e.altKey || /^F\d{1,2}$/.test(e.key) || e.isComposing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      dismiss();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [dismiss]);

  /* Intro -> settled after INTRO_MS of VISIBLE time (straight to settled under reduced motion).
     Runs even with noAuto, so e2e can wait for `data-phase="settled"`. */
  const [phase, setPhase] = useState<'intro' | 'settled'>(() => (reducedMotion() ? 'settled' : 'intro'));
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /* Visibility: the timers below only count while the tab is looked at. `epoch` re-keys the
     top screen when a hidden tab becomes visible mid-intro, so the CSS beats restart from 0
     in step with the restarted INTRO_MS timer (see BACKGROUND TAB above). */
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const onVisibility = () => {
      const now = document.visibilityState !== 'hidden';
      setVisible(now);
      if (now && phaseRef.current === 'intro') setEpoch((e) => e + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (phase === 'settled' || !visible) return;
    const id = window.setTimeout(() => setPhase('settled'), INTRO_MS);
    return () => window.clearTimeout(id);
  }, [phase, visible, epoch]);

  /* Auto-dismiss (suppressed when noAuto=true for e2e stability); restarts from the full
     AUTO_MS each time the tab becomes visible. */
  useEffect(() => {
    if (noAuto || !visible) return;
    const id = window.setTimeout(dismiss, AUTO_MS);
    return () => window.clearTimeout(id);
  }, [dismiss, noAuto, visible]);

  /* Focus the dialog itself on mount: screen readers hear its label, keyboard users press any
     key or Tab once to the sr-only Skip. Focusing the button instead would draw its ring on
     load (script focus matches :focus-visible in Chromium) for every visitor. */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    /* Click (not pointerdown) to dismiss: no ghost taps fall through to the room below.
       QuickLinks are siblings of .screens in the DOM and are never covered. */
    <div
      ref={rootRef}
      tabIndex={-1}
      className="title-screen"
      data-testid="title-screen"
      data-phase={phase}
      data-epoch={epoch}
      role="dialog"
      aria-label={`${name} — portfolio. Press any key or tap to enter.`}
      onClick={dismiss}
    >
      {/* TOP SCREEN: dark sky, stars, follower sprite, name wordmark. Keyed by epoch: a remount
          restarts every CSS beat when a background tab is first looked at. */}
      <div className="title-top" aria-hidden="true" key={epoch}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <span key={n} className={`title-star title-star-${n}`} />
        ))}

        {/* Follower: walks in facing right, then stands facing down (col=1, row=0) */}
        <div className="title-follower">
          {'path' in FOLLOWER ? (
            <div
              className="title-follower-sprite"
              style={{ backgroundImage: `url(${(FOLLOWER as { path: string }).path})` }}
            />
          ) : (
            <div
              className="title-follower-sprite title-follower-placeholder"
              style={{ background: 'color' in FOLLOWER ? (FOLLOWER as { color: string }).color : '#888' }}
            />
          )}
        </div>

        {/* "!" emote above the follower during the intro (hidden once settled) */}
        {EXCLAIM && (
          <div className="title-emote" style={{ backgroundImage: `url(${EXCLAIM.path})` }} />
        )}

        {/* Wordmark: name only, no subtitle */}
        <p className="title-name">{name}</p>
      </div>

      {/* Hinge */}
      <div className="hinge" aria-hidden="true" />

      {/* BOTTOM SCREEN: "PRESS START", sr-only "Skip intro" (always), visible "Skip" (showSkip) */}
      <div className="title-bottom">
        {/* Visually-hidden "Skip intro" button: the first Tab stop, the single Skip that
            screen readers and keyboard users meet. Focus ring revealed by :focus-visible:
            on itself, or (--proxy) on the visible "Skip" when that is rendered. */}
        <button
          type="button"
          className={`sr-only title-skip-sr${showSkip ? ' title-skip-sr--proxy' : ''}`}
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
        >
          Skip intro
        </button>
        {showSkip && (
          /* Visible "Skip" for mouse/touch: bottom-right, min 44px tap target, 16u text.
             aria-hidden + tabIndex -1: it duplicates the sr-only button above. */
          <button
            type="button"
            className="title-skip"
            aria-hidden="true"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
          >
            Skip
          </button>
        )}
        <p className="title-press-start" aria-hidden="true">PRESS START</p>
      </div>
    </div>
  );
}
