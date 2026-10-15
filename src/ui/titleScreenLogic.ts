/**
 * Title-screen show/skip logic: pure functions so they can be unit-tested
 * without a DOM or React.
 *
 * Rules (all must be true to show):
 *  - On `/` (no deep link `?open=...`)
 *  - Not `?debug` mode, unless `?title=1` is explicitly set
 *  - Not shown yet this session (sessionStorage `title-shown`)
 *  - `prefers-reduced-motion: reduce` → skip entirely (static-cue fallback
 *    is acceptable; the recruiter can interact immediately)
 */

export interface TitleParams {
  hasOpen: boolean;      // ?open= present
  isDebug: boolean;      // ?debug present
  forceTitle: boolean;   // ?title=1 present (overrides ?debug)
  reducedMotion: boolean;
  alreadyShown: boolean; // sessionStorage flag
}

/**
 * Parse the parameters we need from a URLSearchParams and sessionStorage.
 * Separated so the decision function stays pure and testable.
 */
export function parseTitleParams(search: URLSearchParams): Omit<TitleParams, 'reducedMotion' | 'alreadyShown'> {
  return {
    hasOpen: search.has('open'),
    isDebug: search.has('debug'),
    forceTitle: search.get('title') === '1',
  };
}

/**
 * Pure decision: given params, should the title screen show?
 */
export function shouldShowTitle(p: TitleParams): boolean {
  if (p.reducedMotion) return false;    // skip – player can interact immediately
  if (p.hasOpen) return false;          // deep link: go straight to the room
  if (p.isDebug && !p.forceTitle) return false; // ?debug skips unless ?title=1
  if (p.alreadyShown) return false;    // only once per session
  return true;
}

/**
 * Length of the "Night walk" intro animation (ms from mount). At this point the
 * component flips `data-phase` from `intro` to `settled` (PRESS START blinks,
 * the follower bobs). The CSS beats in app.css are timed against this value.
 */
export const INTRO_MS = 3200;

/** Auto-dismiss: the intro, then a 2.5 s hold on the settled title. */
export const AUTO_MS = INTRO_MS + 2500;

/**
 * Controls whether a VISIBLE "Skip" button is rendered in the bottom screen (bottom-right),
 * next to the always-present sr-only "Skip intro" button. True now that the intro animation
 * exists: mouse/touch users get a visible early exit. Either button dismisses the whole title.
 */
export const SHOW_SKIP_BUTTON = true;

const SS_KEY = 'title-shown';

/** Read the sessionStorage flag. Wrapped in try/catch (private browsing may throw). */
export function readShown(): boolean {
  try {
    return sessionStorage.getItem(SS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark as shown. */
export function markShown(): void {
  try {
    sessionStorage.setItem(SS_KEY, '1');
  } catch {
    /* ignored */
  }
}
