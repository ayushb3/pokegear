import type { Dir4 } from './context';

/**
 * The keys the overlay input layer (OverlayHost) accepts: ONE source of truth for the handler AND for the on-screen key hint.
 * `Key*` are `KeyboardEvent.code` values.
 */
export const KEY_A = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyZ']);
export const KEY_B = new Set(['Escape', 'KeyX', 'Backspace']);
export const KEY_DIR: Record<string, Dir4> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

/** The key shown on the hint for A / B (the first one a player would reach for; Enter / Space and Esc / Backspace work too). */
export const HINT_KEY_A = 'Z';
export const HINT_KEY_B = 'X';

/**
 * The desktop key hint, two short lines built from the overlay's own A / B labels: "Z Open" and "X Close".
 * Plain ASCII, so every glyph exists in the pixel font (the pixel font has no arrow glyphs; the d-pad is not listed, the
 * arrows are the obvious keys). Pure, unit-tested (`keyHint.test.ts`).
 */
export function keyHintLines(labels: { a: string; b: string }): [string, string] {
  return [`${HINT_KEY_A} ${labels.a}`, `${HINT_KEY_B} ${labels.b}`];
}

/** True if `code` is a key the host maps to A, B or a direction (the hint's "actual keys" test uses it). */
export function isOverlayKey(code: string): boolean {
  return KEY_A.has(code) || KEY_B.has(code) || code in KEY_DIR;
}
