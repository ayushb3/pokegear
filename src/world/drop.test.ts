import { describe, expect, it } from 'vitest';
import { DROP_ARC_MS, DROP_TOTAL_MS, dropLanding, dropPos } from './drop';

const from = { x: 100, y: 80 };
const to = { x: 112, y: 96 };

describe('dropPos', () => {
  it('starts at the piece, lands on the target and stays there', () => {
    expect(dropPos(0, from, to)).toEqual(from);
    expect(dropPos(DROP_ARC_MS, from, to)).toEqual(to);
    expect(dropPos(DROP_TOTAL_MS, from, to)).toEqual(to);
    expect(dropPos(DROP_TOTAL_MS + 5000, from, to)).toEqual(to);
  });
  it('rises above the start before it falls, and only ever uses whole pixels', () => {
    const ys = Array.from({ length: 50 }, (_, i) => dropPos((i / 49) * DROP_TOTAL_MS, from, to));
    expect(Math.min(...ys.map((p) => p.y))).toBeLessThan(from.y - 10);
    for (const p of ys) expect([Number.isInteger(p.x), Number.isInteger(p.y)]).toEqual([true, true]);
  });
});

describe('dropLanding', () => {
  it('rests centred just above the art, whole pixels', () => {
    expect(dropLanding({ x: 208, y: 62, w: 16, h: 34 })).toEqual({ x: 216, y: 61 });
  });
});
