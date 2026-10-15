import { describe, expect, it } from 'vitest';
import sample from './sample-october.json';
import { FLAT_R, dayKind, fmtR, monthGrid, summarize, weekdayCells, type LogDay, type TradingLog } from './summary';

const log = sample as TradingLog;

describe('trading summary', () => {
  it('is flagged as sample data with known rules only', () => {
    expect(log.sample).toBe(true);
    for (const d of log.days) for (const k of d.broken) expect(Object.keys(log.rules)).toContain(k);
  });
  it('classifies days', () => {
    expect(dayKind(undefined)).toBe('empty');
    expect(dayKind({ date: 'x', r: null, broken: [] })).toBe('none');
    expect(dayKind({ date: 'x', r: 0, broken: [] })).toBe('flat');
    expect(dayKind({ date: 'x', r: 0.02, broken: [] })).toBe('flat');
    expect(dayKind({ date: 'x', r: 1, broken: [] })).toBe('green');
    expect(dayKind({ date: 'x', r: -1, broken: [] })).toBe('red');
  });
  it('sums R, counts adherence, and ignores no-trade days', () => {
    const days: LogDay[] = [
      { date: 'a', r: 1.5, broken: [] },
      { date: 'b', r: -2.0, broken: ['loss-limit'] },
      { date: 'c', r: null, broken: [] },
      { date: 'd', r: 0, broken: [] },
      { date: 'e', r: 0.3, broken: ['profit-cap', 'closed-by-8'] },
    ];
    const result = summarize(days);
    expect(result.totalR).toBe(-0.2);
    expect(result.traded).toBe(4);
    expect(result.noTrade).toBe(1);
    expect(result.green).toBe(2);
    expect(result.red).toBe(1);
    expect(result.flat).toBe(1);
    expect(result.withinRules).toBe(2);
    expect(result.broken).toBe(2);
    expect(result.greenTrades).toBe(0);
    expect(result.redTrades).toBe(0);
    expect(result.avgTradeMinutes).toBe(null);
  });
  it('counts greenTrades and redTrades from individual trades', () => {
    const days: LogDay[] = [
      {
        date: 'a',
        r: 1.0,
        broken: [],
        trades: [
          { r: 1.5, minutes: 20 },
          { r: -0.5, minutes: 10 },
          { r: 0.03, minutes: 5 }, // flat (< FLAT_R)
        ],
      },
      {
        date: 'b',
        r: -0.8,
        broken: [],
        trades: [
          { r: -0.8, minutes: 30 },
        ],
      },
    ];
    const result = summarize(days);
    expect(result.greenTrades).toBe(1);
    expect(result.redTrades).toBe(2);
    expect(result.avgTradeMinutes).toBe(Math.round((20 + 10 + 5 + 30) / 4));
  });
  it('returns avgTradeMinutes: null when no day has trades', () => {
    const days: LogDay[] = [
      { date: 'a', r: 1.0, broken: [] },
      { date: 'b', r: null, broken: [] },
    ];
    expect(summarize(days).avgTradeMinutes).toBe(null);
  });
  it('avgTradeMinutes rounds to integer', () => {
    const days: LogDay[] = [
      {
        date: 'a',
        r: 1.0,
        broken: [],
        trades: [
          { r: 0.5, minutes: 10 },
          { r: 0.5, minutes: 11 },
        ],
      },
    ];
    const result = summarize(days);
    expect(result.avgTradeMinutes).toBe(11); // Math.round((10+11)/2) = 11
    expect(Number.isInteger(result.avgTradeMinutes)).toBe(true);
  });
  it('avoids float noise in the total', () => {
    const days: LogDay[] = [0.1, 0.2, 0.3].map((r, i) => ({ date: String(i), r, broken: [] }));
    expect(summarize(days).totalR).toBe(0.6);
  });
  it('summarises the sample month and mixes every kind', () => {
    const s = summarize(log.days);
    expect(s.traded + s.noTrade).toBe(log.days.length);
    expect(s.green && s.red && s.flat && s.noTrade && s.broken).toBeTruthy();
    expect(s.withinRules + s.broken).toBe(s.traded);
  });
  it('sample month has greenTrades, redTrades and a non-null avgTradeMinutes', () => {
    const s = summarize(log.days);
    expect(s.greenTrades).toBeGreaterThan(0);
    expect(s.redTrades).toBeGreaterThan(0);
    expect(s.avgTradeMinutes).not.toBeNull();
    expect(Number.isInteger(s.avgTradeMinutes)).toBe(true);
  });
  it('formats R', () => {
    expect(fmtR(1.44)).toBe('+1.4R');
    expect(fmtR(-0.8)).toBe('-0.8R');
    expect(fmtR(0)).toBe('0.0R');
    expect(fmtR(-0.04)).toBe('0.0R');
  });
  it('lays out October 2026 (starts Thursday, 5 weeks)', () => {
    const weeks = monthGrid('2026-10', log.days);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]!.slice(0, 4).every((c) => c.day === null)).toBe(true);
    expect(weeks[0]![4]!.day).toBe(1);
    expect(weeks.flat().filter((c) => c.day !== null)).toHaveLength(31);
    expect(weeks[0]![4]!.kind).toBe('green'); // Oct 1
    expect(weeks[0]![5]!.kind).toBe('red'); // Oct 2
    expect(weeks[0]![6]!.kind).toBe('empty'); // Sat
  });
  it('weekdayCells returns only Mon-Fri cells in order', () => {
    const cells = weekdayCells('2026-10', log.days);
    // October 2026: 22 weekdays (Mon-Fri)
    expect(cells).toHaveLength(22);
    // First weekday cell is Oct 1 (Thursday)
    expect(cells[0]!.day).toBe(1);
    // No Sat/Sun: day 3 (Sat) and day 4 (Sun) should not appear
    const days = cells.map((c) => c.day);
    expect(days).not.toContain(3); // Sat
    expect(days).not.toContain(4); // Sun
    expect(days).not.toContain(10); // Sat
    expect(days).not.toContain(11); // Sun
  });
  it('FLAT_R boundary is 0.05', () => {
    expect(FLAT_R).toBe(0.05);
  });
});
