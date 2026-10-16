import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from './context';
import { HINT_KEY_A, HINT_KEY_B, KEY_A, KEY_B, keyHintLines } from './keys';

/** The desktop key hint is drawn in the HGSS pixel font: every glyph must exist in it (same glyph set as content.test.ts). */
const glyphSet = new Set<number>(JSON.parse(readFileSync(fileURLToPath(new URL('../../content/fontGlyphs.json', import.meta.url)), 'utf8')) as number[]);
const uncovered = (s: string) => [...s].filter((ch) => ch !== ' ' && ch !== ' ' && !glyphSet.has(ch.codePointAt(0)!));

const OVERLAYS = fileURLToPath(new URL('./overlays', import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [readFileSync(p, 'utf8')] : [];
  });
}

/** Every label an overlay can put on A / B: the quoted strings of its `labels: { ... }` objects and `aLabel` / `bLabel` lines. */
function overlayLabels(): string[] {
  const out = new Set<string>([DEFAULT_LABELS.a, DEFAULT_LABELS.b]);
  for (const src of sources(OVERLAYS)) {
    for (const m of src.matchAll(/labels:\s*\{([\s\S]{0,260}?)\}/g)) for (const q of m[1]!.matchAll(/'([^']*)'/g)) out.add(q[1]!);
    for (const m of src.matchAll(/\b[ab]Label\b[^\n]*/g)) for (const q of m[0].matchAll(/'([^']*)'/g)) out.add(q[1]!);
  }
  return [...out];
}

describe('desktop key hint', () => {
  it('names keys the input layer really accepts (Z = A, X = B)', () => {
    expect(KEY_A.has(`Key${HINT_KEY_A}`)).toBe(true);
    expect(KEY_B.has(`Key${HINT_KEY_B}`)).toBe(true);
  });

  it('is "<key> <label>" per button, built from the overlay labels', () => {
    expect(keyHintLines({ a: 'Open', b: 'Close' })).toEqual(['Z Open', 'X Close']);
    expect(keyHintLines({ a: DEFAULT_LABELS.a, b: DEFAULT_LABELS.b })).toEqual(['Z Talk', 'X Back']);
  });

  it('finds the overlays labels (sanity: the scan sees Open, Close, Next, Back)', () => {
    const l = overlayLabels();
    for (const w of ['Open', 'Close', 'Next', 'Back']) expect(l).toContain(w);
  });

  it('every hint line of every overlay label uses only pixel-font glyphs, and stays short enough for the 88u corner', () => {
    for (const label of overlayLabels()) {
      for (const line of keyHintLines({ a: label, b: label })) {
        expect(uncovered(line), line).toEqual([]);
        expect(line.length, `${line} is too long for the hint corner`).toBeLessThanOrEqual(11);
      }
    }
  });
});
