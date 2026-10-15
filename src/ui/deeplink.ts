/**
 * `?open=<value>` -> overlay id for the overlays that open over the room at the start tile (like `card`). Photos/food are the plain-page names.
 * `projects/<slug>` (pokedex, places the player at the PC) and `card` have their own handling in App.tsx / their overlays.
 */
export const OPEN_OVERLAYS: Readonly<Record<string, string>> = {
  townmap: 'townmap',
  piano: 'piano',
  journal: 'journal',
  monitor: 'monitor',
  radio: 'radio',
  phone: 'phone',
  photos: 'corkboard',
  food: 'fridge',
};
/** The overlay a `?open=` value names, or null (unknown values load normally). */
export function overlayForOpen(value: string | null): string | null {
  return value && Object.prototype.hasOwnProperty.call(OPEN_OVERLAYS, value) ? (OPEN_OVERLAYS[value] as string) : null;
}
/** The `?open=` value for an overlay id (reverse of OPEN_OVERLAYS), or null when it has none. */
export function openForOverlay(id: string | null | undefined): string | null {
  return Object.entries(OPEN_OVERLAYS).find(([, o]) => o === id)?.[0] ?? null;
}

/** Reflect the open overlay in the URL (shareable) without a navigation: `/?open=<value>` (`projects/<slug>`, `card`), `/` when closed. */
export function setOpenParam(value: string | null): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete('open');
  const rest = params.toString();
  const query = [rest, value ? `open=${value}` : ''].filter(Boolean).join('&');
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', next);
}
