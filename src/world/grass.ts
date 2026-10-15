/**
 * Tall-grass field effects, as pure logic (no Pixi): which tiles rustle, which frame they show, and which tiles draw the
 * blade tips over an actor's legs. `grassView.ts` draws it; `render.ts` feeds it the actors each tick.
 *
 * A rustle starts when an actor ENTERS a grass tile: its settled tile (`Actor.settled`: the tile it is stepping onto)
 * changes to one. Room changes (a warp) never rustle. Frames 1..n play `frameMs` each, then the tile rests (frame 0).
 */
export interface Pt {
  x: number;
  y: number;
}
export interface Rustle extends Pt {
  /** ms since the step began */
  t: number;
}

/** The rustle frame at `t` ms: 1..frames while it plays, 0 once it has finished (the tile at rest). */
export function rustleFrame(t: number, frames: number, frameMs: number): number {
  if (t < 0 || t >= frames * frameMs) return 0;
  return 1 + Math.floor(t / frameMs);
}

/**
 * The tiles whose blade tips cover an actor at view position `v` (tile units, fractional while moving): the tile its feet
 * are in or entering. Horizontally both tiles the sprite spans; vertically the LOWER tile (ceil), so walking down the tips
 * rise over the feet as they enter, walking up the legs come out of the old tile and the new one covers them on arrival
 * (never a band across the body mid-step).
 */
export function tipsTiles(v: Pt): Pt[] {
  const y = Math.ceil(v.y - 1e-6);
  const x0 = Math.floor(v.x + 1e-6);
  const x1 = Math.ceil(v.x - 1e-6);
  return x0 === x1 ? [{ x: x0, y }] : [{ x: x0, y }, { x: x1, y }];
}

export class GrassFx {
  private last: (Pt & { room: string })[] = [];
  /** active rustles, keyed by tile ("x,y"); a new step onto a rustling tile restarts it */
  readonly rustles = new Map<string, Rustle>();

  constructor(
    readonly frames: number,
    readonly frameMs: number,
  ) {}

  /**
   * One tick. `actors` = each actor's settled tile, in a stable order (player, follower). `isGrass` answers for the room
   * being shown. `still` (prefers-reduced-motion): nothing rustles.
   */
  update(dt: number, room: string, actors: Pt[], isGrass: (x: number, y: number) => boolean, still: boolean) {
    for (const [k, r] of this.rustles) {
      r.t += dt;
      if (r.t >= this.frames * this.frameMs) this.rustles.delete(k);
    }
    actors.forEach((a, i) => {
      const prev = this.last[i];
      const moved = prev && prev.room === room && (prev.x !== a.x || prev.y !== a.y);
      if (prev && prev.room !== room) this.rustles.clear();
      if (moved && !still && isGrass(a.x, a.y)) this.rustles.set(`${a.x},${a.y}`, { x: a.x, y: a.y, t: 0 });
      this.last[i] = { room, x: a.x, y: a.y };
    });
    if (still) this.rustles.clear();
  }

  /** the frame a tile shows now (0 = at rest) */
  frameAt(x: number, y: number): number {
    const r = this.rustles.get(`${x},${y}`);
    return r ? rustleFrame(r.t, this.frames, this.frameMs) : 0;
  }
}
