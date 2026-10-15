import { describe, expect, it } from 'vitest';
import { Game, type WorldEvent } from './actors';
import { createGrid, PLAYER_START, type Dir, type Grid } from './grid';
import { Tour, tourShouldRun, tourWaitMs } from './tour';

// The bedroom grid (default createGrid()) already has pc/piano/townmap laid out.
const grid = createGrid();

function mk(start: typeof PLAYER_START = PLAYER_START) {
  const events: WorldEvent[] = [];
  const game = new Game(grid, start, (e) => events.push(e));
  return { game, events };
}

/** Build a Tour wired to capture emitted events and emote calls. */
function mkTour(game: Game, opts: { waitMs?: number } = {}) {
  const tourEvents: WorldEvent[] = [];
  const emotes: Array<{ actor: string; slot: string; ms: number }> = [];
  const tour = new Tour(game, {
    waitMs: opts.waitMs ?? 100,
    emit: (e) => tourEvents.push(e),
    onEmote: (actor, slot, ms) => emotes.push({ actor, slot, ms }),
  });
  return { tour, tourEvents, emotes };
}

/** Advance the game + tour by `ms` in 16ms frames. */
function run(game: Game, tour: Tour, ms: number) {
  for (let t = 0; t < ms; t += 16) {
    game.update(16);
    tour.update(16);
  }
}

describe('tourShouldRun', () => {
  it('returns true for a plain page load', () => {
    expect(tourShouldRun(false, new URLSearchParams(''))).toBe(true);
  });
  it('returns false under prefers-reduced-motion', () => {
    expect(tourShouldRun(true, new URLSearchParams(''))).toBe(false);
  });
  it('returns false when ?open= is set (deep link)', () => {
    expect(tourShouldRun(false, new URLSearchParams('open=projects/foo'))).toBe(false);
  });
  it('returns false on ?debug without ?tour=1', () => {
    expect(tourShouldRun(false, new URLSearchParams('debug'))).toBe(false);
  });
  it('returns false on ?debug&tour=0 (value is not exactly 1)', () => {
    expect(tourShouldRun(false, new URLSearchParams('debug&tour=0'))).toBe(false);
  });
  it('returns true on ?debug&tour=1 (forced e2e mode)', () => {
    expect(tourShouldRun(false, new URLSearchParams('debug&tour=1'))).toBe(true);
  });
});

describe('tourWaitMs', () => {
  it('returns 8000 for a plain load', () => {
    expect(tourWaitMs(new URLSearchParams(''))).toBe(8000);
  });
  it('returns 500 when ?tour=1 is set', () => {
    expect(tourWaitMs(new URLSearchParams('tour=1'))).toBe(500);
  });
  it('returns 8000 when ?tour=0 (not exactly 1)', () => {
    expect(tourWaitMs(new URLSearchParams('tour=0'))).toBe(8000);
  });
});

describe('Tour sequencing', () => {
  it('starts in the waiting state and does not walk during the wait', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 500 });
    run(game, tour, 400);
    expect(tour.stateForTest).toBe('waiting');
    expect(game.player.x).toBe(PLAYER_START.x);
    expect(game.player.y).toBe(PLAYER_START.y);
  });

  it('transitions to walking after waitMs', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 200 });
    run(game, tour, 250);
    // Should have started walking to pc
    expect(tour.stateForTest).not.toBe('waiting');
    expect(['walking', 'pausing', 'returning', 'done']).toContain(tour.stateForTest);
  });

  it('walks to pc then piano then townmap and returns to start', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 100 });
    // Maximum: 3 pauses of 1200ms + 3 walks of ~3s each + return ~3s = ~15s total
    run(game, tour, 20000);
    expect(tour.isDone).toBe(true);
    expect(game.player.x).toBe(PLAYER_START.x);
    expect(game.player.y).toBe(PLAYER_START.y);
  });

  it('does not fire interact events during the tour', () => {
    const { game, events } = mk();
    const tour = new Tour(game, { waitMs: 100 });
    run(game, tour, 20000);
    // The tour visits pc/piano/townmap but must NOT trigger interactions
    expect(events.filter((e) => e.type === 'interact')).toHaveLength(0);
  });

  it('pauses at each stop: still pausing at 1100 ms, walking (next stop) at 1300 ms', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 50 });
    // Advance enough to finish the wait (50ms) and the walk to pc.
    // Player starts at (7,7); pc standing spot is (8,3): BFS = 5 tiles × 250ms = 1250ms.
    // After 50 + 1300ms we should be freshly in 'pausing' (the walk finished ≤ 1264ms after start).
    run(game, tour, 50 + 1300);
    // Must be pausing (arrived, not yet waited PAUSE_MS)
    expect(tour.stateForTest).toBe('pausing');

    // 1100ms more into the pause: still pausing (PAUSE_MS = 1200)
    run(game, tour, 1100);
    expect(tour.stateForTest).toBe('pausing');

    // 200ms more (1300ms total in this pause): PAUSE_MS elapsed, now walking to piano
    run(game, tour, 200);
    expect(tour.stateForTest).toBe('walking');
  });
});

describe('Tour cancellation', () => {
  it('cancel() during walking: drops path, player stays near where it stopped, not at PC standing spot', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 50 });
    // Let the tour start walking (50ms wait + a few steps)
    run(game, tour, 50 + 300);
    expect(tour.stateForTest).toBe('walking');
    // Record where the player is mid-walk
    const midX = game.player.x;
    const midY = game.player.y;
    tour.cancel();
    expect(tour.isCancelled).toBe(true);
    // Let the in-flight step finish and verify the tour does not continue
    const timeoutMs = 300 + 1200 + 500; // one step + pause + extra
    run(game, tour, timeoutMs);
    // Still cancelled
    expect(tour.isCancelled).toBe(true);
    // Player should NOT have reached the PC standing spot (8,3) — it stopped mid-walk
    expect(game.player.x).not.toBe(8);
    expect(game.player.y).not.toBe(3);
    // Player tile must be near where it was when cancelled (within a few tiles max of mid-walk pos)
    expect(Math.abs(game.player.x - midX) + Math.abs(game.player.y - midY)).toBeLessThanOrEqual(2);
  });

  it('cancel() during waiting also cancels, player never leaves start', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 5000 });
    run(game, tour, 100);
    expect(tour.stateForTest).toBe('waiting');
    tour.cancel();
    expect(tour.isCancelled).toBe(true);
    // Further updates do nothing
    run(game, tour, 5000);
    expect(tour.isCancelled).toBe(true);
    expect(game.player.x).toBe(PLAYER_START.x);
    expect(game.player.y).toBe(PLAYER_START.y);
  });

  it('cancel() after done is a no-op (remains done)', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 50 });
    run(game, tour, 20000);
    expect(tour.isDone).toBe(true);
    tour.cancel();
    expect(tour.isDone).toBe(true);
  });

  it('freeze while active (state !== waiting) cancels the tour', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 50 });
    // Start walking
    run(game, tour, 50 + 200);
    expect(tour.stateForTest).toBe('walking');
    game.freeze();
    tour.update(16); // one tick with frozen
    expect(tour.isCancelled).toBe(true);
  });

  it('freeze during waiting just resets the timer (does not cancel)', () => {
    const { game } = mk();
    const tour = new Tour(game, { waitMs: 100 });
    game.freeze();
    run(game, tour, 500);
    // Frozen during wait: timer resets each frame, never starts
    expect(tour.stateForTest).toBe('waiting');
    // Unfreeze: timer restarts from 0
    game.resume();
    run(game, tour, 150);
    // After unfreezing and waiting >= waitMs it transitions
    expect(['walking', 'pausing']).toContain(tour.stateForTest);
  });

  it('reduced-motion live: cancel() called when motionMq.matches flips true', () => {
    const { game } = mk();
    const fakesMq = { matches: false } as unknown as MediaQueryList;
    const tour = new Tour(game, { waitMs: 50, motionMq: fakesMq });
    run(game, tour, 50 + 200);
    expect(tour.stateForTest).toBe('walking');
    (fakesMq as unknown as { matches: boolean }).matches = true;
    tour.update(16);
    expect(tour.isCancelled).toBe(true);
  });

  it('does not start outside the bedroom', () => {
    // Build a two-room fixture similar to world.test.ts
    const block = (x: number, y: number) => ({ id: null as null, label: 'w', slot: 'x', x, y, w: 1, h: 1, solid: true });
    const aWalls = Array.from({ length: 5 }, (_, x) => [block(x, 0), block(x, 2)]).flat();
    const aWarp = { x: 2, y: 1, to: 'b' as string, arrive: { x: 1, y: 2, facing: 'right' as Dir } };
    const aGrid = createGrid(aWalls, 5, 3, 0, [], [aWarp]);
    const bBox = { id: 'box' as string, label: 'Box', slot: 'x', x: 4, y: 1, w: 1, h: 1, solid: true };
    const bWarp = { x: 0, y: 2, to: 'a' as string, arrive: { x: 1, y: 1, facing: 'right' as Dir } };
    const bGrid = createGrid([bBox], 6, 4, 0, [], [bWarp]);
    const grids = new Map<string, Grid>([['a', aGrid], ['b', bGrid]]);
    const events: WorldEvent[] = [];
    const game = new Game(aGrid, { x: 0, y: 1, facing: 'right' }, (e) => events.push(e), { grids, room: 'b' });
    const tour = new Tour(game, { waitMs: 100 });
    for (let t = 0; t < 500; t += 16) {
      game.update(16);
      tour.update(16);
    }
    // Not in bedroom: timer never ticks
    expect(tour.stateForTest).toBe('waiting');
  });
});

describe('Game.walkToObject', () => {
  it('walks to the standing spot without firing interact', () => {
    const { game, events } = mk();
    expect(game.walkToObject('pc')).toBe(true);
    for (let t = 0; t < 5000; t += 16) game.update(16);
    // The player should be adjacent to the pc, facing it
    const v = game.player;
    const dx = v.facing === 'left' ? -1 : v.facing === 'right' ? 1 : 0;
    const dy = v.facing === 'up' ? -1 : v.facing === 'down' ? 1 : 0;
    const atObj = grid.objectAt(v.x + dx, v.y + dy);
    expect(atObj).toBe('pc');
    // No interact event emitted
    expect(events.filter((e) => e.type === 'interact')).toHaveLength(0);
  });

  it('returns false when frozen', () => {
    const { game } = mk();
    game.freeze();
    expect(game.walkToObject('pc')).toBe(false);
  });
});

describe('Game.dropPath', () => {
  it('clears a queued path immediately', () => {
    const { game } = mk();
    game.walkToObject('pc');
    expect(game.isIdle).toBe(false); // path queued
    game.dropPath();
    // In-flight step hasn't started yet (first frame), so isIdle is true
    expect(game.isIdle).toBe(true);
  });
});

describe('Tour emote scheduling and narrator lines', () => {
  it('emits a tour line and schedules an emote when arriving at the PC stop', () => {
    const { game } = mk();
    const { tour, tourEvents, emotes } = mkTour(game, { waitMs: 50 });
    // Advance past wait + walk to pc (50ms + ~1300ms)
    run(game, tour, 50 + 1400);
    // Should have arrived at pc and be pausing
    expect(tour.stateForTest).toBe('pausing');
    // A tour line should have been emitted
    const lines = tourEvents.filter((e) => e.type === 'tour') as Array<{ type: 'tour'; line: string | null }>;
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const pcLine = lines.find((e) => e.line !== null);
    expect(pcLine?.line).toBe('Ayush checks on his projects.');
    // An emote should have been scheduled
    expect(emotes.length).toBeGreaterThanOrEqual(1);
    expect(emotes[0]!.slot).toBe('emote.exclaim');
    expect(emotes[0]!.actor).toBe('follower');
    expect(emotes[0]!.ms).toBe(1200);
  });

  it('emits correct emote slots for each stop', () => {
    const { game } = mk();
    const { tour, emotes } = mkTour(game, { waitMs: 50 });
    // Run the full tour
    run(game, tour, 20000);
    expect(tour.isDone).toBe(true);
    // Three emotes: exclaim (pc), note (piano), ellipsis (townmap)
    expect(emotes.map((e) => e.slot)).toEqual(['emote.exclaim', 'emote.note', 'emote.ellipsis']);
  });

  it('emits correct narrator lines for all three stops', () => {
    const { game } = mk();
    const { tour, tourEvents } = mkTour(game, { waitMs: 50 });
    run(game, tour, 20000);
    expect(tour.isDone).toBe(true);
    const lines = (tourEvents.filter((e) => e.type === 'tour') as Array<{ type: 'tour'; line: string | null }>)
      .map((e) => e.line);
    // Should contain the three narrator lines
    expect(lines).toContain('Ayush checks on his projects.');
    expect(lines).toContain('Ayush hums his piece.');
    expect(lines).toContain("Ayush looks at where he's been.");
    // Should end with null (line cleared)
    expect(lines[lines.length - 1]).toBeNull();
  });

  it('emits { type: tour, line: null } immediately on cancel', () => {
    const { game } = mk();
    const { tour, tourEvents } = mkTour(game, { waitMs: 50 });
    run(game, tour, 50 + 200); // walking
    expect(tour.stateForTest).toBe('walking');
    tour.cancel();
    const nullLines = (tourEvents.filter((e) => e.type === 'tour') as Array<{ type: 'tour'; line: string | null }>)
      .filter((e) => e.line === null);
    expect(nullLines.length).toBeGreaterThanOrEqual(1);
  });

  it('emits { type: tour, line: null } immediately on cancel even before any stop', () => {
    const { game } = mk();
    const { tour, tourEvents } = mkTour(game, { waitMs: 50 });
    // Cancel mid-walk before any pause (no line yet emitted)
    run(game, tour, 50 + 100);
    tour.cancel();
    const nullEvent = (tourEvents.filter((e) => e.type === 'tour') as Array<{ type: 'tour'; line: string | null }>)
      .find((e) => e.line === null);
    expect(nullEvent).toBeDefined();
  });
});
