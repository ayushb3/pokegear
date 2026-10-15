import { describe, expect, it } from 'vitest';
import { Game, type WorldEvent } from './actors';
import { createGrid, DIR_VEC, PLAYER_START, type Dir, type Grid, type Pt } from './grid';
import { findPath, findPathToObject } from './path';
import { computeScale, stackScale } from './scale';
import { FURNITURE } from './grid';

const grid = createGrid();

function mk(start: Pt & { facing: Dir } = PLAYER_START) {
  const events: WorldEvent[] = [];
  const game = new Game(grid, start, (e) => events.push(e));
  return { game, events };
}

/** advance in 16ms frames, asserting follower/player invariants on every frame */
function run(game: Game, ms: number, g: Grid = grid) {
  for (let t = 0; t < ms; t += 16) {
    game.update(16);
    const p = game.player;
    const f = game.follower;
    // logical tiles never coincide, destinations never coincide
    expect([p.x, p.y]).not.toEqual([f.x, f.y]);
    expect([p.settled.x, p.settled.y]).not.toEqual([f.settled.x, f.settled.y]);
    expect(g.isWalkable(p.x, p.y)).toBe(true);
    expect(g.isWalkable(f.x, f.y)).toBe(true);
    // follower always adjacent to the player's logical tile
    expect(Math.abs(p.x - f.x) + Math.abs(p.y - f.y)).toBe(1);
  }
}
/** logical tile (a step in flight has not landed yet) */
const tile = (g: Game) => [g.player.x, g.player.y];

describe('BFS', () => {
  it('paths around the bed', () => {
    const path = findPath(grid, { x: 0, y: 3 }, { x: 0, y: 6 })!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 0, y: 6 });
    let prev: Pt = { x: 0, y: 3 };
    for (const p of path) {
      expect(grid.isWalkable(p.x, p.y)).toBe(true);
      expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBe(1);
      prev = p;
    }
    // the bed blocks x 0..1, y 4..5 so the shortest way goes through column 2
    expect(path.some((p) => p.x === 2)).toBe(true);
    expect(path.length).toBe(2 + 3 + 2);
  });
  it('returns [] when already there and null for blocked / out-of-bounds targets', () => {
    expect(findPath(grid, { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([]);
    expect(findPath(grid, { x: 3, y: 3 }, { x: 0, y: 4 })).toBeNull(); // bed
    expect(findPath(grid, { x: 3, y: 3 }, { x: 4, y: 0 })).toBeNull(); // wall
    expect(findPath(grid, { x: 3, y: 3 }, { x: 99, y: 3 })).toBeNull();
  });
  it('finds an adjacent tile and facing for an object', () => {
    const r = findPathToObject(grid, { x: 5, y: 8 }, 'pc')!;
    const end = r.path[r.path.length - 1]!;
    expect(grid.objectAt(end.x + DIR_VEC[r.face].dx, end.y + DIR_VEC[r.face].dy)).toBe('pc');
    expect(grid.isWalkable(end.x, end.y)).toBe(true);
    // already adjacent -> empty path
    expect(findPathToObject(grid, { x: 8, y: 3 }, 'pc')).toEqual({ path: [], face: 'up' });
  });
});

describe('movement feel', () => {
  it('a tap on a non-facing key only turns', () => {
    const { game } = mk();
    game.pressDir('right');
    game.releaseDir('right'); // released before the frame ran
    run(game, 400);
    expect(tile(game)).toEqual([7, 7]);
    expect(game.player.facing).toBe('right');
  });
  it('tap in the facing direction steps one tile; holding walks continuously', () => {
    const { game } = mk();
    game.pressDir('down');
    game.releaseDir('down');
    run(game, 400);
    expect(tile(game)).toEqual([7, 8]);

    const b = mk();
    b.game.pressDir('down');
    b.game.pressDir('right');
    b.game.releaseDir('down');
    // held right: turn 80ms then 250ms per tile, no stall between steps
    run(b.game, 80 + 250 * 4 + 20);
    expect(tile(b.game)).toEqual([11, 7]);
  });
  it('step starts on the first frame after keydown (facing already), progress is interpolated', () => {
    const { game } = mk();
    game.pressDir('down');
    game.update(16);
    expect(game.player.moving).toBe(true);
    expect(game.playerView().y).toBeGreaterThan(7);
    expect(game.playerView().y).toBeLessThan(7.2);
    game.update(125);
    expect(game.playerView().y).toBeCloseTo(7 + 141 / 250, 5);
  });
  it('bumping a wall faces it without moving', () => {
    const { game } = mk({ x: 4, y: 2, facing: 'down' });
    game.pressDir('up');
    run(game, 1000);
    expect(tile(game)).toEqual([4, 2]);
    expect(game.player.facing).toBe('up');
  });
  it('freeze stops input; resume restores it', () => {
    const { game } = mk();
    game.freeze();
    game.pressDir('down');
    run(game, 500);
    expect(tile(game)).toEqual([7, 7]);
    game.resume();
    game.pressDir('down');
    run(game, 300);
    expect(tile(game)).toEqual([7, 8]);
  });
  it('A interacts with the faced object', () => {
    const { game, events } = mk({ x: 8, y: 3, facing: 'up' });
    expect(game.interact()).toBe(true);
    expect(events).toEqual([{ type: 'interact', objectId: 'pc' }]);
    const o = mk({ x: 5, y: 5, facing: 'up' });
    expect(o.game.interact()).toBe(false);
  });
});

describe('follower', () => {
  it('starts behind the player', () => {
    const { game } = mk();
    expect([game.follower.x, game.follower.y]).toEqual([7, 6]);
  });
  it('occupies the tile the player just left, in lock-step', () => {
    const { game } = mk({ x: 7, y: 4, facing: 'down' });
    game.pressDir('down');
    run(game, 700); // 2 steps (+ part of 3rd), then
    game.releaseDir('down');
    run(game, 400);
    const [px, py] = tile(game);
    expect([px, py]).toEqual([7, 7]);
    expect([game.follower.x, game.follower.y]).toEqual([7, 6]);
    expect(game.follower.facing).toBe('down');
    // same interpolation: mid-step both have the same progress
    const g2 = mk().game;
    g2.pressDir('down');
    g2.update(16);
    g2.update(100);
    const dp = g2.playerView().y - 7;
    const df = g2.followerView().y - 6;
    expect(df).toBeCloseTo(dp, 9);
  });
  it('never shares a tile with the player over a scripted sequence incl. reversals', () => {
    const { game } = mk();
    const script: [Dir, number][] = [
      ['down', 600],
      ['left', 700],
      ['up', 500],
      ['down', 300], // reversal: steps back onto the follower
      ['right', 800],
      ['left', 500], // reversal again
      ['up', 1200],
      ['right', 90], // tap-length
      ['down', 40],
      ['left', 1000],
    ];
    for (const [d, ms] of script) {
      game.pressDir(d);
      run(game, ms);
      game.releaseDir(d);
      run(game, 20);
    }
    run(game, 600);
    expect(game.player.moving).toBe(false);
  });
  it('swaps when the player steps back onto it', () => {
    const { game } = mk({ x: 7, y: 7, facing: 'down' });
    game.pressDir('down');
    game.releaseDir('down');
    run(game, 300); // player 7,8  follower 7,7
    expect([game.follower.x, game.follower.y]).toEqual([7, 7]);
    game.pressDir('up'); // turn (80ms) then step back onto the follower
    game.releaseDir('up');
    run(game, 700); // tap only turned
    // explicit short hold to force the step; released mid-step, which still lands
    game.pressDir('up');
    run(game, 100);
    game.releaseDir('up');
    run(game, 400);
    expect(tile(game)).toEqual([7, 7]);
    expect([game.follower.x, game.follower.y]).toEqual([7, 8]);
  });
});

describe('tap to walk', () => {
  it('walks a BFS path and arrives', () => {
    const { game, events } = mk();
    expect(game.walkTo(9, 9)).toBe(true);
    run(game, 250 * 6);
    expect(tile(game)).toEqual([9, 9]);
    expect(events).toEqual([]);
  });
  it('does nothing for unreachable tiles', () => {
    const { game } = mk();
    expect(game.walkTo(3, 0)).toBe(false); // wall
    run(game, 300);
    expect(tile(game)).toEqual([7, 7]);
  });
  it('tapping an object walks adjacent, faces it and auto-interacts', () => {
    const { game, events } = mk();
    expect(game.walkTo(13, 2)).toBe(true); // piano
    run(game, 3000);
    expect(events).toEqual([{ type: 'interact', objectId: 'piano' }]);
    const [x, y] = tile(game);
    const v = DIR_VEC[game.player.facing];
    expect(grid.objectAt(x! + v.dx, y! + v.dy)).toBe('piano');
  });
  it('goTo(bed) works from the other side of the bed', () => {
    const { game, events } = mk({ x: 0, y: 7, facing: 'up' });
    expect(game.goTo('bed')).toBe(true);
    run(game, 2000);
    expect(events).toEqual([{ type: 'interact', objectId: 'bed' }]);
  });
  it('a new tap mid-path re-routes from the next tile boundary', () => {
    const { game } = mk();
    game.walkTo(12, 7);
    run(game, 400); // mid-way: in a step toward x=9
    const dest = game.player.settled;
    game.walkTo(7, 9);
    run(game, 100);
    // the in-flight step still finishes onto its destination tile
    run(game, 3000);
    expect(tile(game)).toEqual([7, 9]);
    expect(dest.x).toBeGreaterThan(7);
  });
  it('keyboard input cancels the path', () => {
    const { game } = mk();
    game.walkTo(12, 7);
    run(game, 300);
    game.pressDir('left');
    game.releaseDir('left');
    run(game, 3000);
    expect(tile(game)[0]).toBeLessThan(12);
  });
});

describe('integer scale', () => {
  it('picks the largest integer scale that fits in device pixels', () => {
    expect(computeScale(1000, 2000, 1)).toBe(3); // 768 <= 1000 < 1024
    expect(computeScale(390, 800, 3)).toBe(4); // 1170 device px -> 4 (1024)
    expect(computeScale(768 / 2, 2000, 2)).toBe(3);
    expect(computeScale(255, 191, 1)).toBe(1);
    expect(computeScale(2000, 400, 1)).toBe(2); // height-limited: 400/192
  });
});

describe('DS stack scale', () => {
  it('largest integer scale at which BOTH screens (plus gap) fit', () => {
    expect(stackScale(1440, 900, 1)).toBe(2); // 900/388 = 2.3
    expect(stackScale(768, 1024, 1)).toBe(2); // height-limited (1024/388), width would allow 3
    expect(stackScale(390, 844, 3)).toBe(4); // 1170/256 = 4.57; 2532/388 = 6.5
    expect(stackScale(100, 100, 1)).toBe(1);
  });
});

describe('object table', () => {
  it('emphasis only on interactable objects', () => {
    for (const f of FURNITURE) if (f.emphasis) expect(f.id).not.toBeNull();
    expect(FURNITURE.find((f) => f.id === 'pc')?.emphasis).toBe(true);
  });
});

describe('two rooms (fixture)', () => {
  // Room "a": a one-tile corridor (row 1) with a warp in the middle. Room "b": a small room with a box to talk to.
  const block = (x: number, y: number) => ({ id: null, label: 'wall', slot: 'x', x, y, w: 1, h: 1, solid: true });
  const aWalls = Array.from({ length: 5 }, (_, x) => [block(x, 0), block(x, 2)]).flat();
  const aWarp = { x: 2, y: 1, to: 'b', arrive: { x: 1, y: 2, facing: 'right' as Dir } };
  const aGrid = createGrid(aWalls, 5, 3, 0, [], [aWarp]);
  const bBox = { id: 'box', label: 'Box', slot: 'x', x: 4, y: 1, w: 1, h: 1, solid: true };
  const bWarp = { x: 0, y: 2, to: 'a', arrive: { x: 1, y: 1, facing: 'right' as Dir } };
  const bGrid = createGrid([bBox], 6, 4, 0, [], [bWarp]);
  const grids = new Map<string, Grid>([
    ['a', aGrid],
    ['b', bGrid],
  ]);
  const start = { x: 0, y: 1, facing: 'right' as Dir };
  const mk2 = (onWarp?: (w: { to: string }) => void) => {
    const events: WorldEvent[] = [];
    const game = new Game(aGrid, start, (e) => events.push(e), { grids, room: 'a', onWarp: onWarp as never });
    return { game, events };
  };
  const walk = (game: Game, ms: number) => {
    for (let t = 0; t < ms; t += 16) game.update(16);
  };

  it('BFS never walks through a warp, but can end on one', () => {
    expect(findPath(aGrid, { x: 0, y: 1 }, { x: 4, y: 1 })).toBeNull();
    expect(findPath(aGrid, { x: 0, y: 1 }, { x: 2, y: 1 })).toHaveLength(2);
    // standing ON a warp you can still walk off it
    expect(findPath(aGrid, { x: 2, y: 1 }, { x: 4, y: 1 })).toHaveLength(2);
  });

  it('stepping onto a warp fires onWarp, holds the player (warping) until enterRoom, then lands them', () => {
    const warps: string[] = [];
    const { game, events } = mk2((w) => warps.push(w.to));
    game.pressDir('right');
    walk(game, 80 + 250 * 2 + 40);
    game.releaseDir('right');
    expect(warps).toEqual(['b']);
    expect(game.isWarping).toBe(true);
    expect(game.room).toBe('a');
    // input is ignored while the screen fades: no further steps, no interaction
    game.pressDir('right');
    walk(game, 600);
    expect([game.player.x, game.player.y]).toEqual([2, 1]);
    expect(game.interact()).toBe(false);
    game.enterRoom('b', aWarp.arrive);
    expect(game.room).toBe('b');
    expect(game.isWarping).toBe(false);
    expect(game.grid).toBe(bGrid);
    expect(events).toContainEqual({ type: 'room', room: 'b' });
    expect([game.player.x, game.player.y, game.player.facing]).toEqual([1, 2, 'right']);
  });

  it('without onWarp the room is entered at once', () => {
    const { game, events } = mk2();
    expect(game.walkTo(2, 1)).toBe(true);
    walk(game, 250 * 3);
    expect(game.room).toBe('b');
    expect(events).toEqual([{ type: 'room', room: 'b' }]);
    expect([game.player.x, game.player.y]).toEqual([1, 2]);
  });

  it('the follower lands on the tile behind the player and never shares a tile', () => {
    const { game } = mk2();
    game.walkTo(2, 1);
    walk(game, 250 * 3);
    expect([game.follower.x, game.follower.y]).toEqual([0, 2]);
    expect(game.follower.facing).toBe('right');
    expect(game.follower.moving).toBe(false);
    run(game, 400, bGrid);
  });

  it('a cross-room goTo takes the stairs, then ends facing the target and interacts', () => {
    const { game, events } = mk2();
    expect(game.goTo('box')).toBe(true);
    walk(game, 4000);
    expect(game.room).toBe('b');
    expect(events).toEqual([{ type: 'room', room: 'b' }, { type: 'interact', objectId: 'box' }]);
    const v = DIR_VEC[game.player.facing];
    expect(bGrid.objectAt(game.player.x + v.dx, game.player.y + v.dy)).toBe('box');
  });

  it('goTo an unknown object, or one that has no stairs to it, does nothing', () => {
    const { game } = mk2();
    expect(game.goTo('nope')).toBe(false);
    const lone = new Game(bGrid, { x: 1, y: 2, facing: 'right' }, () => undefined, { grids: new Map([['b', bGrid]]), room: 'b' });
    expect(lone.goTo('box')).toBe(true); // same room: plain walk
  });

  it('freeze during a fade cancels the pending walk but still finishes the warp', () => {
    let finish: (() => void) | null = null;
    const { game, events } = mk2((w) => {
      finish = () => game.enterRoom(w.to, (w as unknown as typeof aWarp).arrive);
    });
    game.goTo('box');
    walk(game, 250 * 3);
    expect(game.isWarping).toBe(true);
    game.freeze(); // an overlay opens mid-fade
    expect(game.isWarping).toBe(true); // the fade is not cancelled
    finish!();
    expect(game.room).toBe('b');
    expect(game.isWarping).toBe(false);
    walk(game, 2000);
    expect(events).toEqual([{ type: 'room', room: 'b' }]); // frozen: no walk, no interact
    expect([game.player.x, game.player.y]).toEqual([1, 2]);
  });

  it('keyboard input cancels the stairs leg of a cross-room goTo', () => {
    const { game } = mk2();
    game.goTo('box');
    walk(game, 100); // the first step is in flight
    game.pressDir('left');
    game.releaseDir('left');
    walk(game, 3000);
    expect(game.room).toBe('a');
  });
});
