import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Bag / dock icons must be crisp: 16x16 with strictly binary alpha (pixel review #3).
// A tiny PNG decoder (8-bit RGBA, non-interlaced: what scripts/make-icons.py writes) keeps this dependency-free.
const IDS = ['bed', 'pc', 'piano', 'journal', 'monitor', 'townmap', 'gym', 'radio', 'card', 'fridge', 'tv', 'corkboard', 'mom'];

function decode(file: string) {
  const buf = readFileSync(new URL(`../../public/assets/icons/${file}.png`, import.meta.url));
  expect(buf.subarray(1, 4).toString(), file).toBe('PNG');
  let w = 0;
  let h = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const kind = buf.subarray(o + 4, o + 8).toString();
    const data = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8] ?? 0;
      type = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (kind === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  return { w, h, depth, type, interlace, raw: inflateSync(Buffer.concat(idat)) };
}

function alphaOf({ w, h, raw }: ReturnType<typeof decode>): number[] {
  const bpp = 4;
  const stride = w * bpp;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)] ?? 0;
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    const prev = (y ? rows[y - 1] : undefined) ?? Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? (line[i - bpp] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= bpp ? (prev[i - bpp] ?? 0) : 0;
      let add = 0;
      if (f === 1) add = a;
      else if (f === 2) add = b;
      else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = ((line[i] ?? 0) + add) & 255;
    }
    rows.push(line);
  }
  const out: number[] = [];
  for (const r of rows) for (let x = 0; x < w; x++) out.push(r[x * bpp + 3] ?? -1);
  return out;
}

describe('bag icons', () => {
  for (const id of IDS) {
    it(`${id}.png is 16x16 RGBA with only fully opaque or fully transparent pixels`, () => {
      const png = decode(id);
      expect([png.w, png.h]).toEqual([16, 16]);
      expect([png.depth, png.type, png.interlace]).toEqual([8, 6, 0]);
      const alpha = alphaOf(png);
      expect(alpha.every((a) => a === 0 || a === 255)).toBe(true);
      expect(alpha.some((a) => a === 255)).toBe(true);
    });
  }
});
