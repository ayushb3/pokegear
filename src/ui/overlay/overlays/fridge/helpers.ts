import type { FridgeEntry, FridgeSection } from './types';

/** The filters, in ◀ ▶ order. `key: null` = every section. */
export const FILTERS: { key: FridgeSection | null; label: string; short: string }[] = [
  { key: null,         label: 'ALL NOTES',    short: 'All' },
  { key: 'cooking',    label: 'COOKING',      short: 'Cooking' },
  { key: 'hallOfFame', label: 'HALL OF FAME', short: 'Hall of Fame' },
  { key: 'wantToTry',  label: 'WANT TO TRY',  short: 'Want to try' },
];
export const TAB_COUNT = FILTERS.length;

/** Section titles (the open entry's title bar, the plain page headings). */
export const SECTION_LABEL: Record<FridgeSection, string> = {
  cooking: 'COOKING',
  hallOfFame: 'HALL OF FAME',
  wantToTry: 'WANT TO TRY',
};
/** Sticky-note colour per section. */
export const SECTION_NOTE: Record<FridgeSection, 'yellow' | 'pink' | 'blue'> = {
  cooking: 'yellow',
  hallOfFame: 'pink',
  wantToTry: 'blue',
};

/** Wrap a raw filter index into [0, TAB_COUNT). Works for any integer step. */
export const wrapTab = (next: number): number => ((next % TAB_COUNT) + TAB_COUNT) % TAB_COUNT;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (iso: string | null) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return m ? { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) } : null;
};

/** "2026-08-21" -> "Aug 21"; null -> "" */
export function shortDate(iso: string | null): string {
  const p = parts(iso);
  return p ? `${MONTHS[p.mo - 1]} ${p.d}` : '';
}
/** "2026-08-21" -> "Aug 21, 2026"; null -> "" */
export function longDate(iso: string | null): string {
  const p = parts(iso);
  return p ? `${MONTHS[p.mo - 1]} ${p.d}, ${p.y}` : '';
}
/** "2026-08-21" -> "AUG 2026"; null -> "UNDATED" */
export function monthLabel(iso: string | null): string {
  const p = parts(iso);
  return p ? `${MONTHS[p.mo - 1]!.toUpperCase()} ${p.y}` : 'UNDATED';
}

/** Real entries newest first (undated last), then sample entries; ties keep file order. */
export function sortEntries(entries: FridgeEntry[]): FridgeEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (!!a.e.sample !== !!b.e.sample) return a.e.sample ? 1 : -1;
      if (a.e.date !== b.e.date) {
        if (!a.e.date) return 1;
        if (!b.e.date) return -1;
        return a.e.date < b.e.date ? 1 : -1;
      }
      return a.i - b.i;
    })
    .map((x) => x.e);
}

/** Entries visible under a filter, in display order. */
export function filterEntries(entries: FridgeEntry[], key: FridgeSection | null): FridgeEntry[] {
  return sortEntries(key ? entries.filter((e) => e.section === key) : entries);
}

export type ListRow = { kind: 'head'; label: string } | { kind: 'entry'; entry: FridgeEntry; index: number };

/** Flat list rows: a month header before each month group (placeholder entries sit last under SAMPLES); entries numbered by their selectable index. */
export function buildRows(sorted: FridgeEntry[]): ListRow[] {
  const rows: ListRow[] = [];
  let last: string | undefined;
  sorted.forEach((entry, index) => {
    const label = entry.sample ? 'SAMPLES' : monthLabel(entry.date);
    if (label !== last) rows.push({ kind: 'head', label });
    last = label;
    rows.push({ kind: 'entry', entry, index });
  });
  return rows;
}

/**
 * The open entry's bottom text (TextPages blocks): the place on its own line, the date on its own line, then the
 * note. No title: the polaroid caption on the top screen shows it.
 */
export function openBlocks(e: FridgeEntry): { text: string; muted?: boolean }[] {
  return [
    ...(e.place ? [{ text: e.place }] : []),
    ...(e.date ? [{ text: longDate(e.date), muted: true }] : []),
    ...(e.note ? [{ text: e.note }] : []),
  ];
}

/** What a screen reader hears when an entry opens: the title once, then what the bottom screen shows. */
export function openAnnouncement(e: FridgeEntry, index: number, count: number): string {
  return [e.title, `${SECTION_LABEL[e.section]}, ${index + 1} of ${count}`, e.place, longDate(e.date), e.note].filter(Boolean).join('. ');
}
