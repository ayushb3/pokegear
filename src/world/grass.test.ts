import { describe, expect, it } from 'vitest';
import assets from '../assets/assets.json';
import { GrassFx, rustleFrame, tipsTiles } from './grass';
import { ROOMS, TILE, createRoomGrid } from './grid';
import { Game } from './actors';

const yardGrass = (x: number, y: number) => (x <= 4 || x >= 9) && y >= 4 && y <= 9;

describe('rustle timing', () => {
  it('frames 1..3 at 100 ms each, then rest', () => {
    expect([0, 99, 100, 199, 200, 299, 300, 1000].map((t) => rustleFrame(t, 3, 100))).toEqual([1, 1, 2, 2, 3, 3, 0, 0]);
    expect(rustleFrame(-1, 3, 100)).toBe(0);
  });
  it('the slot declares a 3-frame, ~300 ms rustle', () => {
    const f = (assets['decor.grass'] as unknown as { field: { rustle: { frames: number; frameMs: number } } }).field.rustle;
    expect(f.frames * f.frameMs).toBeGreaterThanOrEqual(250);
    expect(f.frames * f.frameMs).toBeLessThanOrEqual(350);
  });
});

describe('which tiles rustle', () => {
  it('only a step INTO a grass tile starts one; it ends after its frames', () => {
    const fx = new GrassFx(3, 100);
    fx.update(16, 'yard', [{ x: 5, y: 5 }], yardGrass, false); // first sight: nothing
    expect(fx.rustles.size).toBe(0);
    fx.update(16, 'yard', [{ x: 4, y: 5 }], yardGrass, false); // lawn -> grass
    expect([...fx.rustles.keys()]).toEqual(['4,5']);
    expect(fx.frameAt(4, 5)).toBe(1);
    fx.update(16, 'yard', [{ x: 4, y: 5 }], yardGrass, false); // standing still: no new rustle
    fx.update(150, 'yard', [{ x: 4, y: 5 }], yardGrass, false);
    expect(fx.frameAt(4, 5)).toBe(2);
    fx.update(200, 'yard', [{ x: 4, y: 5 }], yardGrass, false);
    expect(fx.rustles.size).toBe(0);
    expect(fx.frameAt(4, 5)).toBe(0);
    fx.update(16, 'yard', [{ x: 5, y: 5 }], yardGrass, false); // grass -> lawn: nothing
    expect(fx.rustles.size).toBe(0);
  });
  it('the player and the follower each rustle the tile they enter', () => {
    const fx = new GrassFx(3, 100);
    fx.update(16, 'yard', [{ x: 4, y: 5 }, { x: 5, y: 5 }], yardGrass, false);
    fx.update(16, 'yard', [{ x: 3, y: 5 }, { x: 4, y: 5 }], yardGrass, false);
    expect([...fx.rustles.keys()].sort()).toEqual(['3,5', '4,5']);
  });
  it('a room change never rustles and clears the old room', () => {
    const fx = new GrassFx(3, 100);
    fx.update(16, 'yard', [{ x: 5, y: 5 }], yardGrass, false);
    fx.update(16, 'yard', [{ x: 4, y: 5 }], yardGrass, false);
    expect(fx.rustles.size).toBe(1);
    fx.update(16, 'downstairs', [{ x: 4, y: 5 }], () => true, false);
    expect(fx.rustles.size).toBe(0);
  });
  it('reduced motion: nothing rustles', () => {
    const fx = new GrassFx(3, 100);
    fx.update(16, 'yard', [{ x: 5, y: 5 }], yardGrass, true);
    fx.update(16, 'yard', [{ x: 4, y: 5 }], yardGrass, true);
    expect(fx.rustles.size).toBe(0);
  });
  it('driven by a real Game: the rustle starts as the step BEGINS (settled = the tile being entered)', () => {
    const grids = new Map(Object.values(ROOMS).map((r) => [r.id, createRoomGrid(r)]));
    const game = new Game(grids.get('yard')!, { x: 5, y: 5, facing: 'down' }, () => {}, { grids, room: 'yard', rng: () => 1 });
    const fx = new GrassFx(3, 100);
    const tick = (dt: number) => {
      game.update(dt);
      fx.update(dt, game.room, [game.player.settled, game.follower.settled], (x, y) => grids.get('yard')!.encounterAt(x, y), false);
    };
    tick(16);
    expect(game.walkTo(4, 5)).toBe(true);
    tick(16);
    expect(game.player.moving).toBe(true);
    expect(fx.frameAt(4, 5)).toBe(1);
  });
});

describe('tips (legs hidden in the grass)', () => {
  it('standing: the one tile; walking sideways: both tiles; walking vertically: the lower tile', () => {
    expect(tipsTiles({ x: 3, y: 5 })).toEqual([{ x: 3, y: 5 }]);
    expect(tipsTiles({ x: 3.5, y: 5 })).toEqual([{ x: 3, y: 5 }, { x: 4, y: 5 }]);
    expect(tipsTiles({ x: 3, y: 5.25 })).toEqual([{ x: 3, y: 6 }]); // going down: the tile being entered
    expect(tipsTiles({ x: 3, y: 4.75 })).toEqual([{ x: 3, y: 5 }]); // going up: still the tile being left
  });
  it('the tips sort above an actor on their tile and below one on the tile beneath', () => {
    const tipsZ = (y: number) => (y + 1) * TILE + 0.02; // grassView.ts
    const actorZ = (y: number) => y * TILE + TILE; // render.ts place()
    expect(tipsZ(5)).toBeGreaterThan(actorZ(5) + 0.01); // the player's +0.01 tie-break included
    expect(tipsZ(5)).toBeLessThan(actorZ(6));
  });
});
