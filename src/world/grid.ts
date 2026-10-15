export type Dir = 'down' | 'left' | 'up' | 'right';
export const DIRS: readonly Dir[] = ['down', 'left', 'up', 'right'];
export const DIR_VEC: Record<Dir, { dx: number; dy: number }> = {
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
};
export const OPPOSITE: Record<Dir, Dir> = { down: 'up', up: 'down', left: 'right', right: 'left' };

export interface Pt {
  x: number;
  y: number;
}

export const TILE = 16;
/** The room (14 x 10 tiles). Grid coordinates are ROOM-local: (0,0) is the room's top-left tile. */
export const COLS = 14;
export const ROWS = 10;
export const ROOM_W = COLS * TILE; // 224
export const ROOM_H = ROWS * TILE; // 160
/** The DS top screen is always 256 x 192 native px; the room is centred in it and the rest is the dark surround. */
export const SCREEN_W = 256;
export const SCREEN_H = 192;
export const ROOM_X = (SCREEN_W - ROOM_W) / 2; // 16: where the room's left edge sits on the screen
export const ROOM_Y = (SCREEN_H - ROOM_H) / 2; // 16
export const WALL_ROWS = 2;

/** A warm light pool emitted by an object or decor piece at night.
 *  The renderer draws stepped dithered shapes that REVEAL the room through the tint
 *  (floor repaint at high alpha) plus a low-alpha colour wash on top.
 */
export interface LightSource {
  /** object id (furniture) OR decor slot name (decor), used for validation only */
  ref: string;
  /** floor patch centre in room tile coords (where the light LANDS, not the source) */
  cx: number;
  cy: number;
  /** half-width of the floor patch in tiles (the patch is a flattened 2:1 ellipse) */
  rx: number;
  /** half-height of the floor patch in tiles (typically rx/2 for a floor ellipse) */
  ry: number;
  /** colour wash applied inside the patch: warm amber for lamps, cool blue for moon/screens.
   *  Alpha is low (0.10–0.18) — just a colour cast, never white. */
  color: number;
  /** wash alpha (0.10–0.18 for soft, 0.18–0.25 for strong) */
  washAlpha: number;
  /** 'ellipse' = normal floor pool; 'moon' = window-shaped parallelogram */
  shape: 'ellipse' | 'moon';
  /** if true, the wash alpha varies ±20% per frame (subtle TV flicker) */
  flicker?: boolean;
  /**
   * if true, a periodic cloud-pass animation dims this patch to ~35% over ~2 s,
   * holds 1.5–3 s, then restores over ~2 s (every 30–60 s, randomly).
   * Only moon-light patches should have this; see src/world/cloud.ts.
   * Static (factor=1) under prefers-reduced-motion or during daytime.
   */
  cloud?: boolean;
}

export interface Furniture {
  /** interaction id, if this piece is an interactable object */
  id: string | null;
  label: string;
  /** asset slot in assets.json (art, or a placeholder block) */
  slot: string;
  /** footprint in tiles (art is bottom-centre anchored on it and may overhang above) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** blocks movement */
  solid: boolean;
  /** draws the eye on arrival (soft pulsing glow) until it has been opened once this visit */
  emphasis?: boolean;
}

/**
 * THE bedroom object table (all 7 bedroom objects are laid out; follow-up PRs do NOT edit it). Room is 14 x 10 tiles, back wall = rows 0-1.
 * Grouped by Common Region: tech at the desk (PC, monitor: x8-11 back wall), commit log (next to bookshelf, x2 back wall),
 * town map on the back wall (x5-6), rest (bed, left wall), music (piano, back-right corner), gym (bottom-right corner).
 * Per-object content lives in src/content/objects/<id>.ts. Pure decoration is NOT here: see DECOR.
 */
const BEDROOM_FURNITURE: readonly Furniture[] = [
  { id: 'bed', label: 'Bed', slot: 'object.bed', x: 0, y: 4, w: 2, h: 2, solid: true },
  { id: 'pc', label: 'PC', slot: 'object.pc', x: 8, y: 2, w: 2, h: 1, solid: true, emphasis: true },
  { id: 'piano', label: 'Piano', slot: 'object.piano', x: 12, y: 2, w: 2, h: 1, solid: true },
  // Commit log sits next to the bookshelf (x:0-1, y:2), clearly separate from the desk (PC+monitor at x:8-11).
  { id: 'journal', label: 'Commit log', slot: 'object.journal', x: 2, y: 2, w: 1, h: 1, solid: true },
  { id: 'monitor', label: 'Monitor', slot: 'object.monitor', x: 10, y: 2, w: 2, h: 1, solid: true },
  // wall object: its tiles are in the wall rows; interact from the tile below, facing up
  { id: 'townmap', label: 'Map', slot: 'object.townmap', x: 5, y: 1, w: 2, h: 1, solid: false },
  // Gym bench: footprint is only the visible bottom row (y:9, h:1) so the player stands at y:8 adjacent
  // to the bench art, not a full tile above it. Art is 48x32 and bottom-centre-anchored; the top 16px
  // overhang above the footprint and go to the foreground layer (player walks behind them), so y:8 at
  // x:11-13 is walkable behind the bench's upper half.
  { id: 'gym', label: 'Gym', slot: 'object.gym', x: 11, y: 9, w: 3, h: 1, solid: true },
];

/** A non-interactive room decoration. No id, no sparkle cue, never opens anything. */
export interface Decor {
  label: string;
  /** asset slot `decor.*` in assets.json */
  slot: string;
  /** footprint in tiles (art is bottom-centre anchored on it and may overhang above, like furniture) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** blocks movement (only where the piece physically stands on the floor; rugs and wall pieces are not solid) */
  solid: boolean;
  /** nudge the art down (+) or up (-) by this many native px, e.g. a window sitting above the baseboard */
  dy?: number;
  /** stays bright at night (moonlit window): drawn again above the night tint, tinted blue-ish */
  lit?: boolean;
  /**
   * reaction id: this piece reacts to A / a tap without being an object (no id, no bag slot, not counted in the 7-per-room cap);
   * content in src/content/reactions/<id>.ts; several pieces may share one id
   */
  react?: string;
  /** tall grass: every step onto one of its tiles counts toward a wild encounter (see Game) */
  encounter?: boolean;
}

/** Room-local instance key of a decor piece (its top-left tile). Two reactive pieces never share a tile (a content test checks). */
export function decorKey(d: { x: number; y: number }): string {
  return `${d.x},${d.y}`;
}

/** A reactive decor piece of a grid: its reaction id, instance key and footprint. */
export interface Reactive {
  id: string;
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Decoration table, separate from FURNITURE. Same layering as furniture: solid pieces split at the footprint so the player walks
 * behind the tall part. Order = draw order (rugs first). Must never cover a standing spot (a unit test checks).
 */
const BEDROOM_DECOR: readonly Decor[] = [
  // ThatsSoWitty blue rug, 64x38 in the 64x48 footprint: dy -5 lifts it so 5 px of floor shows above and below
  { label: 'Rug', slot: 'decor.rug', x: 5, y: 5, w: 4, h: 3, solid: false, dy: -5 },
  // the stairs down (a warp, see ROOMS.bedroom.warps). 1x1 footprint on the warp tile only.
  { label: 'Stairs down', slot: 'decor.stairs-down', x: 2, y: 9, w: 1, h: 1, solid: false },
  { label: 'Window', slot: 'decor.window', x: 2, y: 0, w: 3, h: 2, solid: false, dy: -4, lit: true },
  { label: 'Bookshelf', slot: 'decor.bookshelf', x: 0, y: 2, w: 2, h: 1, solid: true },
  { label: 'Plant', slot: 'decor.plant', x: 13, y: 5, w: 1, h: 1, solid: true, react: 'plant' },
  { label: 'Plant', slot: 'decor.plant', x: 0, y: 9, w: 1, h: 1, solid: true, react: 'plant' },
];

const BEDROOM_START: Pt & { facing: Dir } = { x: 7, y: 7, facing: 'down' };

export type RoomId = 'bedroom' | 'downstairs' | 'yard';

/** A tile that takes the player to another room (stairs). It is walkable, never a standing spot, and sits under non-solid decor. */
export interface Warp<R extends string = RoomId> {
  x: number;
  y: number;
  to: R;
  /** where the player lands in the other room (a walkable tile that is not itself a warp) */
  arrive: Pt & { facing: Dir };
}

export interface RoomPalette {
  /** the two floor checker tones */
  floor: readonly [number, number];
  /** back wall: body, top band, baseboard */
  wall: { main: number; top: number; base: number };
}

/** One room of the house. All rooms are COLS x ROWS tiles with WALL_ROWS of back wall, so the screen maths never change. */
export interface Room {
  id: RoomId;
  /** shown in the bottom screen's location line */
  label: string;
  furniture: readonly Furniture[];
  decor: readonly Decor[];
  warps: readonly Warp[];
  start: Pt & { facing: Dir };
  floor: RoomPalette['floor'];
  wall: RoomPalette['wall'];
  /** light pools shown at night; each references a furniture id or decor slot */
  lights: readonly LightSource[];
  /**
   * Override for the night tint opacity in this room (0–1).
   * Default (undefined) = NIGHT_ALPHA from fx.ts.
   * Rooms with lighter floor palettes (e.g. downstairs cream tiles) need a higher value
   * so they read as equally dark as the bedroom at night.
   */
  nightAlpha?: number;
}

/**
 * Downstairs (14 x 10, back wall = rows 0-1): kitchen and living room. Objects: fridge, TV, corkboard (back wall), Mom.
 * Stairs up at (12,2) lead to the bedroom's (2,8). The door mat lies at the front door (bottom wall).
 */
const DOWNSTAIRS_FURNITURE: readonly Furniture[] = [
  { id: 'fridge', label: 'Fridge', slot: 'object.fridge', x: 4, y: 2, w: 1, h: 1, solid: true },
  { id: 'tv', label: 'TV', slot: 'object.tv', x: 9, y: 2, w: 2, h: 1, solid: true },
  // wall object: its tiles are in the wall rows; interact from the tile below, facing up
  { id: 'corkboard', label: 'Photos', slot: 'object.corkboard', x: 6, y: 1, w: 3, h: 1, solid: false },
  { id: 'mom', label: 'Mom', slot: 'object.mom', x: 5, y: 5, w: 1, h: 1, solid: true },
];

const DOWNSTAIRS_DECOR: readonly Decor[] = [
  { label: 'Rug', slot: 'decor.rug-beige', x: 8, y: 4, w: 4, h: 3, solid: false, dy: -5 },
  // Stairs up: warp at (12,2). 1x1 footprint on the warp tile only.
  { label: 'Stairs up', slot: 'decor.stairs-up', x: 12, y: 2, w: 1, h: 1, solid: false },
  { label: 'Door mat', slot: 'decor.door-mat', x: 6, y: 9, w: 1, h: 1, solid: false },
  // Kitchen: one counter line on the back wall (rows 1-2): sink x 0-1, stove x 2-3, fridge x 4.
  { label: 'Sink', slot: 'decor.sink', x: 0, y: 1, w: 2, h: 2, solid: true },
  { label: 'Stove', slot: 'decor.stove', x: 2, y: 1, w: 2, h: 2, solid: true },
  { label: 'Table', slot: 'decor.table', x: 2, y: 5, w: 3, h: 2, solid: true },
  { label: 'Plant', slot: 'decor.plant', x: 0, y: 9, w: 1, h: 1, solid: true, react: 'plant' },
  { label: 'Plant', slot: 'decor.plant', x: 13, y: 9, w: 1, h: 1, solid: true, react: 'plant' },
];

// ---------------------------------------------------------------------------
// Light sources: declared per-room; each refs a furniture id or decor slot.
// radius is in tiles; colour is a warm/cool hex; flicker = subtle variation.
// ---------------------------------------------------------------------------
// Light floor patches: each is a flattened ellipse (or moon shape) centred where
// the light LANDS on the floor — 1-2 tiles below the source object.
// rx = half-width, ry = half-height (ry ~ rx/2 for a floor perspective ellipse).
// washAlpha: 0.10-0.18 = soft colour cast, never opaque/white.
const BEDROOM_LIGHTS: readonly LightSource[] = [
  // Moonlight: full width of the window (window x2-4, 3 tiles wide) but short (1–1.5 tiles tall).
  // Centred at x=3.5 (window midpoint), y=3.2 (just below the wall), cool blue, stepped/dithered.
  // washAlpha 0.45 so the cool blue is unmistakable (reveal is kept low at 0.30 so the wash hue dominates).
  // cloud: true → periodic 2s dim to 35% every 30–60 s, simulating a cloud crossing the moon.
  { ref: 'decor.window', cx: 3.5, cy: 3.2, rx: 1.5, ry: 0.7, color: 0x88aaff, washAlpha: 0.45, shape: 'moon', flicker: false, cloud: true },
];

const DOWNSTAIRS_LIGHTS: readonly LightSource[] = [
  // TV: a soft screen glow below the CRT (tv at x9-10, y2).
  // Reduced rx/ry and washAlpha vs the old values to avoid a hard visible block on the floor.
  // The ellipse shape already dithers its outer two bands; the inner band reveal alpha (0.48)
  // is kept as-is so the glow reads against the dark floor at night without blowing out.
  { ref: 'tv', cx: 10.0, cy: 3.5, rx: 0.9, ry: 0.4, color: 0xaaccff, washAlpha: 0.14, shape: 'ellipse', flicker: true },
];

/**
 * The front yard (14 x 10, rows 0-1 = the front of the house: roof, siding, the door). Out the front door (the mat downstairs at (6,9)).
 * Objects: the mailbox (contact) and the sign. Tall grass on both sides of the path rolls a wild encounter (the recruiter battle).
 */
const YARD_FURNITURE: readonly Furniture[] = [
  { id: 'mailbox', label: 'Mailbox', slot: 'object.mailbox', x: 8, y: 3, w: 1, h: 1, solid: true },
  { id: 'sign', label: 'Sign', slot: 'object.sign', x: 4, y: 3, w: 1, h: 1, solid: true },
];

const YARD_DECOR: readonly Decor[] = [
  // drawn first (like rugs): the lawn over rows 2-9, the path from the door to the street, and the two grass patches
  { label: 'Lawn', slot: 'decor.lawn', x: 0, y: 2, w: 14, h: 8, solid: false },
  { label: 'Path', slot: 'decor.path', x: 6, y: 3, w: 1, h: 7, solid: false },
  { label: 'Tall grass', slot: 'decor.grass', x: 0, y: 4, w: 5, h: 6, solid: false, encounter: true },
  { label: 'Tall grass', slot: 'decor.grass', x: 9, y: 4, w: 5, h: 6, solid: false, encounter: true },
  // the front door on the house wall; the mat below it is the warp back inside
  { label: 'Front door', slot: 'decor.door', x: 6, y: 0, w: 1, h: 2, solid: false },
  { label: 'Door mat', slot: 'decor.door-mat', x: 6, y: 2, w: 1, h: 1, solid: false },
  { label: 'Window', slot: 'decor.window', x: 1, y: 0, w: 3, h: 2, solid: false, dy: -4, lit: true },
  { label: 'Window', slot: 'decor.window', x: 10, y: 0, w: 3, h: 2, solid: false, dy: -4, lit: true },
  // trees frame the house (1x1 footprints, canopies overhang onto the wall)
  { label: 'Tree', slot: 'decor.tree', x: 0, y: 2, w: 1, h: 1, solid: true },
  { label: 'Tree', slot: 'decor.tree', x: 1, y: 2, w: 1, h: 1, solid: true },
  { label: 'Tree', slot: 'decor.tree', x: 12, y: 2, w: 1, h: 1, solid: true },
  { label: 'Tree', slot: 'decor.tree', x: 13, y: 2, w: 1, h: 1, solid: true },
];

const YARD_LIGHTS: readonly LightSource[] = [
  // porch light: a warm pool on the doorstep at night
  { ref: 'decor.door', cx: 6.5, cy: 2.6, rx: 1.2, ry: 0.6, color: 0xffd080, washAlpha: 0.2, shape: 'ellipse' },
];

export const ROOMS: Record<RoomId, Room> = {
  bedroom: {
    id: 'bedroom',
    label: "Ayush's room",
    furniture: BEDROOM_FURNITURE,
    decor: BEDROOM_DECOR,
    // (2,9) stairs down -> downstairs (12,3), facing down (away from the stairs up)
    warps: [{ x: 2, y: 9, to: 'downstairs', arrive: { x: 12, y: 3, facing: 'down' } }],
    start: BEDROOM_START,
    floor: [0xc9a87c, 0xc4a278],
    wall: { main: 0x7a8cb8, top: 0x65769f, base: 0x4a5878 },
    lights: BEDROOM_LIGHTS,
  },
  downstairs: {
    id: 'downstairs',
    label: 'Downstairs',
    furniture: DOWNSTAIRS_FURNITURE,
    decor: DOWNSTAIRS_DECOR,
    warps: [
      // (12,2) stairs up -> bedroom (2,8), facing up (away from the stairs down)
      { x: 12, y: 2, to: 'bedroom', arrive: { x: 2, y: 8, facing: 'up' } },
      // (6,9) the door mat -> the front yard (6,3), facing down (away from the door)
      { x: 6, y: 9, to: 'yard', arrive: { x: 6, y: 3, facing: 'down' } },
    ],
    start: { x: 7, y: 7, facing: 'down' },
    floor: [0xd6c9a4, 0xd0c39e],
    wall: { main: 0xc2a67c, top: 0xad9066, base: 0x7d6446 },
    lights: DOWNSTAIRS_LIGHTS,
    // Downstairs has lighter cream floor tiles (0xd6c9a4) that stay visibly bright under the
    // default tint. Boost nightAlpha so it reads as equally dark as the bedroom.
    nightAlpha: 0.72,
  },
  yard: {
    id: 'yard',
    label: 'Front yard',
    furniture: YARD_FURNITURE,
    decor: YARD_DECOR,
    // (6,2) the door mat -> downstairs (6,8), facing up (away from the door mat)
    warps: [{ x: 6, y: 2, to: 'downstairs', arrive: { x: 6, y: 8, facing: 'up' } }],
    start: { x: 6, y: 5, facing: 'down' },
    floor: [0x90e08a, 0x8adc84], // the lawn art's own greens (the tile covers rows 2-9; this shows under the house front and at night)
    // the house front: red roof edge, cream siding, a stone foundation
    wall: { main: 0xe0d0a8, top: 0xa84838, base: 0x807868 },
    lights: YARD_LIGHTS,
  },
};

/** The bedroom's tables, kept under their old names: existing imports keep working. */
export const FURNITURE = ROOMS.bedroom.furniture;
export const DECOR = ROOMS.bedroom.decor;
export const PLAYER_START = ROOMS.bedroom.start;
/** Every object of every room (ids are unique across the house). */
export const ALL_FURNITURE: readonly Furniture[] = Object.values(ROOMS).flatMap((r) => r.furniture);

export function roomOf(id: RoomId): Room {
  return ROOMS[id];
}
/** The room that holds object `id`, or null. */
export function roomOfObject(id: string): RoomId | null {
  for (const r of Object.values(ROOMS)) if (r.furniture.some((f) => f.id === id)) return r.id;
  return null;
}
/** The warp on tile (x, y) of `room`, or null. */
export function warpAt(room: Room, x: number, y: number): Warp | null {
  return room.warps.find((w) => w.x === x && w.y === y) ?? null;
}

export interface Grid {
  cols: number;
  rows: number;
  inBounds(x: number, y: number): boolean;
  isWalkable(x: number, y: number): boolean;
  /** interactable object id occupying this tile, or null */
  objectAt(x: number, y: number): string | null;
  /** all tiles belonging to an object id */
  tilesOf(id: string): Pt[];
  /** every warp (stairs) in this room */
  warps: readonly Warp<string>[];
  /** the warp (stairs) on this tile, or null */
  warpAt(x: number, y: number): Warp<string> | null;
  /** the reactive decor piece (`Decor.react`) occupying this tile, or null */
  reactAt(x: number, y: number): Reactive | null;
  /** every reactive decor piece of this grid, in decor order */
  reactives: readonly Reactive[];
  /** true on a tall-grass tile (decor with `encounter`) */
  encounterAt(x: number, y: number): boolean;
}

export function createGrid(
  furniture: readonly Furniture[] = FURNITURE,
  cols = COLS,
  rows = ROWS,
  wallRows = WALL_ROWS,
  decor: readonly Decor[] = DECOR,
  warps: readonly Warp<string>[] = [],
): Grid {
  const blocked = new Array<boolean>(cols * rows).fill(false);
  const objects = new Array<string | null>(cols * rows).fill(null);
  for (let y = 0; y < wallRows; y++) for (let x = 0; x < cols; x++) blocked[y * cols + x] = true;
  for (const f of furniture) {
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) {
        if (f.solid) blocked[y * cols + x] = true;
        if (f.id) objects[y * cols + x] = f.id;
      }
    }
  }
  const reacts = new Array<Reactive | null>(cols * rows).fill(null);
  const reactives: Reactive[] = [];
  const grass = new Array<boolean>(cols * rows).fill(false);
  for (const d of decor) {
    if (d.react) {
      const r: Reactive = { id: d.react, key: decorKey(d), label: d.label, x: d.x, y: d.y, w: d.w, h: d.h };
      reactives.push(r);
      for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) if (x >= 0 && y >= 0 && x < cols && y < rows) reacts[y * cols + x] = r;
    }
    for (let y = d.y; y < d.y + d.h; y++)
      for (let x = d.x; x < d.x + d.w; x++) {
        if (d.solid) blocked[y * cols + x] = true;
        if (d.encounter) grass[y * cols + x] = true;
      }
  }
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  return {
    cols,
    rows,
    inBounds,
    isWalkable: (x, y) => inBounds(x, y) && !blocked[y * cols + x],
    objectAt: (x, y) => (inBounds(x, y) ? (objects[y * cols + x] ?? null) : null),
    warps,
    warpAt: (x, y) => warps.find((w) => w.x === x && w.y === y) ?? null,
    reactAt: (x, y) => (inBounds(x, y) ? (reacts[y * cols + x] ?? null) : null),
    reactives,
    encounterAt: (x, y) => inBounds(x, y) && !!grass[y * cols + x],
    tilesOf(id) {
      const out: Pt[] = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (objects[y * cols + x] === id) out.push({ x, y });
      return out;
    },
  };
}

export function createRoomGrid(room: Room): Grid {
  return createGrid(room.furniture, COLS, ROWS, WALL_ROWS, room.decor, room.warps);
}

export function listObjects(room: RoomId = 'bedroom'): { id: string; label: string }[] {
  return ROOMS[room].furniture.filter((f) => f.id).map((f) => ({ id: f.id as string, label: f.label }));
}

/** Reactive decor of a room (`Decor.react`): reaction id, label and room-local instance key. Not objects: no bag slot. */
export function listReactive(room: RoomId = 'bedroom'): { id: string; label: string; key: string }[] {
  return ROOMS[room].decor.filter((d) => d.react).map((d) => ({ id: d.react as string, label: d.label, key: decorKey(d) }));
}

/** The tile in front of an object (and the facing toward it), e.g. for deep links. */
export function standingSpotFor(grid: Grid, id: string): (Pt & { facing: Dir }) | null {
  const order: Dir[] = ['down', 'left', 'right', 'up'];
  for (const t of grid.tilesOf(id)) {
    for (const d of order) {
      const x = t.x + DIR_VEC[d].dx;
      const y = t.y + DIR_VEC[d].dy;
      if (grid.isWalkable(x, y)) return { x, y, facing: OPPOSITE[d] };
    }
  }
  return null;
}
