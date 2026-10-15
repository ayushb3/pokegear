import { describe, expect, it } from 'vitest';
import { Game, type WorldEvent } from './actors';
import { createGrid, decorKey, DIR_VEC, type Decor, type Dir, type Furniture, type Pt } from './grid';
import { findPathAdjacent } from './path';

// 6 x 6 fixture, back wall = row 0. A box object at (1,3); a reactive pot at (4,3); a second reactive pot boxed into the
// bottom-right corner by solid decor (unreachable).
const furniture: Furniture[] = [{ id: 'box', label: 'Box', slot: 'object.box', x: 1, y: 3, w: 1, h: 1, solid: true }];
const decor: Decor[] = [
  { label: 'Pot', slot: 'decor.plant', x: 4, y: 3, w: 1, h: 1, solid: true, react: 'x' },
  { label: 'Crate', slot: 'decor.crate', x: 4, y: 5, w: 1, h: 1, solid: true },
  { label: 'Crate', slot: 'decor.crate', x: 5, y: 4, w: 1, h: 1, solid: true },
  { label: 'Pot', slot: 'decor.plant', x: 5, y: 5, w: 1, h: 1, solid: true, react: 'x' },
];
const grid = createGrid(furniture, 6, 6, 1, decor);

function mk(start: Pt & { facing: Dir }) {
  const events: WorldEvent[] = [];
  const game = new Game(grid, start, (e) => events.push(e));
  return { game, events };
}
const run = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 16) game.update(16);
};

describe('reactive decor (world)', () => {
  it('the grid finds reactive pieces by tile, keyed by decorKey', () => {
    expect(grid.reactAt(4, 3)).toMatchObject({ id: 'x', key: '4,3', label: 'Pot' });
    expect(grid.reactAt(3, 3)).toBeNull();
    expect(grid.reactAt(-1, 3)).toBeNull();
    expect(grid.reactives.map((r) => r.key)).toEqual(['4,3', '5,5']);
    expect(decorKey({ x: 4, y: 3 })).toBe('4,3');
  });
  it('A facing a reactive piece emits react with its id and instance key', () => {
    const { game, events } = mk({ x: 3, y: 3, facing: 'right' });
    expect(game.interact()).toBe(true);
    expect(events).toEqual([{ type: 'react', id: 'x', key: '4,3' }]);
  });
  it('A facing an object still emits interact, not react', () => {
    const { game, events } = mk({ x: 1, y: 2, facing: 'down' });
    expect(game.interact()).toBe(true);
    expect(events).toEqual([{ type: 'interact', objectId: 'box' }]);
  });
  it('frozen: A on a reactive piece does nothing', () => {
    const { game, events } = mk({ x: 3, y: 3, facing: 'right' });
    game.freeze();
    expect(game.interact()).toBe(false);
    expect(events).toEqual([]);
  });
  it('tapping a reactive piece walks adjacent, faces it and reacts on arrival', () => {
    const { game, events } = mk({ x: 1, y: 1, facing: 'down' });
    expect(game.walkTo(4, 3)).toBe(true);
    run(game, 4000);
    expect(events).toEqual([{ type: 'react', id: 'x', key: '4,3' }]);
    const v = DIR_VEC[game.player.facing];
    expect(grid.reactAt(game.player.x + v.dx, game.player.y + v.dy)?.key).toBe('4,3');
  });
  it('tapping an unreachable reactive piece returns false and does nothing', () => {
    const { game, events } = mk({ x: 1, y: 1, facing: 'down' });
    expect(game.walkTo(5, 5)).toBe(false);
    run(game, 1000);
    expect(events).toEqual([]);
    expect([game.player.x, game.player.y]).toEqual([1, 1]);
  });
  it('findPathAdjacent: null when nothing is a target', () => {
    expect(findPathAdjacent(grid, { x: 1, y: 1 }, () => false)).toBeNull();
  });
  it('findPathAdjacent never ends on a warp tile', () => {
    const pot = (x: number, y: number): Decor => ({ label: 'Pot', slot: 'decor.plant', x, y, w: 1, h: 1, solid: true, react: 'x' });
    const crate = (x: number, y: number): Decor => ({ label: 'Crate', slot: 'decor.crate', x, y, w: 1, h: 1, solid: true });
    const warps = [{ x: 1, y: 2, to: 'elsewhere', arrive: { x: 0, y: 0, facing: 'down' as Dir } }];
    const isPot = (x: number, y: number) => x === 2 && y === 2;
    // the only neighbour of the pot is the warp tile
    const boxed = createGrid([], 5, 5, 1, [pot(2, 2), crate(3, 2), crate(2, 1), crate(2, 3)], warps);
    expect(boxed.isWalkable(1, 2)).toBe(true);
    expect(findPathAdjacent(boxed, { x: 0, y: 4 }, isPot)).toBeNull();
    // a second, non-warp neighbour: the path ends there
    const open = createGrid([], 5, 5, 1, [pot(2, 2), crate(3, 2), crate(2, 1)], warps);
    const r = findPathAdjacent(open, { x: 0, y: 4 }, isPot);
    expect(r).not.toBeNull();
    expect(r!.path[r!.path.length - 1]).toEqual({ x: 2, y: 3 });
    expect(r!.face).toBe('up');
  });
  it('walkTo on a reactive tile while frozen returns false and emits nothing', () => {
    const { game, events } = mk({ x: 1, y: 1, facing: 'down' });
    game.freeze();
    expect(game.walkTo(4, 3)).toBe(false);
    run(game, 1000);
    expect(events).toEqual([]);
    expect([game.player.x, game.player.y]).toEqual([1, 1]);
  });
  it('tapping a piece you already stand next to turns you and reacts without walking', () => {
    const { game, events } = mk({ x: 3, y: 3, facing: 'left' });
    expect(game.walkTo(4, 3)).toBe(true);
    run(game, 500);
    expect([game.player.x, game.player.y]).toEqual([3, 3]);
    expect(game.player.facing).toBe('right');
    expect(events).toEqual([{ type: 'react', id: 'x', key: '4,3' }]);
  });
  it('goTo an object still walks adjacent and emits interact', () => {
    const { game, events } = mk({ x: 1, y: 1, facing: 'right' });
    expect(game.goTo('box')).toBe(true);
    run(game, 3000);
    expect([game.player.x, game.player.y]).toEqual([1, 2]);
    expect(events).toEqual([{ type: 'interact', objectId: 'box' }]);
  });
});
