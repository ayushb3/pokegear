import { describe, expect, it } from 'vitest';
import { DECOR_REACTIONS, dropOverride, rollDrop, type DropTable } from './reactions';

const table: DropTable = {
  chance: 0.25,
  lead: ['lead'],
  emote: { actor: 'follower', slot: 'emote.exclaim', ms: 100 },
  items: [
    { slot: 'item.a', lines: ['a'] },
    { slot: 'item.b', lines: ['b'], weight: 2 },
    { slot: 'item.c', lines: ['c'], weight: 1 },
  ],
};
/** a rnd() that returns the given values in order */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++] ?? 0.999;
};

describe('rollDrop (randomness injected)', () => {
  it('no drop when the first roll is at or above the chance', () => {
    expect(rollDrop(table, seq(0.25))).toBeNull();
    expect(rollDrop(table, seq(0.9, 0.1))).toBeNull();
  });
  it('drops when the first roll is below the chance, the second roll picks by weight (a=1, b=2, c=1)', () => {
    expect(rollDrop(table, seq(0.24, 0))?.slot).toBe('item.a');
    expect(rollDrop(table, seq(0.0, 0.24))?.slot).toBe('item.a');
    expect(rollDrop(table, seq(0.0, 0.25))?.slot).toBe('item.b');
    expect(rollDrop(table, seq(0.0, 0.7))?.slot).toBe('item.b');
    expect(rollDrop(table, seq(0.0, 0.75))?.slot).toBe('item.c');
    expect(rollDrop(table, seq(0.0, 0.9999))?.slot).toBe('item.c');
  });
  it('a missing or empty table never drops, and does not consume randomness', () => {
    const rnd = () => {
      throw new Error('rnd must not be called');
    };
    expect(rollDrop(undefined, rnd)).toBeNull();
    expect(rollDrop({ ...table, items: [] }, rnd)).toBeNull();
  });
  it('the override: none = never, an id = always that item, an unknown id = normal rolling', () => {
    expect(rollDrop(table, seq(0), 'none')).toBeNull();
    expect(rollDrop(table, seq(0.99), 'b')?.slot).toBe('item.b');
    expect(rollDrop(table, seq(0.99), 'zzz')).toBeNull();
    expect(rollDrop(table, seq(0, 0), 'zzz')?.slot).toBe('item.a');
  });
  it('over many seeded rolls the rate is about the declared chance', () => {
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    let hits = 0;
    for (let i = 0; i < 3000; i++) if (rollDrop(table, rnd)) hits++;
    expect(hits / 3000).toBeGreaterThan(0.2);
    expect(hits / 3000).toBeLessThan(0.3);
  });
  it('the plant table is about one in three', () => {
    expect(DECOR_REACTIONS.plant?.drop?.chance).toBeCloseTo(1 / 3, 5);
  });
});

describe('dropOverride (?drop= only under ?debug)', () => {
  it('reads the value with ?debug', () => {
    expect(dropOverride('?debug&drop=medal')).toBe('medal');
    expect(dropOverride('?drop=none&debug')).toBe('none');
  });
  it('ignores it without ?debug, and when absent', () => {
    expect(dropOverride('?drop=medal')).toBeNull();
    expect(dropOverride('?debug')).toBeNull();
    expect(dropOverride('')).toBeNull();
  });
});
