/**
 * Pixel-font size lint: the HGSS font is built on a 16px em, so font-size must be
 * calc(var(--u) * 16) or calc(var(--u) * 32) in pixel-font contexts. Any other
 * multiple of --u blurs the bitmap glyphs.
 *
 * Scans:
 *   src/ui/**\/*.{ts,tsx,css}
 *   src/pages/**\/*.astro
 *
 * Two source forms are caught:
 *   CSS/inline-string: font-size: calc(var(--u) * N)
 *   Template helper:   font-size: ${u(N)}
 *
 * Opt-out: add `/* font-size-ok: <reason> *\/` on the same line for text that
 * intentionally uses a system font (e.g. /about's system-ui body copy).
 * The comment prevents the line from being flagged.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Recursively collect files matching the given extensions under `dir`. */
function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => full.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const UI_FILES = walk(join(ROOT, 'src/ui'), ['.ts', '.tsx', '.css']);
const PAGE_FILES = walk(join(ROOT, 'src/pages'), ['.astro']);
const ALL_FILES = [...UI_FILES, ...PAGE_FILES];

/** Allowed multipliers for calc(var(--u) * N) font-size. */
const ALLOWED = new Set([16, 32]);

/** Opt-out marker: if the line contains this, skip the size check. */
const OPT_OUT = 'font-size-ok:';

/**
 * Pattern 1 — literal CSS form (in .css, .astro, and CSS-in-JS string literals):
 *   font-size: calc(var(--u) * N)
 *   (tolerates optional whitespace around the * and inside the parens)
 */
const CSS_FORM = /font-size\s*:\s*calc\(\s*var\(\s*--u\s*\)\s*\*\s*(\d+)\s*\)/gi;

/**
 * Pattern 2 — template helper form (in .ts/.tsx):
 *   font-size: ${u(N)}
 * The u() helper expands to calc(var(--u) * N) at runtime.
 */
const TPL_FORM = /font-size\s*:\s*\$\{u\((\d+)\)\}/gi;

interface Violation {
  file: string;
  line: number;
  col: number;
  multiplier: number;
  text: string;
}

function scanFile(path: string): Violation[] {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const violations: Violation[] = [];

  const check = (lineIdx: number, col: number, multiplier: number, raw: string) => {
    const lineText = lines[lineIdx] ?? '';
    if (lineText.includes(OPT_OUT)) return; // explicit opt-out
    if (!ALLOWED.has(multiplier)) {
      violations.push({ file: path, line: lineIdx + 1, col: col + 1, multiplier, text: raw.trim() });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Pattern 1
    CSS_FORM.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CSS_FORM.exec(line)) !== null) {
      check(i, m.index, parseInt(m[1]!, 10), m[0]);
    }

    // Pattern 2
    TPL_FORM.lastIndex = 0;
    while ((m = TPL_FORM.exec(line)) !== null) {
      check(i, m.index, parseInt(m[1]!, 10), m[0]);
    }
  }

  return violations;
}

describe('pixel-font size lint', () => {
  it('covers at least one UI file and one page file (sanity: glob found files)', () => {
    expect(UI_FILES.length, 'no UI files found').toBeGreaterThan(0);
    expect(PAGE_FILES.length, 'no page files found').toBeGreaterThan(0);
  });

  it('every calc(var(--u)*N) font-size uses N=16 or N=32 (blur-free pixel multiples)', () => {
    const all: Violation[] = [];
    for (const file of ALL_FILES) {
      all.push(...scanFile(file));
    }
    if (all.length > 0) {
      const msg = all
        .map((v) => `  ${v.file.replace(ROOT, '')}:${v.line}:${v.col}  N=${v.multiplier}  "${v.text}"`)
        .join('\n');
      expect.fail(`Pixel-font size violations (only 16 or 32 allowed):\n${msg}\nAdd /* font-size-ok: <reason> */ on the line to opt out (system-font text only).`);
    }
  });
});
