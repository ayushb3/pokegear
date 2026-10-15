import { DIR_VEC, OPPOSITE, type Dir, type Grid, type Pt, type Warp } from './grid';
import { dirBetween, findPath, findPathAdjacent, findPathToObject } from './path';

export const WALK_MS = 250; // 1 tile = 250ms = 4 tiles/s
export const RUN_MS = 125;
export const TURN_MS = 80;
export const BUFFER_MS = 150; // a tap released before the next decision still counts
/** Player walk cycle within a step: stand, step frame (A/B alternating), stand. */
export const STAND_IN = 0.2;
export const STAND_OUT = 0.8;

export type WorldEvent =
  | { type: 'interact'; objectId: string }
  | { type: 'room'; room: string }
  /** Idle tour: a third-person narrator line to show in the idle box. `line: null` clears it (tour ended/cancelled). */
  | { type: 'tour'; line: string | null }
  /** The player faced the follower and pressed A (or tapped it). */
  | { type: 'follower-talk' }
  /** The player faced a reactive decor piece (`Decor.react`) and pressed A / tapped it. `key` = the piece's room-local `decorKey`. */
  | { type: 'react'; id: string; key: string }
  /** A step into tall grass rolled a wild encounter. The Game holds the player (input ignored) until `resume()`. */
  | { type: 'encounter' };

/** Tall grass: never on the first two steps, a chance from the third, certain by the sixth. */
export const ENCOUNTER_MIN_STEPS = 3;
export const ENCOUNTER_MAX_STEPS = 6;
export const ENCOUNTER_CHANCE = 0.4;
export function encounterRoll(grassSteps: number, rng: () => number): boolean {
  if (grassSteps < ENCOUNTER_MIN_STEPS) return false;
  if (grassSteps >= ENCOUNTER_MAX_STEPS) return true;
  return rng() < ENCOUNTER_CHANCE;
}

/** Optional multi-room wiring for a Game. Without it a Game is a single room (the grid it was given). */
export interface RoomsOpts {
  grids: Map<string, Grid>;
  /** the room the player starts in (a key of `grids`) */
  room: string;
  /**
   * Called when the player steps onto a warp. The owner must call `enterRoom` (the renderer fades to black first). The Game
   * stays in a `warping` state, ignoring input, until it does. Without `onWarp` the room is entered at once.
   */
  onWarp?: (w: Warp<string>) => void;
  /** random source for wild encounters (tests and ?debug pass a constant: then only the certain step fires) */
  rng?: () => number;
}

export class Actor {
  /** logical tile (the tile it is on, or leaving while `moving`) */
  x: number;
  y: number;
  facing: Dir;
  moving = false;
  toX = 0;
  toY = 0;
  /** flips each completed step so legs alternate */
  parity: 0 | 1 = 0;

  constructor(x: number, y: number, facing: Dir) {
    this.x = x;
    this.y = y;
    this.facing = facing;
  }
  begin(toX: number, toY: number) {
    this.toX = toX;
    this.toY = toY;
    this.moving = true;
  }
  finish() {
    this.x = this.toX;
    this.y = this.toY;
    this.moving = false;
    this.parity = this.parity === 0 ? 1 : 0;
  }
  /** tile the actor will occupy once idle */
  get settled(): Pt {
    return this.moving ? { x: this.toX, y: this.toY } : { x: this.x, y: this.y };
  }
  posAt(p: number): Pt {
    return this.moving
      ? { x: this.x + (this.toX - this.x) * p, y: this.y + (this.toY - this.y) * p }
      : { x: this.x, y: this.y };
  }
}

export interface ActorView {
  /** tile units, fractional while moving */
  x: number;
  y: number;
  facing: Dir;
  /** sheet column: player 0 stepA, 1 stand, 2 stepB; follower 0/1 */
  col: number;
}

export class Game {
  readonly player: Actor;
  readonly follower: Actor;
  private stepT = 0;
  private stepDur = WALK_MS;
  private turnLeft = 0;
  private stack: Dir[] = [];
  private buffer: { dir: Dir; age: number } | null = null;
  private run = false;
  private frozen = false;
  private path: Pt[] = [];
  private arrive: { face: Dir; interact: boolean } | null = null;
  private readonly grids: Map<string, Grid>;
  private roomId: string;
  private readonly onWarp?: (w: Warp<string>) => void;
  private warping = false;
  /** a cross-room goTo: the object to walk to once the next enterRoom has finished */
  private after: string | null = null;
  /** steps taken in tall grass since the last encounter */
  private grassSteps = 0;
  private readonly rng: () => number;
  /** true from the step that rolled an encounter until `resume()`: input is ignored, the player holds still */
  private inEncounter = false;

  constructor(
    grid: Grid,
    start: Pt & { facing: Dir },
    private readonly emit: (e: WorldEvent) => void,
    rooms?: RoomsOpts,
  ) {
    this.roomId = rooms?.room ?? 'bedroom';
    this.grids = rooms?.grids ?? new Map([[this.roomId, grid]]);
    this.onWarp = rooms?.onWarp;
    this.rng = rooms?.rng ?? Math.random;
    this.player = new Actor(start.x, start.y, start.facing);
    // the follower starts on the tile behind the player (any walkable neighbour as fallback)
    const cands: Dir[] = [OPPOSITE[start.facing], 'down', 'left', 'up', 'right'];
    let fx = start.x;
    let fy = start.y;
    for (const d of cands) {
      const x = start.x + DIR_VEC[d].dx;
      const y = start.y + DIR_VEC[d].dy;
      if (grid.isWalkable(x, y)) {
        fx = x;
        fy = y;
        break;
      }
    }
    this.follower = new Actor(fx, fy, start.facing);
  }

  /** the grid of the room the player is in */
  get grid(): Grid {
    return this.grids.get(this.roomId) as Grid;
  }
  get room(): string {
    return this.roomId;
  }
  /** true from the moment the player steps on a warp until `enterRoom` ran (the screen is fading) */
  get isWarping(): boolean {
    return this.warping;
  }
  /** true while a wild encounter is being handled by the UI (the battle); cleared by `resume()` */
  get isInEncounter(): boolean {
    return this.inEncounter;
  }

  // ---------- input ----------
  pressDir(dir: Dir) {
    if (this.frozen) return;
    this.path = [];
    this.arrive = null;
    this.after = null;
    this.stack = this.stack.filter((d) => d !== dir);
    this.stack.push(dir);
    this.buffer = { dir, age: 0 };
  }
  releaseDir(dir: Dir) {
    this.stack = this.stack.filter((d) => d !== dir);
  }
  releaseAll() {
    this.stack = [];
    this.run = false;
  }
  /** Clear any queued path and arrive intent (the in-flight step still finishes). */
  dropPath() {
    this.path = [];
    this.arrive = null;
    this.after = null;
  }
  setRun(on: boolean) {
    this.run = on && !this.frozen;
  }

  /** What A does: interact with the object being faced. */
  interact(): boolean {
    if (this.frozen || this.warping || this.inEncounter || this.player.moving || this.turnLeft > 0) return false;
    const v = DIR_VEC[this.player.facing];
    const nx = this.player.x + v.dx;
    const ny = this.player.y + v.dy;
    // Check if player is facing the follower's tile (follower talk takes priority over furniture)
    if (!this.follower.moving && this.follower.x === nx && this.follower.y === ny) {
      this.follower.facing = OPPOSITE[this.player.facing];
      this.emit({ type: 'follower-talk' });
      return true;
    }
    const id = this.grid.objectAt(nx, ny);
    if (id) {
      this.emit({ type: 'interact', objectId: id });
      return true;
    }
    // reactive decor (an object on the faced tile always wins)
    const r = this.grid.reactAt(nx, ny);
    if (r) {
      this.emit({ type: 'react', id: r.id, key: r.key });
      return true;
    }
    return false;
  }

  /**
   * Interact with the follower directly (e.g. tapped its sprite on the canvas).
   * Returns true if the follower is adjacent to the player, the player is idle, and the world is not frozen.
   */
  interactFollower(): boolean {
    if (this.frozen || this.warping || this.inEncounter || this.player.moving || this.turnLeft > 0) return false;
    const f = this.follower;
    if (f.moving) return false;
    const dx = Math.abs(this.player.x - f.x);
    const dy = Math.abs(this.player.y - f.y);
    if (dx + dy !== 1) return false; // only adjacent (not diagonal), never same tile
    // Turn the player toward the follower
    const face = dx === 1 ? (f.x > this.player.x ? 'right' : 'left') : f.y > this.player.y ? 'down' : 'up';
    this.player.facing = face as Dir;
    f.facing = OPPOSITE[face as Dir];
    this.emit({ type: 'follower-talk' });
    return true;
  }

  freeze() {
    this.frozen = true;
    this.stack = [];
    this.buffer = null;
    this.path = [];
    this.arrive = null;
    this.after = null; // a fade already in progress is NOT cancelled: it still lands the player in the new room
    this.run = false;
  }
  /** Unfreeze. Also ends a wild encounter: the UI that handled it (the battle) is done. */
  resume() {
    this.frozen = false;
    this.inEncounter = false;
  }

  /** Tap-to-walk. Returns false (and does nothing) if the tile is unreachable. */
  walkTo(x: number, y: number): boolean {
    if (this.frozen || this.warping || this.inEncounter) return false;
    const id = this.grid.objectAt(x, y);
    if (id) return this.goTo(id);
    const react = this.grid.reactAt(x, y);
    if (react) {
      // tap parity with A: walk next to the piece, face it, interact (which emits `react`)
      const r = findPathAdjacent(this.grid, this.player.settled, (tx, ty) => this.grid.reactAt(tx, ty)?.key === react.key);
      if (!r) return false;
      this.stack = [];
      this.buffer = null;
      this.path = r.path;
      this.arrive = { face: r.face, interact: true };
      this.after = null;
      return true;
    }
    if (!this.grid.isWalkable(x, y)) return false;
    const origin = this.player.settled; // re-route from the next tile boundary
    const path = findPath(this.grid, origin, { x, y });
    if (!path || path.length === 0) return false;
    this.stack = [];
    this.buffer = null;
    this.path = path;
    this.arrive = null;
    this.after = null;
    return true;
  }

  /** The room that holds object `id`, or null. */
  private roomWith(id: string): string | null {
    for (const [room, g] of this.grids) if (g.tilesOf(id).length > 0) return room;
    return null;
  }

  /**
   * Walk to the nearest tile next to the object and face it, but do NOT auto-interact. For the idle tour.
   * Only works in the current room (no cross-room movement).
   */
  walkToObject(objectId: string): boolean {
    if (this.frozen || this.warping || this.inEncounter) return false;
    const r = findPathToObject(this.grid, this.player.settled, objectId);
    if (!r) return false;
    this.stack = [];
    this.buffer = null;
    this.path = r.path;
    this.arrive = { face: r.face, interact: false };
    this.after = null;
    return true;
  }

  /** Walk to the nearest tile next to the object, face it, interact. Across rooms: take the stairs first, then walk to it. */
  goTo(objectId: string): boolean {
    if (this.frozen || this.warping || this.inEncounter) return false;
    const target = this.roomWith(objectId);
    if (target === null) return false;
    if (target !== this.roomId) return this.goViaWarp(objectId, target);
    const r = findPathToObject(this.grid, this.player.settled, objectId);
    if (!r) return false;
    this.stack = [];
    this.buffer = null;
    this.path = r.path;
    this.arrive = { face: r.face, interact: true };
    this.after = null;
    return true;
  }

  /** The room to warp into next on the way from the current room to `target` (BFS over the house), or null. */
  private nextHop(target: string): string | null {
    const prev = new Map<string, string | null>([[this.roomId, null]]);
    const queue = [this.roomId];
    for (let i = 0; i < queue.length; i++) {
      const room = queue[i] as string;
      if (room === target) {
        let hop = room;
        while (prev.get(hop) !== this.roomId) hop = prev.get(hop) as string;
        return hop;
      }
      for (const w of (this.grids.get(room) as Grid).warps) {
        if (prev.has(w.to)) continue;
        prev.set(w.to, room);
        queue.push(w.to);
      }
    }
    return null;
  }

  /** Path to the nearest warp toward `target` (the next room on the way); `enterRoom` then carries on to the object. */
  private goViaWarp(objectId: string, target: string): boolean {
    const hop = this.nextHop(target);
    if (hop === null) return false;
    const origin = this.player.settled;
    let best: Pt[] | null = null;
    for (const w of this.grid.warps) {
      if (w.to !== hop) continue;
      const p = findPath(this.grid, origin, w);
      if (p && p.length > 0 && (!best || p.length < best.length)) best = p;
    }
    if (!best) return false;
    this.stack = [];
    this.buffer = null;
    this.path = best;
    this.arrive = null;
    this.after = objectId;
    return true;
  }

  /**
   * Put the player in `room` on the arrival tile (facing `at.facing`), the follower on the tile behind, and drop all queued
   * movement. Emits `{ type: 'room' }`. Runs even while frozen (an overlay opened mid-fade must not strand the player on the stairs).
   */
  enterRoom(room: string, at: Pt & { facing: Dir }) {
    this.roomId = room;
    const p = this.player;
    p.x = at.x;
    p.y = at.y;
    p.moving = false;
    p.facing = at.facing;
    const f = this.follower;
    const g = this.grid;
    for (const d of [OPPOSITE[at.facing], 'down', 'left', 'up', 'right'] as Dir[]) {
      const x = at.x + DIR_VEC[d].dx;
      const y = at.y + DIR_VEC[d].dy;
      if (g.isWalkable(x, y)) {
        f.x = x;
        f.y = y;
        break;
      }
    }
    f.moving = false;
    f.facing = at.facing;
    this.stepT = 0;
    this.turnLeft = 0;
    this.stack = [];
    this.buffer = null;
    this.path = [];
    this.arrive = null;
    this.warping = false;
    this.grassSteps = 0;
    this.emit({ type: 'room', room });
    const after = this.after;
    this.after = null;
    if (after && !this.frozen) this.goTo(after);
  }

  /** A wild encounter: drop every queued move, hold the player, tell the UI. `resume()` releases the hold. */
  private startEncounter() {
    this.inEncounter = true;
    this.grassSteps = 0;
    this.stack = [];
    this.buffer = null;
    this.path = [];
    this.arrive = null;
    this.after = null;
    this.emit({ type: 'encounter' });
  }

  private startWarp(w: Warp<string>) {
    this.warping = true;
    this.stack = [];
    this.buffer = null;
    this.path = [];
    this.arrive = null;
    if (this.onWarp) this.onWarp(w);
    else this.enterRoom(w.to, w.arrive);
  }

  // ---------- simulation ----------
  get stepProgress(): number {
    return this.player.moving ? Math.min(1, this.stepT / this.stepDur) : 0;
  }
  get isFrozen(): boolean {
    return this.frozen;
  }
  get busy(): boolean {
    return this.player.moving || this.turnLeft > 0 || this.warping || this.inEncounter;
  }
  /** True when the player is completely idle: not moving, not turning, not warping, no queued path. */
  get isIdle(): boolean {
    return !this.player.moving && this.turnLeft === 0 && !this.warping && this.path.length === 0 && this.arrive === null;
  }

  update(dtMs: number) {
    if (this.buffer) {
      this.buffer.age += dtMs;
      if (this.buffer.age > BUFFER_MS) this.buffer = null;
    }
    let rem = dtMs;
    for (let guard = 0; guard < 16; guard++) {
      if (this.turnLeft > 0) {
        if (rem < this.turnLeft) {
          this.turnLeft -= rem;
          return;
        }
        rem -= this.turnLeft;
        this.turnLeft = 0;
      } else if (this.player.moving) {
        const need = this.stepDur - this.stepT;
        if (rem < need) {
          this.stepT += rem;
          return;
        }
        rem -= need;
        this.stepT = 0;
        this.player.finish();
        if (this.follower.moving) this.follower.finish();
        const w = this.grid.warpAt(this.player.x, this.player.y);
        if (w) this.startWarp(w);
        else if (this.grid.encounterAt(this.player.x, this.player.y)) {
          this.grassSteps += 1;
          if (encounterRoll(this.grassSteps, this.rng)) this.startEncounter();
        } else this.grassSteps = 0;
      } else if (!this.decide()) {
        return;
      }
    }
  }

  /** Idle: choose the next action. Returns true if a turn/step began. */
  private decide(): boolean {
    if (this.frozen || this.warping || this.inEncounter) return false;
    const p = this.player;
    const dir = this.stack[this.stack.length - 1] ?? this.buffer?.dir ?? null;
    if (dir) {
      this.buffer = null;
      if (dir !== p.facing) {
        p.facing = dir; // turn only
        this.turnLeft = TURN_MS;
        return true;
      }
      return this.tryStep(dir); // blocked: stay facing the wall
    }
    if (this.path.length > 0) {
      const next = this.path[0] as Pt;
      const d = dirBetween({ x: p.x, y: p.y }, next);
      if (!d || !this.grid.isWalkable(next.x, next.y)) {
        this.path = [];
        this.arrive = null;
        return false;
      }
      this.path.shift();
      p.facing = d;
      return this.tryStep(d);
    }
    if (this.arrive) {
      const a = this.arrive;
      this.arrive = null;
      p.facing = a.face;
      if (a.interact) this.interact();
    }
    return false;
  }

  private tryStep(dir: Dir): boolean {
    const p = this.player;
    const nx = p.x + DIR_VEC[dir].dx;
    const ny = p.y + DIR_VEC[dir].dy;
    if (!this.grid.isWalkable(nx, ny)) return false;
    this.stepDur = this.run ? RUN_MS : WALK_MS;
    this.stepT = 0;
    // The follower always steps onto the tile the player is leaving, in lock-step.
    // If the player steps onto the follower tile this is a swap.
    const f = this.follower;
    f.facing = dirBetween({ x: f.x, y: f.y }, { x: p.x, y: p.y }) ?? f.facing;
    f.begin(p.x, p.y);
    p.begin(nx, ny);
    return true;
  }

  // ---------- view ----------
  playerView(): ActorView {
    const pr = this.stepProgress;
    const pos = this.player.posAt(pr);
    let col = 1;
    if (this.player.moving && pr >= STAND_IN && pr < STAND_OUT) col = this.player.parity === 0 ? 0 : 2;
    return { ...pos, facing: this.player.facing, col };
  }
  followerView(): ActorView {
    const pr = this.stepProgress;
    const pos = this.follower.posAt(pr);
    return { ...pos, facing: this.follower.facing, col: this.follower.moving && pr >= 0.5 ? 1 : 0 };
  }
}
