/**
 * Night tint maths for the layers drawn ABOVE the room's night overlay (the sprite layer and the foreground).
 *
 * The room's `tintLayer` darkens `bg` by drawing NIGHT_OVERLAY at `alpha` (the room's own `nightAlpha` while it is
 * night, 0 by day) over it, so every bg pixel becomes   p * (1 - alpha) + overlay * alpha   (per channel).
 * The sprite layer and `fg` sit above that overlay, so they have to be darkened by the SAME function, or a tall piece
 * cut at its footprint line (bg below, fg above) shows a seam and the actors glow on a dark floor.
 *
 * A plain multiplicative tint (`container.tint`) cannot do it: it has no additive term, so it can only match the
 * overlay for one reference colour. Matched at white (0x6f7486 at 0.58) a brown 0x8a5a3a comes out (60,41,30) above the
 * line and (61,47,51) below it. A ColorMatrixFilter is exactly `p * (1 - alpha) + overlay * alpha`, so it is used
 * instead. The per-room alpha needs no rescaling: the matrix is built from the room's live overlay alpha
 * (`nightFrac * roomNightAlpha`, the value `tintLayer.alpha` holds), so a room with a stronger `nightAlpha`
 * (downstairs, 0.72) darkens its sprites exactly as much as its floor.
 */

/** The colour of the room's night overlay (`tintLayer` in render.ts). */
export const NIGHT_OVERLAY = 0x06102e;

/**
 * The 5x4 colour matrix (Pixi `ColorMatrixFilter.matrix`, row-major, offsets in 0..1) that maps a colour to what the
 * night overlay at `alpha` makes of it. alpha <= 0 is the identity.
 */
export function nightMatrix(alpha: number, overlay = NIGHT_OVERLAY): number[] {
  const a = Math.min(1, Math.max(0, alpha));
  const k = 1 - a;
  const o = (shift: number) => (((overlay >> shift) & 0xff) / 255) * a;
  // prettier-ignore
  return [
    k, 0, 0, 0, o(16),
    0, k, 0, 0, o(8),
    0, 0, k, 0, o(0),
    0, 0, 0, 1, 0,
  ];
}

/** Apply a colour matrix to an opaque 0xrrggbb colour (what the filter does to one pixel), rounded to 0..255. */
export function applyMatrix(m: readonly number[], color: number): number {
  const c = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff].map((v) => v / 255);
  let out = 0;
  for (let row = 0; row < 3; row++) {
    const v = m[row * 5]! * c[0]! + m[row * 5 + 1]! * c[1]! + m[row * 5 + 2]! * c[2]! + m[row * 5 + 3]! + m[row * 5 + 4]!;
    out |= Math.round(Math.min(1, Math.max(0, v)) * 255) << ((2 - row) * 8);
  }
  return out;
}

/** What the night overlay at `alpha` draws over an opaque bg pixel of `color` (normal alpha blending). */
export function overlayOver(color: number, alpha: number, overlay = NIGHT_OVERLAY): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const p = (color >> shift) & 0xff;
    const o = (overlay >> shift) & 0xff;
    out |= Math.round(p * (1 - alpha) + o * alpha) << shift;
  }
  return out;
}
