/**
 * Unit tests: follower interaction (facing detection, line selection rules).
 */
import { describe, expect, it } from 'vitest';
import { Game, type WorldEvent } from './actors';
import { createGrid, PLAYER_START } from './grid';
import followerContent from '../content/follower.json' with { type: 'json' };

const grid = createGrid();

function mk(start: typeof PLAYER_START = PLAYER_START) {
  const events: WorldEvent[] = [];
  const game = new Game(grid, start, (e) => events.push(e));
  return { game, events };
}

/** Advance in 16 ms frames. */
function run(game: Game, ms: number) {
  for (let t = 0; t < ms; t += 16) game.update(16);
}

describe('follower content schema', () => {
  it('has a night line', () => {
    expect(typeof followerContent.lines.night).toBe('string');
    expect(followerContent.lines.night.length).toBeGreaterThan(0);
  });
  it('has a downstairs line', () => {
    expect(typeof followerContent.lines.downstairs).toBe('string');
    expect(followerContent.lines.downstairs.length).toBeGreaterThan(0);
  });
  it('has 3-6 rotate lines', () => {
    expect(Array.isArray(followerContent.lines.rotate)).toBe(true);
    expect(followerContent.lines.rotate.length).toBeGreaterThanOrEqual(3);
    expect(followerContent.lines.rotate.length).toBeLessThanOrEqual(6);
  });
  it('rotate lines are all non-empty strings', () => {
    for (const l of followerContent.lines.rotate) {
      expect(typeof l).toBe('string');
      expect(l.length).toBeGreaterThan(0);
    }
  });
  it('no invented facts about Ayush (no surname, no employer, no codenames)', () => {
    const all = [
      followerContent.lines.night,
      followerContent.lines.downstairs,
      ...followerContent.lines.rotate,
    ].join(' ');
    // lines should not mention surnames beyond "Ayush"
    expect(all).not.toMatch(/\bBasu\b/);
    // no employer or specific project names
    expect(all).not.toMatch(/\bSAP\b/i);
  });
});

describe('Game.interactFollower – facing detection', () => {
  it('returns false while frozen', () => {
    // PLAYER_START: x:7 y:7 facing:'down' → follower at (7,6)
    const { game } = mk();
    game.freeze();
    expect(game.interactFollower()).toBe(false);
  });

  it('returns false when the player is moving', () => {
    const { game } = mk();
    game.pressDir('down');
    game.update(16); // kick off a step (already facing down)
    expect(game.player.moving).toBe(true);
    expect(game.interactFollower()).toBe(false);
  });

  it('follower starts on the tile behind the player (opposite direction)', () => {
    // PLAYER_START faces 'down', so opposite is 'up' → (7, 6)
    const { game } = mk();
    expect([game.follower.x, game.follower.y]).toEqual([7, 6]);
    // When start facing is 'up', opposite is 'down' → (7, 8)
    const { game: g2 } = mk({ x: 7, y: 7, facing: 'up' });
    expect([g2.follower.x, g2.follower.y]).toEqual([7, 8]);
  });

  it('returns true and emits follower-talk when player is adjacent and idle', () => {
    // PLAYER_START: (7,7) facing 'down' → follower at (7,6) (above)
    const { game, events } = mk();
    // Turn to face the follower (up)
    game.pressDir('up');
    game.releaseDir('up'); // release immediately so only a turn happens
    run(game, 200); // 80ms turn + idle
    expect(game.player.facing).toBe('up');
    expect(game.player.moving).toBe(false);
    // follower at (7,6), player faces up → facing (7,6) ✓
    expect([game.follower.x, game.follower.y]).toEqual([7, 6]);

    const ok = game.interactFollower();
    expect(ok).toBe(true);
    const talk = events.filter((e) => e.type === 'follower-talk');
    expect(talk).toHaveLength(1);
  });

  it('follower faces the player after interactFollower', () => {
    // PLAYER_START faces 'down' → follower at (7,6)
    const { game } = mk();
    // Turn player to face up (toward follower at y=6)
    game.pressDir('up');
    game.releaseDir('up');
    run(game, 200);
    expect(game.player.facing).toBe('up');

    game.interactFollower();
    // Player faces up → follower should face down (toward player)
    expect(game.follower.facing).toBe('down');
  });

  it('interact() (A press) fires follower-talk when facing follower tile', () => {
    // PLAYER_START: (7,7) facing 'down' → follower at (7,6)
    const { game, events } = mk();
    // Turn to face up (toward follower)
    game.pressDir('up');
    game.releaseDir('up');
    run(game, 200);
    expect(game.player.facing).toBe('up');
    expect([game.follower.x, game.follower.y]).toEqual([7, 6]);

    const ok = game.interact();
    expect(ok).toBe(true);
    expect(events.filter((e) => e.type === 'follower-talk')).toHaveLength(1);
    // Must NOT also fire interact for a furniture object
    expect(events.filter((e) => e.type === 'interact')).toHaveLength(0);
  });

  it('interact() still fires object interact when NOT facing follower', () => {
    // Player at (8,3), facing up → interacts with pc; follower is NOT at (8,2)
    const { game, events } = mk({ x: 8, y: 3, facing: 'up' });
    expect(game.interact()).toBe(true);
    expect(events.filter((e) => e.type === 'interact')).toEqual([{ type: 'interact', objectId: 'pc' }]);
    expect(events.filter((e) => e.type === 'follower-talk')).toHaveLength(0);
  });

  it('interactFollower returns false when follower is not adjacent (> 1 Manhattan tile)', () => {
    // Force the follower 3 tiles away by directly setting its position (Actor fields are public).
    // The follower always stays adjacent during normal play; this tests the guard directly.
    const { game } = mk();
    game.follower.x = 4;
    game.follower.y = 7; // player is at (7,7) → Manhattan distance = 3
    expect(Math.abs(game.player.x - game.follower.x) + Math.abs(game.player.y - game.follower.y)).toBe(3);
    expect(game.interactFollower()).toBe(false);
  });
});

describe('follower-talk does not fire while frozen', () => {
  it('returns false while frozen, true after resume', () => {
    // PLAYER_START faces 'down' → follower at (7,6); turn player up first
    const { game } = mk();
    game.pressDir('up');
    game.releaseDir('up');
    run(game, 200);
    game.freeze();
    expect(game.interactFollower()).toBe(false);
    game.resume();
    expect(game.interactFollower()).toBe(true);
  });
});
