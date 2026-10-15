import { SCREEN_H, SCREEN_W } from './grid';

/**
 * Largest integer scale s where a 256x192 screen fits the box, measured in DEVICE pixels.
 * (cssW/cssH are CSS px, dpr converts to device px.)
 */
export function computeScale(cssW: number, cssH: number, dpr: number): number {
  const eps = 0.02; // tolerate fractional layout rounding
  const s = Math.floor(Math.min((cssW * dpr + eps) / SCREEN_W, (cssH * dpr + eps) / SCREEN_H));
  return Math.max(1, s);
}

/** Gap between the two stacked screens, in native pixels. */
export const STACK_GAP = 4;

/**
 * DS stack: top screen (256x192) over bottom screen (256x192) plus a small gap, same width.
 * Largest integer device-pixel scale at which BOTH fit the box (CSS px in, dpr converts).
 */
export function stackScale(cssW: number, cssH: number, dpr: number): number {
  const eps = 0.02;
  const s = Math.floor(Math.min((cssW * dpr + eps) / SCREEN_W, (cssH * dpr + eps) / (2 * SCREEN_H + STACK_GAP)));
  return Math.max(1, s);
}
