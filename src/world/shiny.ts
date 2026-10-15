/**
 * Shiny follower: one page load in SHINY_ODDS spawns Oshawott in its shiny colours, with a sparkle burst.
 * `?shiny=1` forces it, `?shiny=0` prevents it; under `?debug` the roll is off unless `?shiny=1` (e2e stays deterministic).
 * Decided once per page load (not per session: refreshing is how you hunt for one).
 */
export const SHINY_ODDS = 64;

export function rollShiny(search: URLSearchParams, rng: () => number): boolean {
  const forced = search.get('shiny');
  if (forced === '1') return true;
  if (forced === '0') return false;
  if (search.has('debug')) return false;
  return Math.floor(rng() * SHINY_ODDS) === 0;
}

let decided: boolean | null = null;
/** The roll for this page load, made on first use (browser only; false on the server). */
export function isShiny(): boolean {
  if (decided !== null) return decided;
  if (typeof window === 'undefined') return false;
  decided = rollShiny(new URLSearchParams(window.location.search), Math.random);
  return decided;
}
