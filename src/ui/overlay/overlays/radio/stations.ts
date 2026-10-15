import radioData from '../../../../content/radio.json' with { type: 'json' };

export type Track = {
  title: string;
  artist: string;
  note?: string;
  spotifyUrl: string;
};

export type ListStation = {
  id: string;
  kind: 'list';
  /** sample: true → name/desc/track content is placeholder; must be prefixed "Sample:" */
  sample: boolean;
  name: string;
  desc: string;
  tracks: Track[];
};

export type PlaylistStation = {
  id: string;
  kind: 'playlist';
  /** sample: true → content is placeholder */
  sample: boolean;
  name: string;
  desc: string;
  spotifyPlaylistUrl: string;
};

export type ObjectStation = {
  id: string;
  kind: 'object';
  /** sample: true → content is placeholder */
  sample: boolean;
  name: string;
  desc: string;
  objectId: string;
};

export type Station = ListStation | PlaylistStation | ObjectStation;

export const STATIONS: Station[] = radioData.stations as Station[];

/** Wrap-around tuning: return the next station index in direction +1 or -1. */
export function tune(current: number, dir: 1 | -1): number {
  return (current + dir + STATIONS.length) % STATIONS.length;
}

/** Needle position (0–100%) for a given station index. */
export function needlePct(idx: number): number {
  if (STATIONS.length <= 1) return 50;
  return Math.round((idx / (STATIONS.length - 1)) * 100);
}

/** Marker positions (0–100%) for every station except the first and last (they sit at the edges). */
export function markerPcts(): number[] {
  return STATIONS.slice(1, -1).map((_, i) =>
    Math.round(((i + 1) / (STATIONS.length - 1)) * 100),
  );
}

/**
 * Validate a Spotify playlist URL and return the 22-character playlist ID, or null.
 *
 * Accepts only:
 *   - protocol: https:
 *   - host: open.spotify.com
 *   - pathname: exactly /playlist/<22 alphanum chars> (no trailing segments, no ../ tricks)
 *
 * Anything else (http:, other host, javascript:, extra path segments, wrong ID length) → null.
 * The caller treats null as "show placeholder".
 */
export function playlistId(url: string): string | null {
  if (!url || url === 'placeholder') return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== 'open.spotify.com') return null;
  const m = /^\/playlist\/([A-Za-z0-9]{22})$/.exec(parsed.pathname);
  if (!m) return null;
  return m[1]!;
}

/** Parse an https://open.spotify.com/<kind>/<22-char id> URL (query string ignored) and return the ID, or null. */
function spotifyId(url: string, kinds: readonly string[]): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname !== 'open.spotify.com') return null;
  const m = /^\/([a-z]+)\/([A-Za-z0-9]{22})$/.exec(parsed.pathname);
  if (!m || !kinds.includes(m[1]!)) return null;
  return m[2]!;
}

/**
 * Validate a Spotify track URL and return the 22-character track ID, or null.
 * Same rules as playlistId(): https:, host exactly open.spotify.com, pathname exactly /track/<22 alphanum chars>.
 * The top-screen embed src and the "Open in Spotify" href are built from this ID only, never from the raw URL.
 */
export function trackId(url: string): string | null {
  return spotifyId(url, ['track']);
}

/**
 * Validate a Spotify track or album URL and return it unchanged, or null.
 *
 * Accepts only:
 *   - protocol: https:
 *   - host: open.spotify.com
 *   - pathname: /track/<22 chars> or /album/<22 chars>
 */
export function trackUrl(url: string): string | null {
  return spotifyId(url, ['track', 'album']) ? url : null;
}
