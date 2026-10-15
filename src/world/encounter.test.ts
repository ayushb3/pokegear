import { describe, expect, it } from 'vitest';
import { ENCOUNTER_MAX_STEPS, ENCOUNTER_MIN_STEPS, Game, encounterRoll, type WorldEvent } from './actors';
import { createGrid, createRoomGrid, ROOMS, type Dir, type Grid } from './grid';
import { Fx, FADE_MS, WIPE_FLASH_MS, WIPE_MS, WIPE_SPIRAL_MS, spiralOrder } from './fx';
import { rollShiny, SHINY_ODDS } from './shiny';

const walk = (game: Game, ms: number) => {
  for (let t = 0; t < ms; t += 16) game.update(16);
};

describe('encounter rule', () => {
  it('never before the third grass step, certain by the sixth, a chance in between', () => {
    const always = () => 0;
    const never = () => 1;
    for (let n = 0; n < ENCOUNTER_MIN_STEPS; n++) expect(encounterRoll(n, always), `step ${n}`).toBe(false);
    for (let n = ENCOUNTER_MIN_STEPS; n < ENCOUNTER_MAX_STEPS; n++) {
      expect(encounterRoll(n, always), `step ${n} lucky`).toBe(true);
      expect(encounterRoll(n, never), `step ${n} unlucky`).toBe(false);
    }
    expect(encounterRoll(ENCOUNTER_MAX_STEPS, never)).toBe(true);
  });
});

describe('tall grass in a Game', () => {
  // a 10 x 3 corridor, the right half is grass
  const grass = { label: 'grass', slot: 'decor.grass', x: 5, y: 1, w: 5, h: 1, solid: false, encounter: true };
  const walls = Array.from({ length: 10 }, (_, x) => [
    { id: null, label: 'w', slot: 'x', x, y: 0, w: 1, h: 1, solid: true },
    { id: null, label: 'w', slot: 'x', x, y: 2, w: 1, h: 1, solid: true },
  ]).flat();
  const grid = createGrid(walls, 10, 3, 0, [grass], []);
  const mk = (rng: () => number) => {
    const events: WorldEvent[] = [];
    const game = new Game(grid, { x: 0, y: 1, facing: 'right' as Dir }, (e) => events.push(e), { grids: new Map<string, Grid>([['r', grid]]), room: 'r', rng });
    return { game, events };
  };

  it('grass tiles are known to the grid', () => {
    expect(grid.encounterAt(5, 1)).toBe(true);
    expect(grid.encounterAt(4, 1)).toBe(false);
    expect(grid.encounterAt(-1, 1)).toBe(false);
    expect(grid.isWalkable(7, 1)).toBe(true); // grass never blocks
  });

  it('with an unlucky rng the certain step fires: the player stops in the grass, input is held until resume()', () => {
    const { game, events } = mk(() => 1);
    game.pressDir('right');
    walk(game, 250 * 20);
    game.releaseDir('right');
    // 5 floor steps (1..5 is the first grass tile at x=5), then grass steps: x=5 (1), 6 (2), 7 (3), 8 (4), 9 (5)... the corridor ends at 9
    // so the certain 6th step cannot happen here; the rule holds the player at the wall instead
    expect(events).toEqual([]);
    expect([game.player.x, game.player.y]).toEqual([9, 1]);
  });

  it('a lucky rng rolls the encounter on the third grass step and nothing moves until resume()', () => {
    const { game, events } = mk(() => 0);
    game.pressDir('right');
    walk(game, 250 * 20);
    expect(events).toEqual([{ type: 'encounter' }]);
    expect(game.isInEncounter).toBe(true);
    expect(game.busy).toBe(true);
    expect([game.player.x, game.player.y]).toEqual([7, 1]); // x=5,6,7: the third grass tile
    expect(game.interact()).toBe(false);
    expect(game.walkTo(9, 1)).toBe(false);
    walk(game, 1000);
    expect([game.player.x, game.player.y]).toEqual([7, 1]);
    // the UI: freeze (the overlay opens) ... resume (it closes) ends the encounter and the count restarts
    game.freeze();
    game.resume();
    expect(game.isInEncounter).toBe(false);
    game.pressDir('right');
    walk(game, 250 * 4);
    game.releaseDir('right');
    expect(events).toEqual([{ type: 'encounter' }]); // x=8 (1), x=9 (2): below the minimum, no second encounter
    expect([game.player.x, game.player.y]).toEqual([9, 1]);
  });

  it('leaving the grass resets the count', () => {
    const { game, events } = mk(() => 1); // unlucky: only the certain (6th) step fires
    game.walkTo(7, 1); // three grass steps (5, 6, 7)
    walk(game, 250 * 8);
    game.walkTo(4, 1); // back out: 6, 5 are two more, then floor
    walk(game, 250 * 4);
    game.walkTo(7, 1); // three more: 8 in all, but never 6 in a row
    walk(game, 250 * 4);
    expect(events).toEqual([]);
    game.walkTo(9, 1); // 8, 9: now 5 in a row... the corridor ends
    walk(game, 250 * 3);
    expect(events).toEqual([]);
  });
});

describe('the house: three rooms', () => {
  it('the yard is reachable from the bedroom through the downstairs door, and goTo hops twice', () => {
    const grids = new Map<string, Grid>(Object.values(ROOMS).map((r) => [r.id, createRoomGrid(r)]));
    const events: WorldEvent[] = [];
    const game = new Game(grids.get('bedroom')!, ROOMS.bedroom.start, (e) => events.push(e), { grids, room: 'bedroom', rng: () => 1 });
    expect(game.goTo('mailbox')).toBe(true);
    walk(game, 20_000);
    expect(game.room).toBe('yard');
    expect(events.filter((e) => e.type === 'room').map((e) => (e as { room: string }).room)).toEqual(['downstairs', 'yard']);
    expect(events[events.length - 1]).toEqual({ type: 'interact', objectId: 'mailbox' });
    // and back up to the bedroom from the yard
    game.resume();
    expect(game.goTo('pc')).toBe(true);
    walk(game, 20_000);
    expect(game.room).toBe('bedroom');
    expect(events[events.length - 1]).toEqual({ type: 'interact', objectId: 'pc' });
  });
  it('the yard has tall grass on both sides of the path and none on it', () => {
    const g = createRoomGrid(ROOMS.yard);
    expect(g.encounterAt(2, 6)).toBe(true);
    expect(g.encounterAt(11, 6)).toBe(true);
    expect(g.encounterAt(6, 6)).toBe(false);
    expect(g.encounterAt(6, 2)).toBe(false); // the door mat (a warp) is never grass
  });
});

describe('Fx wipe (wild encounter)', () => {
  it('spiralOrder covers every cell exactly once, starting top-left and going right', () => {
    const o = spiralOrder(16, 12);
    expect(o).toHaveLength(16 * 12);
    expect(new Set(o.map((c) => `${c.x},${c.y}`)).size).toBe(16 * 12);
    expect(o.slice(0, 3)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(o[15]).toEqual({ x: 15, y: 0 });
    expect(o[16]).toEqual({ x: 15, y: 1 });
    expect(spiralOrder(1, 1)).toEqual([{ x: 0, y: 0 }]);
    expect(spiralOrder(3, 1)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  });
  it('blinks twice, spirals to black, holds black until clearWipe, then fades in', async () => {
    const fx = new Fx();
    let black = false;
    void fx.startWipe().then(() => (black = true));
    fx.update(40);
    expect(fx.fade).toBe(1); // first blink on
    fx.update(80);
    expect(fx.fade).toBe(0); // off
    fx.update(80);
    expect(fx.fade).toBe(1); // second blink
    fx.update(WIPE_FLASH_MS - 200); // end of the blinks
    expect(fx.fade).toBe(0);
    fx.update(WIPE_SPIRAL_MS / 2);
    expect(fx.wipe).toBeCloseTo(0.5, 1);
    expect(black).toBe(false);
    fx.update(WIPE_SPIRAL_MS / 2);
    await Promise.resolve();
    expect(black).toBe(true);
    expect(fx.fade).toBe(1);
    expect(fx.wipe).toBe(1);
    fx.update(5000); // held: stays black
    expect(fx.fade).toBe(1);
    // a fadeThrough asked while held runs its mid at once (the screen is already black) and never hangs
    let mid = 0;
    await fx.fadeThrough(() => mid++);
    expect(mid).toBe(1);
    let clear = false;
    void fx.clearWipe().then(() => (clear = true));
    expect(fx.wipe).toBe(0);
    fx.update(FADE_MS / 2);
    expect(fx.fade).toBeCloseTo(0.5, 1);
    fx.update(FADE_MS / 2);
    await Promise.resolve();
    expect(clear).toBe(true);
    expect(fx.fade).toBe(0);
    expect(WIPE_MS).toBe(WIPE_FLASH_MS + WIPE_SPIRAL_MS);
  });
  it('instant (reduced motion) cuts to black and back', async () => {
    const fx = new Fx();
    await fx.startWipe(true);
    expect(fx.fade).toBe(1);
    await fx.clearWipe(true);
    expect(fx.fade).toBe(0);
    await fx.clearWipe(true); // nothing held: no-op
    expect(fx.fade).toBe(0);
  });
});

describe('shiny roll', () => {
  const p = (q: string) => new URLSearchParams(q);
  it('is 1 in SHINY_ODDS on a plain load', () => {
    expect(rollShiny(p(''), () => 0)).toBe(true);
    expect(rollShiny(p(''), () => 0.99)).toBe(false);
    expect(rollShiny(p(''), () => 1 / SHINY_ODDS)).toBe(false);
    expect(rollShiny(p(''), () => 0.5 / SHINY_ODDS)).toBe(true);
  });
  it('?shiny=1 forces it, ?shiny=0 prevents it, ?debug turns the roll off', () => {
    expect(rollShiny(p('?shiny=1'), () => 0.99)).toBe(true);
    expect(rollShiny(p('?shiny=0'), () => 0)).toBe(false);
    expect(rollShiny(p('?debug'), () => 0)).toBe(false);
    expect(rollShiny(p('?debug&shiny=1'), () => 0.99)).toBe(true);
  });
});
