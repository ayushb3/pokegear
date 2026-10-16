import { describe, expect, it } from 'vitest';
import { SYMBOLS, aggregate, changePct, clockLabel, fmtPct, simSession, sparkline, sessionDate, startPrice, rangeSoFar } from './sim';

describe('sim session', () => {
  it('is deterministic and varies by symbol and date', () => {
    expect(simSession('OSHA', '2026-01-05')).toEqual(simSession('OSHA', '2026-01-05'));
    expect(simSession('OSHA', '2026-01-06')).not.toEqual(simSession('OSHA', '2026-01-05'));
    expect(simSession('ROTM', '2026-01-05')).not.toEqual(simSession('OSHA', '2026-01-05'));
  });
  it('has 390 consistent candles with positive 2-decimal prices', () => {
    for (const { symbol } of SYMBOLS) {
      for (let d = 0; d < 200; d++) {
        const s = simSession(symbol, `2026-02-${d}`);
        expect(s).toHaveLength(390);
        let bad = 0;
        s.forEach((c, i) => {
          const ok =
            c.t === i &&
            c.h >= Math.max(c.o, c.c) &&
            c.l <= Math.min(c.o, c.c) &&
            c.l > 0 &&
            [c.o, c.h, c.l, c.c].every((v) => Math.round(v * 100) / 100 === v) &&
            (i === 0 || c.o === s[i - 1]!.c);
          if (!ok) bad++;
        });
        expect(bad).toBe(0);
      }
    }
  });
  it('start price is stable per symbol and in range', () => {
    for (const { symbol } of SYMBOLS) {
      const p = startPrice(symbol);
      expect(p).toBeGreaterThanOrEqual(20);
      expect(p).toBeLessThanOrEqual(200);
      expect(simSession(symbol, '2026-03-01')[0]!.o).toBe(p);
    }
  });
  it('tickers are exactly the three fictional ones, with pixel-font-safe names', () => {
    expect(SYMBOLS.map((s) => s.symbol)).toEqual(['OSHA', 'ROTM', 'PKMN']);
    for (const s of SYMBOLS) expect(s.name).toMatch(/^[A-Za-z0-9 .%+\-/:]+$/);
  });
  it('follows an intraday U-shape: open and close are more volatile than midday', () => {
    const mean = (s: ReturnType<typeof simSession>, a: number, b: number) => {
      let sum = 0;
      for (let i = a; i < b; i++) sum += Math.abs(Math.log(s[i]!.c / s[i]!.o));
      return sum / (b - a);
    };
    let open = 0;
    let mid = 0;
    let close = 0;
    const n = 150;
    for (let d = 0; d < n; d++) {
      const s = simSession('OSHA', `2026-04-${d}`);
      open += mean(s, 0, 30);
      mid += mean(s, 120, 270);
      close += mean(s, 360, 390);
    }
    expect(open / n).toBeGreaterThan(mid / n * 1.3);
    expect(close / n).toBeGreaterThan(mid / n * 1.1);
  });
});

describe('sim helpers', () => {
  const s = simSession('PKMN', '2026-01-05');
  it('change % and formatting', () => {
    expect(changePct(s, 389)).toBeCloseTo(((s[389]!.c - s[0]!.o) / s[0]!.o) * 100, 10);
    expect(fmtPct(1.24)).toBe('+1.2%');
    expect(fmtPct(-0.449)).toBe('-0.4%');
    expect(fmtPct(0)).toBe('0.0%');
  });
  it('clock label', () => {
    expect(clockLabel(0)).toBe('09:30');
    expect(clockLabel(30)).toBe('10:00');
    expect(clockLabel(389)).toBe('15:59');
    expect(clockLabel(390)).toBe('16:00');
  });
  it('sparkline grows with the session and aggregate keeps the extremes', () => {
    expect(sparkline(s, 389, 40)).toHaveLength(40);
    expect(sparkline(s, 100, 40)).toHaveLength(40); // the session so far fills the width
    expect(sparkline(s, 9, 40)).toHaveLength(10);
    const sp = sparkline(s, 100, 40);
    expect(sp[39]!.hi).toBeGreaterThanOrEqual(s[100]!.c);
    const r = rangeSoFar(s, 100);
    expect(r.hi).toBe(Math.max(...s.slice(0, 101).map((c) => c.h)));
    expect(r.lo).toBe(Math.min(...s.slice(0, 101).map((c) => c.l)));
    const a = aggregate(s, 389, 10);
    expect(a).toHaveLength(39);
    expect(a[0]!.o).toBe(s[0]!.o);
    expect(a[38]!.c).toBe(s[389]!.c);
    expect(Math.max(...a.map((c) => c.h))).toBe(Math.max(...s.map((c) => c.h)));
  });
  it('date: debug is fixed, else local day', () => {
    expect(sessionDate('?debug')).toBe('2026-01-05');
    expect(sessionDate('', new Date(2026, 8, 3))).toBe('2026-09-03');
  });
});
