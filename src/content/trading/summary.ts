/** Pure helpers for the trading log: month grid + summary math. R-multiples and rule adherence only, no dollars. */
export interface Trade {
  /** R-multiple for this single trade */
  r: number;
  /** How long the trade was held, in minutes */
  minutes: number;
}

export interface LogDay {
  date: string; // YYYY-MM-DD
  /** R-multiple for the day; null = a trading day with no trade taken */
  r: number | null;
  /** rule keys broken that day (empty = within rules) */
  broken: string[];
  /** individual trades taken that day (only present for days with r !== null) */
  trades?: Trade[];
}
export interface TradingLog {
  sample: boolean;
  month: string; // YYYY-MM
  rules: Record<string, { name: string; short: string }>;
  days: LogDay[];
}
export type DayKind = 'green' | 'red' | 'flat' | 'none' | 'empty';

/** |r| below this reads as flat */
export const FLAT_R = 0.05;

export function dayKind(day: LogDay | undefined): DayKind {
  if (!day) return 'empty';
  if (day.r === null) return 'none';
  if (Math.abs(day.r) < FLAT_R) return 'flat';
  return day.r > 0 ? 'green' : 'red';
}

export const round1 = (n: number) => Math.round(n * 10 + (n < 0 ? -1e-9 : 1e-9)) / 10;

/** "+1.4R", "-0.8R", "0.0R" (ASCII minus: the pixel font may not have a typographic one) */
export function fmtR(r: number): string {
  const v = round1(r);
  if (v === 0) return '0.0R';
  return `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}R`;
}

export interface Summary {
  totalR: number;
  traded: number;
  noTrade: number;
  green: number;
  red: number;
  flat: number;
  /** traded days with no rule broken */
  withinRules: number;
  /** traded days with at least one rule broken */
  broken: number;
  /** number of individual trades with r > FLAT_R */
  greenTrades: number;
  /** number of individual trades with r < -FLAT_R */
  redTrades: number;
  /** mean of all trade minutes across all days, rounded to integer; null when no day has trades */
  avgTradeMinutes: number | null;
}

export function summarize(days: LogDay[]): Summary {
  const s: Summary = {
    totalR: 0,
    traded: 0,
    noTrade: 0,
    green: 0,
    red: 0,
    flat: 0,
    withinRules: 0,
    broken: 0,
    greenTrades: 0,
    redTrades: 0,
    avgTradeMinutes: null,
  };
  let total = 0;
  let totalMinutes = 0;
  let tradeCount = 0;
  for (const d of days) {
    if (d.r === null) {
      s.noTrade++;
      continue;
    }
    s.traded++;
    total += d.r;
    const k = dayKind(d);
    if (k === 'green') s.green++;
    else if (k === 'red') s.red++;
    else s.flat++;
    if (d.broken.length) s.broken++;
    else s.withinRules++;
    if (d.trades) {
      for (const t of d.trades) {
        tradeCount++;
        totalMinutes += t.minutes;
        if (t.r > FLAT_R) s.greenTrades++;
        else if (t.r < -FLAT_R) s.redTrades++;
      }
    }
  }
  s.totalR = round1(total);
  s.avgTradeMinutes = tradeCount > 0 ? Math.round(totalMinutes / tradeCount) : null;
  return s;
}

export interface Cell {
  /** 1-based day of month, or null for padding cells */
  day: number | null;
  date: string | null;
  entry: LogDay | undefined;
  kind: DayKind;
}

/** Sunday-first weeks for a YYYY-MM month. */
export function monthGrid(month: string, days: LogDay[]): Cell[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: Cell[] = [];
  for (let i = 0; i < first; i++) cells.push({ day: null, date: null, entry: undefined, kind: 'empty' });
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const entry = byDate.get(date);
    cells.push({ day: d, date, entry, kind: dayKind(entry) });
  }
  while (cells.length % 7) cells.push({ day: null, date: null, entry: undefined, kind: 'empty' });
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Returns only the weekday (Mon-Fri) cells in calendar order.
 * Skips Sat (index 6) and Sun (index 0) from the Sunday-first grid.
 */
export function weekdayCells(month: string, days: LogDay[]): Cell[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const grid = monthGrid(month, days);
  return grid.flat().filter((c) => {
    if (c.day === null) return false;
    const wd = new Date(Date.UTC(y, m - 1, c.day)).getUTCDay(); // 0=Sun, 6=Sat
    return wd >= 1 && wd <= 5;
  });
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
