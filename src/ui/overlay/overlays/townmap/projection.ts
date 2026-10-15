/**
 * Equirectangular projection matching scripts/draw-world-map.py and draw-region-map.py exactly.
 * Keep the world-map constants in sync with draw-world-map.py.
 *
 * Maps (lon, lat) -> native pixel (x, y) in a 256×192 PNG.
 */
export const MAP_W = 256;
export const MAP_H = 192;

// World map bbox (matches draw-world-map.py)
export const LON_MIN = -180;
export const LON_MAX = 180;
export const LAT_MAX = 85;
export const LAT_MIN = -60;

/** Convert (lon, lat) to integer native pixel coords (x, y) in the world map (full extent). */
export function project(lon: number, lat: number): [number, number] {
  return projectBbox(lon, lat, LON_MIN, LAT_MIN, LON_MAX, LAT_MAX);
}

/**
 * Convert (lon, lat) to integer native pixel coords (x, y) in any equirectangular bbox.
 *
 * @param lon     Longitude
 * @param lat     Latitude
 * @param lonW    West edge of bbox
 * @param latS    South edge of bbox
 * @param lonE    East edge of bbox
 * @param latN    North edge of bbox
 *
 * The bbox is assumed to already be padded to 4:3 by the Python renderer; the JS side
 * must apply the same padding before calling this function.
 */
export function projectBbox(
  lon: number,
  lat: number,
  lonW: number,
  latS: number,
  lonE: number,
  latN: number,
): [number, number] {
  const x = Math.round(((lon - lonW) / (lonE - lonW)) * MAP_W);
  const y = Math.round(((latN - lat) / (latN - latS)) * MAP_H);
  return [x, y];
}

/**
 * Pad a bbox to 4:3 aspect ratio (lon/lat span), centred, matching draw-region-map.py.
 * Returns [lonW, latS, lonE, latN].
 */
export function padBbox(
  lonW: number,
  latS: number,
  lonE: number,
  latN: number,
): [number, number, number, number] {
  const targetRatio = MAP_W / MAP_H; // 4/3
  const lonSpan = lonE - lonW;
  const latSpan = latN - latS;
  if (lonSpan <= 0 || latSpan <= 0) return [lonW, latS, lonE, latN];
  const currentRatio = lonSpan / latSpan;
  if (currentRatio < targetRatio) {
    const newLonSpan = latSpan * targetRatio;
    const pad = (newLonSpan - lonSpan) / 2;
    return [lonW - pad, latS, lonE + pad, latN];
  } else {
    const newLatSpan = lonSpan / targetRatio;
    const pad = (newLatSpan - latSpan) / 2;
    return [lonW, latS - pad, lonE, latN + pad];
  }
}

/**
 * Project a (lon, lat) into a raw bbox (auto-pads to 4:3).
 * Use for region and country maps; matches draw-region-map.py output.
 */
export function projectRegion(
  lon: number,
  lat: number,
  rawBbox: [number, number, number, number],
): [number, number] {
  const [lonW, latS, lonE, latN] = padBbox(...rawBbox);
  return projectBbox(lon, lat, lonW, latS, lonE, latN);
}
