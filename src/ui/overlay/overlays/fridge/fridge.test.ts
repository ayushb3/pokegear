import { describe, expect, it } from 'vitest';
import data from '../../../../content/fridge.json';
import assets from '../../../../assets/assets.json';
import type { FridgeData, FridgeEntry, FridgeSection } from './types';
import { FILTERS, TAB_COUNT, buildRows, filterEntries, longDate, monthLabel, openAnnouncement, openBlocks, shortDate, sortEntries, wrapTab } from './helpers';

const FRIDGE = data as unknown as FridgeData;
const SECTIONS: FridgeSection[] = ['cooking', 'hallOfFame', 'wantToTry'];
const e = (date: string | null, title = 't', section: FridgeSection = 'cooking'): FridgeEntry => ({ date, section, title });

describe('fridge.json shape', () => {
  it('has entries (array) and no top-level sample flag', () => {
    expect(Array.isArray(FRIDGE.entries)).toBe(true);
    expect('sample' in (data as object)).toBe(false);
  });

  it('every entry has a title, a valid section, and a date that is YYYY-MM-DD or null', () => {
    for (const x of FRIDGE.entries) {
      expect(x.title.trim(), 'title').not.toBe('');
      expect(SECTIONS, `section of ${x.title}`).toContain(x.section);
      if (x.date !== null) {
        expect(x.date, `date of ${x.title}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(isNaN(new Date(`${x.date}T00:00:00`).getTime()), x.date).toBe(false);
      }
      if (x.note !== undefined) expect(x.note.trim(), `note of ${x.title}`).not.toBe('');
    }
  });

  it('every photo slot exists in assets.json, is a fridge.photo.* slot with a path', () => {
    for (const x of FRIDGE.entries) {
      if (!x.photo) continue;
      expect(x.photo).toMatch(/^fridge\.photo\.\d+$/);
      const slot = assets[x.photo as keyof typeof assets] as { path?: string } | undefined;
      expect(slot, `slot ${x.photo}`).toBeDefined();
      expect(slot?.path, `path of ${x.photo}`).toMatch(/^\/assets\/fridge\/\d+\.jpg$/);
    }
  });

  it('no photo slot is used twice', () => {
    const slots = FRIDGE.entries.map((x) => x.photo).filter(Boolean);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('want-to-try entries carry no photo', () => {
    for (const x of FRIDGE.entries.filter((y) => y.section === 'wantToTry')) expect(x.photo).toBeUndefined();
  });

  // noteDraft marks an AI-generated placeholder note (a description of the dish, nothing about Ayush).
  // Ayush replaces each one with his own words and deletes the flag; there is no visible label on the site.
  it('noteDraft entries have a non-empty note of at most ~90 chars and are never samples', () => {
    for (const x of FRIDGE.entries.filter((y) => y.noteDraft)) {
      expect(x.note?.trim(), `note of ${x.title}`).toBeTruthy();
      expect(x.note!.length, `note of ${x.title}`).toBeLessThanOrEqual(90);
      expect(x.sample, `sample flag on ${x.title}`).toBeUndefined();
    }
  });

  it('sample entries carry no invented date', () => {
    for (const x of FRIDGE.entries.filter((y) => y.sample)) expect(x.date).toBeNull();
  });

  it('sample entries: every string starts with "Sample:"; non-sample entries never do', () => {
    for (const x of FRIDGE.entries) {
      const strings = [x.title, x.note, x.place].filter((s): s is string => typeof s === 'string');
      for (const s of strings) {
        if (x.sample) expect(s, `"${s}"`).toMatch(/^Sample:/);
        else expect(s, `"${s}"`).not.toMatch(/^Sample:/i);
      }
    }
  });
});

describe('ordering and month headers', () => {
  it('sorts newest first and puts undated last, keeping file order on ties', () => {
    const a = e('2026-08-01', 'a');
    const b = e(null, 'b');
    const c = e('2026-09-01', 'c');
    const d = e('2026-08-01', 'd');
    expect(sortEntries([a, b, c, d]).map((x) => x.title)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('sample entries sort after every real one regardless of date, under their own SAMPLES header', () => {
    const real = e('2020-01-01', 'old');
    const undated = e(null, 'undated');
    const s1: FridgeEntry = { ...e('2030-01-01', 's1'), sample: true };
    const s2: FridgeEntry = { ...e(null, 's2'), sample: true };
    const sorted = sortEntries([s1, undated, s2, real]);
    expect(sorted.map((x) => x.title)).toEqual(['old', 'undated', 's1', 's2']);
    expect(buildRows(sorted).map((r) => (r.kind === 'head' ? r.label : r.entry.title))).toEqual(['JAN 2020', 'old', 'UNDATED', 'undated', 'SAMPLES', 's1', 's2']);
  });

  it('real data: samples are last under SAMPLES; no UNDATED header unless a real entry is undated', () => {
    const heads = buildRows(sortEntries(FRIDGE.entries)).flatMap((r) => (r.kind === 'head' ? [r.label] : []));
    if (!FRIDGE.entries.some((x) => !x.sample && !x.date)) expect(heads).not.toContain('UNDATED');
    expect(heads[heads.length - 1]).toBe('SAMPLES');
  });

  it('adds one header per month, UNDATED last, and numbers only entries', () => {
    const rows = buildRows(sortEntries([e('2026-08-20', 'a'), e('2026-08-01', 'b'), e('2026-07-31', 'c'), e(null, 'd')]));
    expect(rows.map((r) => (r.kind === 'head' ? r.label : (r.entry.title)))).toEqual(['AUG 2026', 'a', 'b', 'JUL 2026', 'c', 'UNDATED', 'd']);
    const idx = rows.flatMap((r) => (r.kind === 'entry' ? [r.index] : []));
    expect(idx).toEqual([0, 1, 2, 3]);
  });

  it('the real data: every filter lists its entries newest first, undated last', () => {
    for (const f of FILTERS) {
      const list = filterEntries(FRIDGE.entries, f.key);
      const dated = list.filter((x) => x.date && !x.sample);
      const firstUndated = list.findIndex((x) => !x.date);
      if (firstUndated >= 0) expect(list.slice(firstUndated).every((x) => !x.date || x.sample)).toBe(true);
      for (let i = 1; i < dated.length; i++) expect(dated[i]!.date! <= dated[i - 1]!.date!).toBe(true);
    }
  });

  it('All lists every entry; the three sections add up to it', () => {
    expect(filterEntries(FRIDGE.entries, null).length).toBe(FRIDGE.entries.length);
    expect(SECTIONS.reduce((n, s) => n + filterEntries(FRIDGE.entries, s).length, 0)).toBe(FRIDGE.entries.length);
  });
});

describe('formatting', () => {
  it('formats dates', () => {
    expect(shortDate('2026-08-21')).toBe('Aug 21');
    expect(longDate('2026-08-21')).toBe('Aug 21, 2026');
    expect(monthLabel('2026-08-21')).toBe('AUG 2026');
    expect(monthLabel(null)).toBe('UNDATED');
    expect(shortDate(null)).toBe('');
  });
  it('openBlocks: place and date on their own lines, then the note; never the title', () => {
    expect(openBlocks({ ...e('2026-08-21', 'Title'), place: 'San Mateo' })).toEqual([{ text: 'San Mateo' }, { text: 'Aug 21, 2026', muted: true }]);
    expect(openBlocks(e('2026-08-21'))).toEqual([{ text: 'Aug 21, 2026', muted: true }]);
    expect(openBlocks({ ...e(null), place: 'Summer 2022 trip', note: 'n' })).toEqual([{ text: 'Summer 2022 trip' }, { text: 'n' }]);
    expect(openBlocks(e(null))).toEqual([]);
    for (const x of FRIDGE.entries) expect(openBlocks(x).map((b) => b.text)).not.toContain(x.title);
  });

  it('openAnnouncement says the title once, then section + position, place, date, note', () => {
    expect(openAnnouncement({ ...e('2026-08-21', 'Ramen', 'hallOfFame'), place: 'Tokyo' }, 2, 22)).toBe('Ramen. HALL OF FAME, 3 of 22. Tokyo. Aug 21, 2026');
    expect(openAnnouncement(e(null, 'Pasta'), 0, 1)).toBe('Pasta. COOKING, 1 of 1');
  });
});

describe('wrapTab (filters)', () => {
  it('TAB_COUNT is 4: All + three sections', () => {
    expect(TAB_COUNT).toBe(4);
    expect(FILTERS.map((f) => f.key)).toEqual([null, ...SECTIONS]);
  });
  it('wraps both ways and stays in bounds for any step', () => {
    expect(wrapTab(-1)).toBe(3);
    expect(wrapTab(4)).toBe(0);
    for (let i = -10; i <= 10; i++) {
      expect(wrapTab(i)).toBeGreaterThanOrEqual(0);
      expect(wrapTab(i)).toBeLessThan(TAB_COUNT);
    }
  });
});

describe('fridge overlay CSS pixel-exact rule', () => {
  it('no font-size other than calc(var(--u)*16) or calc(var(--u)*32) in overlay CSS', async () => {
    const src = await import('./index.tsx?raw').then((m) => m.default as string);
    for (const m of src.matchAll(/font-size:\s*calc\(var\(--u\)\s*\*\s*(\d+)\)/g)) {
      expect([16, 32], `font-size *${m[1]}u is not pixel-exact`).toContain(Number(m[1]));
    }
    expect([...src.matchAll(/font-size:\s*(\d+)px/g)].map((m) => m[0])).toEqual([]);
  });
});
