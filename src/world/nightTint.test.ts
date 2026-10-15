import { describe, expect, it } from 'vitest';
import { NIGHT_ALPHA } from './fx';
import { ROOMS } from './grid';
import { NIGHT_OVERLAY, applyMatrix, nightMatrix, overlayOver } from './nightTint';

const SAMPLES = [0xffffff, 0x000000, 0x8a5a3a, 0x4ab663, 0xd6c9a4, 0xc9a87c, 0x3050a0, 0xf0d8b0];

describe('night tint for the sprite layer and fg', () => {
  it('is the identity by day', () => {
    for (const c of SAMPLES) expect(applyMatrix(nightMatrix(0), c)).toBe(c);
  });

  it('matches the room overlay exactly, for every colour and every room alpha (no seam at the footprint line)', () => {
    const alphas = [NIGHT_ALPHA, ...Object.values(ROOMS).map((r) => r.nightAlpha ?? NIGHT_ALPHA)];
    for (const a of alphas)
      for (const c of SAMPLES) {
        const got = applyMatrix(nightMatrix(a), c);
        const want = overlayOver(c, a);
        for (const shift of [16, 8, 0]) expect(Math.abs(((got >> shift) & 0xff) - ((want >> shift) & 0xff))).toBeLessThanOrEqual(1);
      }
  });

  it('darkens: at night white comes out at the multiply colour the pixel review measured (~0x6f7486)', () => {
    const w = applyMatrix(nightMatrix(NIGHT_ALPHA), 0xffffff);
    expect(Math.abs(((w >> 16) & 0xff) - 0x6f)).toBeLessThanOrEqual(1);
    expect(Math.abs(((w >> 8) & 0xff) - 0x74)).toBeLessThanOrEqual(1);
    expect(Math.abs((w & 0xff) - 0x86)).toBeLessThanOrEqual(1);
  });

  it('a darker room alpha darkens more; alpha stays untouched; black lifts to the overlay colour', () => {
    const lum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    expect(lum(applyMatrix(nightMatrix(0.72), 0xd6c9a4))).toBeLessThan(lum(applyMatrix(nightMatrix(0.58), 0xd6c9a4)));
    const m = nightMatrix(0.58);
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect(applyMatrix(nightMatrix(1), 0x000000)).toBe(NIGHT_OVERLAY);
  });
});
