import { describe, expect, it } from 'vitest';
import { ROOMS, TILE, WALL_ROWS } from './grid';
import { STEP, blockedTiles, lightPatchRects } from './light';

describe('light patches: hard-edged, clipped to floor', () => {
  for (const room of Object.values(ROOMS)) {
    for (const light of room.lights) {
      const rects = lightPatchRects(light, room);
      const blocked = blockedTiles(room);
      it(`${room.id} ${light.ref}: has pixels, integer px, two flat tones at most`, () => {
        expect(rects.length).toBeGreaterThan(0);
        for (const r of rects) {
          for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(v)).toBe(true);
          expect(r.h).toBe(STEP);
          expect(r.y % STEP).toBe(0);
        }
        expect(new Set(rects.map((r) => r.tone)).size).toBeLessThanOrEqual(2);
      });
      it(`${room.id} ${light.ref}: never over wall rows, solid footprints or stairs`, () => {
        for (const r of rects) {
          expect(Math.floor(r.y / TILE)).toBeGreaterThanOrEqual(WALL_ROWS);
          for (let x = r.x; x < r.x + r.w; x++) expect(blocked.has(`${Math.floor(x / TILE)},${Math.floor(r.y / TILE)}`)).toBe(false);
        }
      });
    }
  }

  it('a blocked tile is cut out of the patch (and the rest stays)', () => {
    const room = ROOMS.downstairs;
    const light = room.lights[0]!;
    const open = { ...room, furniture: [], decor: [], warps: [] };
    const full = lightPatchRects(light, open);
    const area = (rs: typeof full) => rs.reduce((n, r) => n + r.w * r.h, 0);
    const tx = Math.floor(light.cx);
    const ty = Math.floor(light.cy);
    const cut = lightPatchRects(light, { ...open, decor: [{ label: 'x', slot: 'decor.rug', x: tx, y: ty, w: 1, h: 1, solid: true }] });
    expect(area(cut)).toBeLessThan(area(full));
    expect(cut.length).toBeGreaterThan(0);
  });
});

describe('light pools and warps', () => {
  it('stairs tiles block light, a door-mat warp does not', () => {
    const b = blockedTiles(ROOMS.bedroom);
    const stairs = ROOMS.bedroom.warps[0]!;
    expect(b.has(`${stairs.x},${stairs.y}`)).toBe(true);
    const mat = ROOMS.yard.warps[0]!;
    expect(blockedTiles(ROOMS.yard).has(`${mat.x},${mat.y}`)).toBe(false);
  });
});
