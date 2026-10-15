/** Key layout + computer-keyboard mapping for the piano overlay. Pure data, no DOM. */

export const FIRST = 60; // C4
export const LAST = 83; // B5
export const KEY_COUNT = LAST - FIRST + 1; // 24

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
export const isBlack = (midi: number) => BLACK_PCS.has(((midi % 12) + 12) % 12);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export interface KeyDef {
  midi: number;
  black: boolean;
  /** white keys: index among white keys (0..13). black keys: index of the white key to their left */
  white: number;
}

/** C4..B5 in pitch order. */
export const KEYS: KeyDef[] = (() => {
  const out: KeyDef[] = [];
  let w = -1;
  for (let m = FIRST; m <= LAST; m++) {
    const black = isBlack(m);
    if (!black) w++;
    out.push({ midi: m, black, white: w });
  }
  return out;
})();
export const WHITE_COUNT = KEYS.filter((k) => !k.black).length; // 14

/**
 * Home row = white keys, row above = black keys (the usual tracker / DAW layout):
 *   W E   T Y U   O P
 *  A S D F G H J K L ; '
 * A..K is C4..C5, then L ; ' carry on to D5 E5 F5. Z X C V B N M (and the arrows + A) cover the rest through the cursor.
 * KeyZ / KeyX stay with the host (A / B).
 */
export const KEYMAP: Readonly<Record<string, number>> = {
  KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71,
  KeyK: 72, KeyO: 73, KeyL: 74, KeyP: 75, Semicolon: 76, Quote: 77,
};

/** Printed on the keys: code -> short label ("A", ";"). */
export const keyLabel = (code: string) => (code === 'Semicolon' ? ';' : code === 'Quote' ? "'" : code.replace('Key', ''));
export const LABEL_BY_MIDI: Readonly<Record<number, string>> = Object.fromEntries(Object.entries(KEYMAP).map(([c, m]) => [m, keyLabel(c)]));

/** Move the key cursor one key left/right, clamped to the keyboard. */
export const moveCursor = (midi: number, dir: -1 | 1) => Math.min(LAST, Math.max(FIRST, midi + dir));

/** Fold any pitch into the visible range for LIGHTING only (the sound keeps its real pitch). */
export function foldToRange(midi: number): number {
  let m = midi;
  while (m < FIRST) m += 12;
  while (m > LAST) m -= 12;
  return m;
}
