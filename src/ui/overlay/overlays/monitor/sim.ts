/**
 * Simulated market data for the monitor overlay. PURE: no clock, no Math.random, no network.
 * Everything is derived from a seeded PRNG (mulberry32, seeded by an FNV-1a hash), so the same symbol + date always
 * draws the same session. The tickers and prices are fictional on purpose.
 */

export interface Candle {
  /** minute index into the session, 0..389 (09:30 .. 15:59) */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface SymbolInfo {
  symbol: string;
  /** display name; ASCII letters, digits, space and . % + - / : only (pixel-font safe) */
  name: string;
}

export const SYMBOLS: readonly SymbolInfo[] = [
  { symbol: 'OSHA', name: 'Oshawott Co.' },
  { symbol: 'ROTM', name: 'Rotom Labs' },
  { symbol: 'PKMN', name: 'Pallet Mutual' },
];

export const SESSION_MINUTES = 390;
export const LAST_MINUTE = SESSION_MINUTES - 1;

/** FNV-1a 32-bit hash of a string. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: returns a function giving floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: one standard normal draw from a uniform source. */
export function normal(rnd: () => number): number {
  const u = 1 - rnd(); // (0, 1]
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Start price: stable per symbol (not per date), an obviously fictional round-ish number in 20..200. */
export function startPrice(symbol: string): number {
  const rnd = mulberry32(hash32(`${symbol}|start`));
  return 20 + Math.round(rnd() * 36) * 5; // 20, 25 ... 200
}

const BASE_SIGMA = 0.0009;

/** Per-minute volatility: U-shape (open drive, midday chop, push into the close). */
export function sigmaAt(t: number): number {
  if (t < 30) return BASE_SIGMA * (1 + 2.5 * (1 - t / 30));
  if (t >= SESSION_MINUTES - 30) return BASE_SIGMA * (1 + 1.8 * ((t - (SESSION_MINUTES - 30)) / 30));
  return BASE_SIGMA;
}

/** 390 one-minute candles for a 09:30-16:00 session. */
export function simSession(symbol: string, date: string): Candle[] {
  const rnd = mulberry32(hash32(`${symbol}|${date}`));
  const dir = rnd() < 0.5 ? -1 : 1; // open-drive direction
  let price = startPrice(symbol);
  let anchor = price;
  const out: Candle[] = [];
  for (let t = 0; t < SESSION_MINUTES; t++) {
    const s = sigmaAt(t);
    let drift = 0;
    if (t < 30) drift = dir * 0.00035 * (1 - t / 30);
    else if (t >= 30 && t < SESSION_MINUTES - 30) drift = -0.02 * Math.log(price / anchor); // slight mean reversion
    if (t === 29) anchor = price;
    const o = price;
    const c = Math.max(0.01, r2(o * Math.exp(drift + s * normal(rnd))));
    const h = r2(Math.max(o, c) * Math.exp(Math.abs(normal(rnd)) * s * 0.6));
    const l = Math.max(0.01, r2(Math.min(o, c) * Math.exp(-Math.abs(normal(rnd)) * s * 0.6)));
    out.push({ t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c });
    price = c;
  }
  return out;
}

/** Change in percent vs the session open, using the close of candle `upTo`. */
export function changePct(candles: readonly Candle[], upTo: number): number {
  const open = candles[0]!.o;
  const last = candles[Math.min(upTo, candles.length - 1)]!.c;
  return ((last - open) / open) * 100;
}

/** "+1.2%" / "-0.4%" / "0.0%" (one decimal). */
export function fmtPct(p: number): string {
  const v = Math.round(p * 10) / 10;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** 09:30 + minute -> "HH:MM". Minute 390 is the close, 16:00. */
export function clockLabel(minute: number): string {
  const m = 9 * 60 + 30 + Math.max(0, Math.min(SESSION_MINUTES, Math.floor(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** One sparkline column: the low / high close of the candles that fall in it. */
export interface SparkCol {
  lo: number;
  hi: number;
}

/** Downsample the closes of candles 0..upTo into at most `cols` columns: the session SO FAR fills the width
 *  (fewer columns only while fewer than `cols` minutes have ticked). */
export function sparkline(candles: readonly Candle[], upTo: number, cols: number): SparkCol[] {
  const n = Math.min(upTo, candles.length - 1) + 1;
  const k = Math.min(cols, n);
  const out: SparkCol[] = [];
  for (let i = 0; i < k; i++) {
    const a = Math.floor((i * n) / k);
    const b = Math.max(a, Math.floor(((i + 1) * n) / k) - 1);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = a; j <= b; j++) {
      const c = candles[j]!.c;
      if (c < lo) lo = c;
      if (c > hi) hi = c;
    }
    out.push({ lo, hi });
  }
  return out;
}

/** Lowest low and highest high of candles 0..upTo (the range so far: a scale or label never shows the future). */
export function rangeSoFar(candles: readonly Candle[], upTo: number): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j <= Math.min(upTo, candles.length - 1); j++) {
    lo = Math.min(lo, candles[j]!.l);
    hi = Math.max(hi, candles[j]!.h);
  }
  return { lo, hi };
}

/** Aggregate 1-minute candles 0..upTo into `size`-minute candles (the last one may be partial). */
export function aggregate(candles: readonly Candle[], upTo: number, size: number): Candle[] {
  const out: Candle[] = [];
  for (let a = 0; a <= upTo && a < candles.length; a += size) {
    const b = Math.min(upTo, a + size - 1, candles.length - 1);
    let h = -Infinity;
    let l = Infinity;
    for (let k = a; k <= b; k++) {
      h = Math.max(h, candles[k]!.h);
      l = Math.min(l, candles[k]!.l);
    }
    out.push({ t: out.length, o: candles[a]!.o, h, l, c: candles[b]!.c });
  }
  return out;
}

/** The session date: the visitor's local day; fixed under ?debug so e2e is deterministic. */
export function sessionDate(search: string, now: Date = new Date()): string {
  if (/[?&]debug\b/.test(search)) return '2026-01-05';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
