import { Application, Assets, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { getAsset, getObjectAsset, getEmoteAsset } from '../assets/useAsset';
import { Fx, NIGHT_ALPHA, spiralOrder } from './fx';
import { Game, RUN_MS, type ActorView, type WorldEvent } from './actors';
import { CloudPass } from './cloud';
import { DIRS, DIR_VEC, ROOMS, decorKey, roomOfObject, standingSpotFor, SCREEN_H, SCREEN_W, ROOM_H, ROOM_W, ROOM_X, ROOM_Y, TILE, COLS, ROWS, WALL_ROWS, createRoomGrid, type Dir, type Grid, type LightSource, type Room, type RoomId } from './grid';
import { bindKeyboard } from './input';
import { applyStackLayout } from './layout';
import { DROP_ARC_MS, DROP_TOTAL_MS, dropLanding, dropPos } from './drop';
import { Tour, bindTourCancelListeners, tourShouldRun, tourWaitMs } from './tour';
import { buildGrassView, type GrassView } from './grassView';
import { nightMatrix } from './nightTint';
import { lightPatchRects } from './light';

/**
 * Named child indices for the layers inside each RoomView container (back to front).
 * Exported so tests can lock in the order: light reveal/wash and the moonlit window copies (litLayer) must be BELOW the
 * spriteLayer and fg (actors and tall pieces such as trees stand in front of a window) but ABOVE the night tint.
 * Container.addChild order in buildRoomView must stay in sync with these indices.
 */
export const LAYER_ORDER = {
  bg: 0,
  tintLayer: 1,
  revealLayer: 2,
  washLayer: 3,
  litLayer: 4,
  spriteLayer: 5,
  fgLayer: 6,
  cueLayer: 7,
} as const;

/**
 * Pure function: compute which animation frame index to show for an ambient-animated slot.
 *
 * @param opts.nightOnly  - if true, loop only runs at night; day shows dayFrame static
 * @param opts.dayFrame   - frame index for the day-static pose (required when nightOnly=true)
 * @param opts.frames     - total number of frames in the strip
 * @param opts.isNight    - current day/night state
 * @param opts.rm         - prefers-reduced-motion
 * @param opts.clock      - elapsed ms (for the forward loop modulus)
 * @param opts.frameMs    - ms per frame
 *
 * For nightOnly slots:
 *   - day:              → dayFrame (static OFF/idle)
 *   - night + rm:       → 0       (static ON/base, no flicker)
 *   - night + motion:   → clock-driven loop over all frames EXCEPT dayFrame.
 *                          The loop indices are [0, 1, … frames-1] minus dayFrame, in order.
 * For normal slots (nightOnly=false/undefined):
 *   - rm:               → null    (caller skips; original behaviour: no static fallback)
 *   - motion:           → clock % frames
 */
export function ambientFrameIndex(opts: {
  nightOnly?: boolean;
  dayFrame?: number;
  frames: number;
  isNight: boolean;
  rm: boolean;
  clock: number;
  frameMs: number;
}): number | null {
  const { nightOnly, dayFrame, frames, isNight, rm, clock, frameMs } = opts;
  if (nightOnly) {
    const df = dayFrame ?? frames - 1;
    if (!isNight) return df;
    if (rm) return 0;
    // Night loop: cycle through all frames except dayFrame, in index order.
    // Build the ordered list of night-loop frame indices (all except df).
    const loopCount = frames - 1; // one frame excluded
    const step = Math.floor(clock / frameMs) % loopCount;
    // Map step → actual frame index, skipping df
    return step < df ? step : step + 1;
  }
  if (rm) return null; // non-nightOnly: skip under reduced motion
  return Math.floor(clock / frameMs) % frames;
}

export interface WorldHandle {
  game: Game;
  getDebug(): { dpr: number; scale: number; fps: number };
  /** ?debug only: tall-grass effect state of the room shown (tiles rustling with their frame, tiles drawing tips) */
  getGrass(): ReturnType<GrassView['debug']>;
  /** fade out, toggle day/night, fade in */
  rest(): Promise<void>;
  /** loop an object's animation frames (ping-pong, ~500ms per rep) for `ms`, ending on frame 0 */
  playObjectAnim(objectId: string, ms: number): Promise<void>;
  isNight(): boolean;
  /** Current tour state: 'off' when the tour is not enabled on this load, else the Tour's stateForTest value. */
  getTourState(): 'off' | 'waiting' | 'walking' | 'pausing' | 'returning' | 'done' | 'cancelled';
  /**
   * Show an emote bubble above an actor for `ms` milliseconds, then hide it.
   * Pop-in animation over ~150 ms; static under prefers-reduced-motion.
   * Slot must be an `emote.*` key in assets.json.
   */
  showEmote(actor: 'player' | 'follower', slot: string, ms: number): void;
  /**
   * A reactive decor piece (`key` = its decorKey) reacts: its frames ping-pong for `ms` and, with `burst` (#rrggbb), a shower of
   * 2x2 px drops falls onto it. Resolves when both are done; at once under prefers-reduced-motion.
   * With `drop` ({ slot: an `item.*` slot }) the item then pops out of the piece and lands beside it (a static sprite under reduced motion);
   * it stays up while the world is frozen (the dialogue) and fades out once the world resumes. `container.dataset.drop` = the slot meanwhile.
   */
  playReaction(key: string, opts: { ms: number; burst?: string; drop?: { slot: string } }): Promise<void>;
  /** Wild encounter: blink twice, spiral to black, stay black. Resolves once black (at once under reduced motion). */
  startWipe(): Promise<void>;
  /** After a battle: fade the world back in from black. */
  clearWipe(): Promise<void>;
  /** true when the follower spawned shiny on this page load */
  isShiny(): boolean;
  destroy(): void;
}

type Sheet = Record<Dir, Texture[]>;

async function loadSheet(slot: 'sprite.player' | 'sprite.follower' | 'sprite.follower-shiny'): Promise<Sheet> {
  const meta = getAsset(slot);
  const base = await Assets.load<Texture>(meta.path);
  base.source.scaleMode = 'nearest';
  const sheet = {} as Sheet;
  meta.rowOrder.forEach((dir, r) => {
    const frames: Texture[] = [];
    for (let c = 0; c < meta.cols; c++) {
      frames.push(new Texture({ source: base.source, frame: new Rectangle(c * meta.cell, r * meta.cell, meta.cell, meta.cell) }));
    }
    sheet[dir as Dir] = frames;
  });
  return sheet;
}

const px = (tiles: number) => tiles * TILE;
const hex = (c: string) => parseInt(c.replace('#', ''), 16);

/** The dark surround outside the room (the DS top screen is bigger than the room), with a wall frame like HGSS interiors. */
function drawSurround(): Graphics {
  const g = new Graphics();
  g.rect(0, 0, SCREEN_W, SCREEN_H).fill(0x101018);
  g.rect(ROOM_X - 4, ROOM_Y - 4, ROOM_W + 8, ROOM_H + 8).fill(0x2c3150); // outer wall frame
  g.rect(ROOM_X - 4, ROOM_Y - 4, ROOM_W + 8, 2).fill(0x4a5078); // frame highlight
  g.rect(ROOM_X - 2, ROOM_Y - 2, ROOM_W + 4, ROOM_H + 4).fill(0x181c30); // inner lip: the room sits in a shadowed recess
  return g;
}

/** Floor + walls in the room's palette, in room-local px. Furniture and decor are added by addObjects. */
function drawRoom(room: Room): Graphics {
  const bg = new Graphics();
  // floor, 2-tone checker so tile edges are visible
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      bg.rect(px(x), px(y), TILE, TILE).fill((x + y) % 2 === 0 ? room.floor[0] : room.floor[1]);
    }
  }
  // walls: top two rows
  bg.rect(0, 0, ROOM_W, px(WALL_ROWS)).fill(room.wall.main);
  bg.rect(0, 0, ROOM_W, TILE).fill(room.wall.top);
  bg.rect(0, px(WALL_ROWS) - 4, ROOM_W, 4).fill(room.wall.base); // baseboard
  return bg;
}

function drawGrid(): Graphics {
  const g = new Graphics();
  for (let x = 0; x <= COLS; x++) g.rect(px(x), 0, 1, ROOM_H).fill({ color: 0x000000, alpha: 0.18 });
  for (let y = 0; y <= ROWS; y++) g.rect(0, px(y), ROOM_W, 1).fill({ color: 0x000000, alpha: 0.18 });
  return g;
}

/**
 * Furniture from the object table + asset slots. A slot marked `placeholder` (or without art)
 * is drawn as a coloured block. Art is bottom-centre anchored on the footprint; for solid
 * pieces the part overhanging above the footprint goes to the foreground layer so the player
 * can stand "behind" it.
 */
/**
 * Animated slot (assets.json `frames` > 1, a horizontal strip of `frames` frames, each `w` wide).
 * Two ways to drive it, both generic: `frameMs` = ambient forward loop; an object action's `anim`
 * = a one-shot ping-pong played before its dialogue (see playObjectAnim in createWorld).
 */
interface AnimPart {
  sprite: Sprite;
  textures: Texture[];
}
interface PoseSlot {
  sprite: Sprite;
  textures: Texture[];
  /** where the player's feet land when walking onto the object, in room native px */
  footX: number;
  footY: number;
}
interface AnimSlot {
  frames: number;
  frameMs?: number;
  /**
   * When true: loop only runs at night; shows dayFrame (static) by day.
   * Under reduced motion: day → dayFrame, night → frame 0 (static).
   * Night loop cycles through frames 0..(frames-2) only; dayFrame is the last frame and is
   * never part of the night loop (it is excluded from the modulus).
   */
  nightOnly?: boolean;
  /** Index of the day-static frame (must be < frames). Required when nightOnly is true. */
  dayFrame?: number;
  parts: AnimPart[];
  /** scripted player pose (assets.json `pose`), if the object has one */
  pose?: PoseSlot;
}
type AnimTable = Map<string, AnimSlot>;

/** Furniture (interactable or not) and decoration share one placement + layering path. Decor has no id, so it gets no cue. */
interface Piece {
  id: string | null;
  slot: string;
  x: number;
  y: number;
  w: number;
  h: number;
  solid: boolean;
  dy?: number;
  lit?: boolean;
  /** reaction id (reactive decor only): the piece gets an anchor (sparkle) keyed by its decorKey */
  react?: string;
}
const piecesOf = (room: Room): readonly Piece[] => [...room.decor.map((d): Piece => ({ id: null, ...d })), ...room.furniture];
/** Furniture are keyed by id; decor by its room-local instance key (deterministic, and what a `react` event carries). */
const pieceKey = (f: Piece): string => f.id ?? decorKey(f);

async function addObjects(
  pieces: readonly Piece[],
  bg: Container,
  fg: Container,
): Promise<{ anchors: Map<string, Anchor>; anims: AnimTable; lit: Sprite[] }> {
  const anchors = new Map<string, Anchor>();
  const anims: AnimTable = new Map();
  const lit: Sprite[] = [];
  for (const f of pieces) {
    const asset = getObjectAsset(f.slot);
    const fx = px(f.x);
    const fy = px(f.y);
    const fw = px(f.w);
    const fh = px(f.h);
    if (asset.placeholder || !asset.path) {
      const g = new Graphics();
      const c = hex(asset.color);
      g.rect(fx, fy, fw, fh).fill(c);
      g.rect(fx, fy, fw, 3).fill({ color: 0xffffff, alpha: 0.25 });
      g.rect(fx, fy + fh - 2, fw, 2).fill({ color: 0x000000, alpha: 0.3 });
      bg.addChild(g);
      if (f.id || f.react) anchors.set(pieceKey(f), { x: fx + fw - 2, y: fy - 1, fx, fy, fw, fh, art: { x: fx, y: fy, w: fw, h: fh } });
      continue;
    }
    const base = await Assets.load<Texture>(asset.path);
    base.source.scaleMode = 'nearest';
    const left = fx + Math.floor((fw - asset.w) / 2);
    const top = fy + fh - asset.h + (f.dy ?? 0);
    const over = f.solid ? Math.max(0, asset.h - fh) : 0;
    const frames = Math.max(1, asset.frames ?? 1);
    const part = (y0: number, h: number) =>
      Array.from({ length: frames }, (_, i) => new Texture({ source: base.source, frame: new Rectangle(i * asset.w, y0, asset.w, h) }));
    const parts: AnimPart[] = [];
    const lowerTex = part(over, asset.h - over);
    const lower = new Sprite(lowerTex[0]);
    lower.position.set(left, top + over);
    bg.addChild(lower);
    parts.push({ sprite: lower, textures: lowerTex });
    if (over > 0) {
      const upperTex = part(0, over);
      const upper = new Sprite(upperTex[0]);
      upper.position.set(left, top);
      fg.addChild(upper);
      parts.push({ sprite: upper, textures: upperTex });
    }
    if (f.lit) {
      // moonlit: drawn again above the night tint (see createWorld), so it stays brighter than the room at night
      const glow = new Sprite(new Texture({ source: base.source, frame: new Rectangle(0, 0, asset.w, asset.h) }));
      glow.position.set(left, top);
      glow.tint = 0x8fb0ff;
      glow.alpha = 0;
      lit.push(glow);
    }
    // interactables AND reactive decor get an anchor: the shared sparkle cue, and the art box a reaction burst falls onto
    if (f.id || f.react) anchors.set(pieceKey(f), { x: left + asset.w - 2, y: Math.max(1, top - 1), fx, fy, fw, fh, art: { x: left, y: top, w: asset.w, h: asset.h } });
    if (frames > 1) {
      const animKey = pieceKey(f);
      let pose: PoseSlot | undefined;
      if (asset.pose && f.id) {
        // Poses are only meaningful for interactive objects (have an id)
        const pb = await Assets.load<Texture>(asset.pose.path);
        pb.source.scaleMode = 'nearest';
        const textures = Array.from({ length: asset.pose.frames }, (_, i) => new Texture({ source: pb.source, frame: new Rectangle(i * asset.pose!.w, 0, asset.pose!.w, asset.pose!.h) }));
        const sprite = new Sprite(textures[0]);
        sprite.position.set(left, top);
        sprite.visible = false;
        pose = { sprite, textures, footX: left + asset.pose.foot.x, footY: top + asset.pose.foot.y };
      }
      anims.set(animKey, { frames, frameMs: asset.frameMs, nightOnly: asset.nightOnly, dayFrame: asset.dayFrame, parts, pose });
    }
  }
  return { anchors, anims, lit };
}

/** Where an object's sparkle sits (top-right of its art) and its footprint (for the glow). */
interface Anchor {
  x: number;
  y: number;
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  /** the drawn art box (room px), which can overhang the footprint */
  art: { x: number; y: number; w: number; h: number };
}

/**
 * Generic reaction burst: N 2x2 px drops in one colour fall onto an art box (spawn 6-10 px above its top at a random x across
 * its width, fall at ~48 px/s to a random y in its upper half, respawn) until `ms` elapses. Integer native px only.
 */
const BURST_DROPS = 10;
const BURST_SPEED = 48 / 1000; // px per ms
function createBurst(art: Anchor['art'], color: number, ms: number) {
  const g = new Graphics();
  const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1)); // inclusive integers
  const spawn = () => ({
    x: art.x + rnd(0, Math.max(0, art.w - 2)),
    y: art.y - rnd(6, 10),
    stop: art.y + rnd(0, Math.max(0, Math.floor(art.h / 2) - 2)),
  });
  // stagger the first fall so the shower does not land as one row
  const drops = Array.from({ length: BURST_DROPS }, () => {
    const d = spawn();
    return { ...d, y: d.y - rnd(0, 12) };
  });
  let t = 0;
  return {
    g,
    /** advance by dt ms; true once finished (the Graphics is then empty) */
    update(dt: number): boolean {
      t += dt;
      g.clear();
      if (t >= ms) return true;
      for (const d of drops) {
        d.y += dt * BURST_SPEED;
        if (d.y >= d.stop) Object.assign(d, spawn());
        g.rect(d.x, Math.floor(d.y), 2, 2).fill(color);
      }
      return false;
    },
  };
}

/**
 * Draw one LightSource as a hard-edged, pixel-stepped patch (geometry and floor clipping: light.ts).
 *
 * Lights REVEAL the room through the tint, they don't paint on top of it. Two Graphics are stacked above the tint:
 *  1. revealG: the room's mean floor colour at a FLAT alpha per tone, cancelling part of the tint.
 *  2. washG:   a flat warm / cool colour cast on the same rects.
 * Two tones only (rim, core), no blur and no per-pixel ramp. Reveal is kept below ~0.50 so the wash hue reads and cream
 * floors don't blow out. The light never covers wall rows, solid footprints or stairs (`lightPatchRects`).
 */
const REVEAL_ALPHA = { ellipse: [0.2, 0.4], moon: [0.16, 0.3] } as const;
function buildLightPatch(light: LightSource, room: Room): { revealG: Graphics; washG: Graphics } {
  const revealG = new Graphics();
  const washG = new Graphics();
  // Average the two checker floor tones into one representative colour for the reveal.
  const [fc0, fc1] = room.floor;
  const mix = (sh: number) => ((((fc0 >> sh) & 0xff) + ((fc1 >> sh) & 0xff)) >> 1) << sh;
  const floorMid = mix(16) | mix(8) | mix(0);
  const reveal = REVEAL_ALPHA[light.shape];
  for (const r of lightPatchRects(light, room)) {
    revealG.rect(r.x, r.y, r.w, r.h).fill({ color: floorMid, alpha: reveal[r.tone] });
    washG.rect(r.x, r.y, r.w, r.h).fill({ color: light.color, alpha: light.washAlpha * (r.tone ? 1 : 0.5) });
  }
  return { revealG, washG };
}

/** A small 4-point star, drawn in native pixels, centred on (0,0). */
function drawSparkle(): Graphics {
  const g = new Graphics();
  g.rect(-1, -3, 1, 7).fill(0xfff6b0); // vertical arm
  g.rect(-3, -1, 7, 1).fill(0xfff6b0); // horizontal arm
  g.rect(-1, -1, 1, 1).fill(0xffffff); // core
  g.rect(-2, -2, 1, 1).fill({ color: 0xffffff, alpha: 0.7 });
  g.rect(1, 1, 1, 1).fill({ color: 0xffffff, alpha: 0.7 });
  return g;
}

/** Soft halo around a footprint: a few translucent growing rects. */
function drawGlow(a: Anchor): Graphics {
  const g = new Graphics();
  for (let k = 4; k >= 1; k--) {
    g.roundRect(a.fx - k * 2, a.fy - k * 2, a.fw + k * 4, a.fh + k * 4, 3 + k * 2).fill({ color: 0xfff2a0, alpha: 0.1 });
  }
  return g;
}

/** Everything one room draws. Both rooms are built at load; switching rooms toggles `visible` (nothing is rebuilt, so nothing leaks). */
interface RoomView {
  id: RoomId;
  grid: Grid;
  /** floor + sprites + foreground + cues, positioned on the top screen */
  container: Container;
  /** the player, the follower and scripted poses live here, y-sorted */
  spriteLayer: Container;
  /**
   * Per-room night tint: a full-screen dark overlay.
   * Using a per-room tint allows each room to have its own night opacity (Room.nightAlpha),
   * so lighter-floor rooms (e.g. downstairs cream tiles) can be made equally dark at night.
   */
  tintLayer: Graphics;
  /** The room's night tint opacity (from Room.nightAlpha, or NIGHT_ALPHA default). */
  roomNightAlpha: number;
  /** foreground: the parts of solid pieces above their footprint (drawn over the actors) */
  fg: Container;
  /**
   * Darkens spriteLayer and fg exactly as tintLayer darkens bg (nightTint.ts): attached only while the room's
   * overlay alpha is > 0, its matrix rebuilt only when that alpha changes.
   */
  night: { filter: ColorMatrixFilter; alpha: number };
  /** moonlit pieces, drawn above the night tint */
  litLayer: Container;
  /**
   * Reveal layer: sits ABOVE the night tint. Contains floor-coloured Graphics
   * that repaint the natural floor colour inside each light patch, cancelling
   * the tint locally — so lit areas show the room's real colours.
   */
  revealLayer: Container;
  /**
   * Wash layer: very low-alpha (0.10–0.18) colour wash above the reveal layer,
   * giving each patch the warm/cool cast of its light source.
   */
  washLayer: Container;
  /**
   * Per-LightSource pairs; same index as room.lights.
   * revealG/washG alpha driven by flicker (TV) and cloud pass (moon).
   * cloud: CloudPass instance when LightSource.cloud=true, null otherwise.
   */
  lightPairs: { revealG: Graphics; washG: Graphics; cloud: CloudPass | null }[];
  anchors: Map<string, Anchor>;
  anims: AnimTable;
  lit: Sprite[];
  sparkles: Map<string, Graphics>;
  glows: Map<string, Graphics>;
  /** sparkles and reaction bursts (above the foreground, so drops fall in front of the piece) */
  cueLayer: Container;
  /** tall-grass rustle + tips (grassView.ts), when the room has a decor patch whose slot declares `field` */
  grass: GrassView | null;
}

async function buildRoomView(room: Room, grid: Grid, debugGrid: boolean, isNight: boolean): Promise<RoomView> {
  const bg = drawRoom(room);
  const fg = new Container();
  const { anchors, anims, lit } = await addObjects(piecesOf(room), bg, fg);
  for (const a of anims.values()) if (a.pose) a.pose.sprite.zIndex = a.pose.footY + 0.02;
  if (debugGrid) bg.addChild(drawGrid());
  // discoverability: glow behind emphasised objects, one shared sparkle cue on every interactable
  const glows = new Map<string, Graphics>();
  for (const f of room.furniture) {
    const a = f.id && f.emphasis ? anchors.get(f.id) : undefined;
    if (!f.id || !a) continue;
    const g = drawGlow(a);
    g.alpha = 0;
    bg.addChildAt(g, 0); // below the art
    glows.set(f.id, g);
  }
  const cueLayer = new Container();
  const sparkles = new Map<string, Graphics>();
  for (const [id, a] of anchors) {
    const sp = drawSparkle();
    sp.position.set(a.x, a.y);
    sp.alpha = 0;
    cueLayer.addChild(sp);
    sparkles.set(id, sp);
  }
  const spriteLayer = new Container();
  spriteLayer.sortableChildren = true;
  for (const a of anims.values()) if (a.pose) spriteLayer.addChild(a.pose.sprite);
  const grass = await buildGrassView(room.decor, bg, spriteLayer);

  // Apply initial frames for nightOnly slots BEFORE the first ticker tick.
  // Without this, sprites start at frame 0 (the ON frame) even in day mode.
  for (const [, a] of anims) {
    if (!a.nightOnly || !a.frameMs) continue;
    const df = a.dayFrame ?? a.frames - 1;
    const initialFrame = isNight ? 0 : df; // night → base ON frame; day → dayFrame (OFF)
    a.parts.forEach((p) => (p.sprite.texture = p.textures[initialFrame] as Texture));
  }

  // Per-room night tint: a dark overlay that sits INSIDE the room container so that
  // sprites (player, follower, NPCs) and foreground furniture are drawn ABOVE it.
  // The tint covers the full screen by extending beyond the room in all directions.
  const roomNightAlpha = room.nightAlpha ?? NIGHT_ALPHA;
  const tintLayer = new Graphics()
    .rect(-ROOM_X, -ROOM_Y, SCREEN_W, SCREEN_H)
    .fill(0x06102e);
  tintLayer.alpha = 0;

  // Reveal + wash layers: sit ABOVE the tint but BELOW sprites and foreground.
  // revealLayer: paints the natural floor colour inside each light patch, cancelling the tint locally.
  // washLayer:   low-alpha warm/cool colour cast above the reveal.
  // Room-local coordinates (container is already offset by ROOM_X, ROOM_Y; no extra offset needed).
  const revealLayer = new Container();
  revealLayer.alpha = 0;
  const washLayer = new Container();
  washLayer.alpha = 0;
  const lightPairs: { revealG: Graphics; washG: Graphics; cloud: CloudPass | null }[] = [];
  for (const ls of room.lights) {
    const { revealG, washG } = buildLightPatch(ls, room);
    revealLayer.addChild(revealG);
    washLayer.addChild(washG);
    lightPairs.push({ revealG, washG, cloud: ls.cloud ? new CloudPass() : null });
  }

  const litLayer = new Container(); // moonlit windows: above the tint, below actors and the foreground
  for (const w of lit) litLayer.addChild(w);

  // Layer order inside the room container (back to front):
  //   bg (floor + furniture bg) → tintLayer → revealLayer → washLayer
  //   → litLayer (moonlit window copies: brighter than the night tint, but behind everything that stands in front)
  //   → spriteLayer (player, follower, NPCs, poses)
  //   → fg (foreground furniture: parts above footprint, e.g. trees over the house windows)
  //   → cueLayer (sparkles, glow cues)
  //
  // This ensures the light glow (reveal/wash) is always BELOW player sprites,
  // fixing the "glow drawn over player legs" regression present when those layers
  // lived on the stage above the room container.
  const container = new Container();
  container.position.set(ROOM_X, ROOM_Y);
  container.addChild(bg, tintLayer, revealLayer, washLayer, litLayer, spriteLayer, fg, cueLayer);

  // Night for the layers ABOVE the tint (actors, poses, grass tips, fg): the same overlay maths as a colour matrix,
  // so nothing glows on a dark floor and a tall piece shows no seam at its footprint line. Cues and litLayer stay out.
  // resolution 1 = the renderer's own (app.init resolution: 1, the backing store is in device px), so the filter pass is 1:1, no resampling
  const night = { filter: new ColorMatrixFilter({ antialias: 'off', resolution: 1 }), alpha: 0 };

  return { id: room.id, grid, container, spriteLayer, tintLayer, roomNightAlpha, fg, night, litLayer, revealLayer, washLayer, lightPairs, anchors, anims, lit, sparkles, glows, cueLayer, grass };
}

export async function createWorld(
  container: HTMLElement,
  opts: { emit: (e: WorldEvent) => void; debugGrid?: boolean; startAt?: string; startNight?: boolean; shiny?: boolean; rng?: () => number },
): Promise<WorldHandle> {
  const rooms = Object.values(ROOMS);
  const grids = new Map<RoomId, Grid>(rooms.map((r) => [r.id, createRoomGrid(r)]));
  const startRoom: RoomId = (opts.startAt ? roomOfObject(opts.startAt) : null) ?? 'bedroom';
  const spot = opts.startAt ? standingSpotFor(grids.get(startRoom) as Grid, opts.startAt) : null;
  // objects (with `emphasis`) stop glowing once opened this visit; a deep link counts as opened
  const seen = new Set<string>(opts.startAt ? [opts.startAt] : []);
  const fxState = new Fx();
  // ?night=1 / ?day=1 debug override: skip the fade, set night state immediately
  if (opts.startNight !== undefined) fxState.night = opts.startNight;
  const game = new Game(
    grids.get(startRoom) as Grid,
    spot ?? ROOMS[startRoom].start,
    (e) => {
      if (e.type === 'interact') seen.add(e.objectId);
      if (e.type === 'room') shinyBurst();
      opts.emit(e);
    },
    {
      grids,
      room: startRoom,
      rng: opts.rng,
      // fade to black, swap the room under the black, fade back in. The Game holds the player (warping) until enterRoom runs.
      onWarp: (w) => {
        void fxState.fadeThrough(() => {
          showRoom(w.to as RoomId);
          game.enterRoom(w.to, w.arrive);
        });
      },
    },
  );

  const app = new Application();
  await app.init({
    width: SCREEN_W,
    height: SCREEN_H,
    resolution: 1,
    autoDensity: false,
    antialias: false,
    roundPixels: true,
    background: 0x101018,
  });
  const canvas = app.canvas;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.touchAction = 'none';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const shiny = !!opts.shiny;
  const [playerSheet, followerSheet] = await Promise.all([loadSheet('sprite.player'), loadSheet(shiny ? 'sprite.follower-shiny' : 'sprite.follower')]);

  const views = new Map<RoomId, RoomView>();
  for (const r of rooms) {
    const v = await buildRoomView(r, grids.get(r.id) as Grid, !!opts.debugGrid, fxState.night);
    const isStart = r.id === startRoom;
    // tintLayer, revealLayer, washLayer are now inside v.container — toggled by container.visible only
    v.container.visible = isStart;
    views.set(r.id, v);
  }
  let view = views.get(startRoom) as RoomView;
  const motionMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => !!motionMq?.matches;
  let activeAnim: { id: string; t: number; ms: number; frame: number; done: () => void } | null = null;
  let ambientClock = 0;
  const ambientFrame = new Map<string, number>();
  const setFrame = (id: string, n: number) => {
    const a = view.anims.get(id);
    a?.parts.forEach((p) => (p.sprite.texture = p.textures[n] as Texture));
    if (a?.pose) a.pose.sprite.texture = a.pose.textures[Math.min(n, a.pose.textures.length - 1)] as Texture;
  };
  const playFrames = (id: string, ms: number) =>
    new Promise<void>((resolve) => {
      const a = view.anims.get(id);
      if (!a || reducedMotion() || ms <= 0) return resolve();
      activeAnim?.done();
      container.dataset.anim = id; // observable by tests / CSS, outside React
      activeAnim = { id, t: 0, ms, frame: 0, done: resolve };
    });
  // scripted poses (generic: any object whose asset slot has `pose`): tiny tween runner driven by the ticker
  let script: { update(dt: number): boolean; done(): void } | null = null;
  let override: ActorView | null = null; // the player drawn somewhere other than the game's tile (walking onto / off the bench)
  const runScript = (update: (dt: number) => boolean) =>
    new Promise<void>((resolve) => {
      script = { update, done: resolve };
    });
  const wait = (ms: number) => {
    let t = 0;
    return runScript((dt) => (t += dt) >= ms);
  };
  /** walk the player sprite between two foot points (room px) at run speed */
  const walkFoot = (from: { x: number; y: number }, to: { x: number; y: number }, face: Dir) => {
    const ms = Math.max(200, (Math.hypot(to.x - from.x, to.y - from.y) / TILE) * RUN_MS);
    let t = 0;
    return runScript((dt) => {
      t += dt;
      const k = Math.min(1, t / ms);
      const fx = from.x + (to.x - from.x) * k;
      const fy = from.y + (to.y - from.y) * k;
      override = { x: (fx - TILE / 2) / TILE, y: (fy - TILE) / TILE, facing: face, col: k >= 1 ? 1 : [0, 1, 2, 1][Math.floor(t / 90) % 4]! };
      return k >= 1;
    });
  };
  const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  const playPose = async (id: string, ms: number, pose: PoseSlot) => {
    const p = game.player.settled;
    const start = { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE };
    const bench = { x: pose.footX, y: pose.footY };
    container.dataset.anim = id; // observable by tests / CSS, outside React
    // the follower waits where it is, looking at the bench
    const f = game.follower.settled;
    game.follower.facing = dirTo(bench.x - (f.x * TILE + TILE / 2), bench.y - (f.y * TILE + TILE));
    await walkFoot(start, bench, dirTo(bench.x - start.x, bench.y - start.y)); // onto the bench
    override = null;
    playerSprite.visible = false;
    pose.sprite.visible = true;
    setFrame(id, 0);
    await wait(120); // lies down
    await playFrames(id, ms); // the reps (existing frames, ping-pong)
    container.dataset.anim = id;
    await wait(100);
    pose.sprite.visible = false;
    playerSprite.visible = true;
    await walkFoot(bench, start, dirTo(start.x - bench.x, start.y - bench.y)); // gets up, walks back
    override = null;
    delete container.dataset.anim;
  };
  const playObjectAnim = async (id: string, ms: number) => {
    const a = view.anims.get(id);
    if (!a || reducedMotion() || ms <= 0) return;
    if (a.pose) await playPose(id, ms, a.pose);
    else await playFrames(id, ms);
  };
  // reaction bursts in flight, advanced by the ticker (generic: they only know an art box and a colour)
  const bursts: { b: ReturnType<typeof createBurst>; layer: Container; done: () => void }[] = [];
  const playBurst = (key: string, color: string, ms: number) =>
    new Promise<void>((resolve) => {
      const anchor = view.anchors.get(key);
      if (!anchor) return resolve();
      const b = createBurst(anchor.art, hex(color), ms);
      view.cueLayer.addChild(b.g);
      bursts.push({ b, layer: view.cueLayer, done: resolve });
    });
  /**
   * The item a reaction dropped: one sprite on the cue layer (in front of the pieces), arcing out of the piece, then resting beside it.
   * Cleared by the ticker once the world resumes (the dialogue closed), by a new drop, or by destroy.
   */
  let dropped: { sprite: Sprite; layer: Container; t: number; from: { x: number; y: number }; to: { x: number; y: number }; fade: number; landed: () => void } | null = null;
  const clearDrop = () => {
    if (!dropped) return;
    dropped.layer.removeChild(dropped.sprite);
    dropped.sprite.destroy();
    dropped.landed();
    dropped = null;
    delete container.dataset.drop;
  };
  const DROP_FADE_MS = 200;
  const playDrop = async (key: string, slot: string, animate: boolean) => {
    const asset = getObjectAsset(slot);
    const anchor = view.anchors.get(key);
    if (!asset?.path || !anchor) return;
    const tex = await Assets.load<Texture>(asset.path);
    tex.source.scaleMode = 'nearest';
    clearDrop();
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5, 1);
    const to = dropLanding(anchor.art);
    const from = { x: anchor.art.x + Math.floor(anchor.art.w / 2), y: anchor.art.y + Math.floor(anchor.art.h / 2) };
    const start = animate ? from : to;
    sprite.position.set(start.x, start.y);
    view.cueLayer.addChild(sprite);
    container.dataset.drop = slot;
    await new Promise<void>((resolve) => {
      dropped = { sprite, layer: view.cueLayer, t: animate ? 0 : DROP_TOTAL_MS, from, to, fade: 0, landed: resolve };
      if (!animate) resolve();
    });
  };
  /** reactive decor: the slot's frames (if any) and the optional burst run together for `ms`, then the optional `drop` pops out; the motion is skipped under reduced motion */
  const playReaction = async (key: string, o: { ms: number; burst?: string; drop?: { slot: string } }) => {
    const reduced = reducedMotion();
    if (!reduced && o.ms > 0 && (view.anims.has(key) || view.anchors.has(key))) {
      container.dataset.anim = key; // observable by tests / CSS, outside React (playFrames sets it too)
      await Promise.all([playFrames(key, o.ms), o.burst ? playBurst(key, o.burst, o.ms) : Promise.resolve()]);
      if (container.dataset.anim === key) delete container.dataset.anim;
    }
    if (o.drop) await playDrop(key, o.drop.slot, !reduced);
  };
  let hoverId: string | null = null;
  const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mk = (sheet: Sheet) => new Sprite(sheet.down[0]);
  const playerSprite = mk(playerSheet);
  const followerSprite = mk(followerSheet);
  view.spriteLayer.addChild(followerSprite, playerSprite);
  // Night tint: one per room (each has its own nightAlpha override in Room.nightAlpha).
  // Per-room tints let lighter-floor rooms (e.g. downstairs cream tiles) be made
  // equally dark at night by bumping their nightAlpha higher.
  const blackout = new Graphics().rect(0, 0, SCREEN_W, SCREEN_H).fill(0x000000);
  blackout.alpha = 0;
  const allViews = [...views.values()];
  // Stage order (back to front):
  //   surround → room containers → blackout
  //
  // Each room container holds its own layer stack (see buildRoomView):
  //   bg → tintLayer → revealLayer → washLayer → litLayer → spriteLayer → fg → cueLayer
  //
  // tintLayer, revealLayer, washLayer and litLayer are ALL inside each room container,
  // so sprites (player, follower) and foreground furniture are always drawn ABOVE the
  // night tint and light glow — no "glow over player" artifact.
  app.stage.addChild(
    drawSurround(),
    ...allViews.map((v) => v.container),
    blackout,
  );
  /** show another room: the player and follower sprites move into its sprite layer */
  function showRoom(id: RoomId) {
    const next = views.get(id);
    if (!next || next === view) return;
    // tintLayer, revealLayer, washLayer, litLayer are inside each container — toggling container is enough
    view.container.visible = false;
    view = next;
    view.container.visible = true;
    view.spriteLayer.addChild(followerSprite, playerSprite);
    hoverId = null;
  }

  let scale = 1;
  let clock = 0;
  const dprNow = () => window.devicePixelRatio || 1;

  const layout = () => {
    const l = applyStackLayout(); // integer device-pixel scale for BOTH screens; publishes --px
    scale = l.scale;
    app.renderer.resize(SCREEN_W * scale, SCREEN_H * scale); // backing store in DEVICE pixels
    app.stage.scale.set(scale);
    canvas.style.width = `${(SCREEN_W * scale) / l.dpr}px`;
    canvas.style.height = `${(SCREEN_H * scale) / l.dpr}px`;
  };
  layout();

  const ro = new ResizeObserver(layout);
  const fit = document.querySelector('.fit');
  ro.observe(fit ?? container);
  window.addEventListener('resize', layout);
  let mql: MediaQueryList | null = null;
  const watchDpr = () => {
    mql?.removeEventListener('change', onDpr);
    mql = window.matchMedia(`(resolution: ${dprNow()}dppx)`);
    mql.addEventListener('change', onDpr);
  };
  const onDpr = () => {
    layout();
    watchDpr();
  };
  watchDpr();

  // sub-world-pixel positions snap to whole DEVICE pixels
  const snap = (v: number) => Math.round(v * scale) / scale;
  const place = (spr: Sprite, sheet: Sheet, v: ActorView, lastCol: { c: number; d: Dir | null }) => {
    const px0 = v.x * TILE;
    const py0 = v.y * TILE;
    // 32px sprite: feet on tile bottom, centred on the 16px tile
    spr.x = snap(px0 - (32 - TILE) / 2);
    spr.y = snap(py0 + TILE - 32);
    if (lastCol.c !== v.col || lastCol.d !== v.facing) {
      spr.texture = (sheet[v.facing] as Texture[])[v.col] as Texture;
      lastCol.c = v.col;
      lastCol.d = v.facing;
    }
    spr.zIndex = py0 + TILE;
  };
  const pLast = { c: -1, d: null as Dir | null };
  const fLast = { c: -1, d: null as Dir | null };

  // ---------- emote bubbles ----------
  // A single emote sprite lives in the top-level stage (not inside a room container) so it
  // floats above everything. It is bottom-centre anchored on the actor's tile in SCREEN px.
  const POP_MS = 150; // pop-in duration
  interface ActiveEmote {
    sprite: Sprite;
    textures: [Texture, Texture];
    /** total elapsed ms */
    t: number;
    /** how long to show the emote */
    ms: number;
    /** which actor to follow */
    actor: 'player' | 'follower';
    w: number;
    h: number;
  }
  let activeEmote: ActiveEmote | null = null;
  const emoteSprite = new Sprite();
  emoteSprite.alpha = 0;
  emoteSprite.anchor.set(0.5, 1); // bottom-centre
  app.stage.addChild(emoteSprite); // above everything

  // ---------- wild-encounter wipe ----------
  // The spiral: 16x12 cells of 16 px blacked out in spiral order as fxState.wipe goes 0 -> 1 (fxState.fade then holds the black).
  const SPIRAL = spiralOrder(SCREEN_W / TILE, SCREEN_H / TILE);
  const spiral = new Graphics();
  app.stage.addChild(spiral);
  let spiralCells = 0;
  const drawSpiral = () => {
    const n = Math.round(fxState.wipe * SPIRAL.length);
    if (n === spiralCells) return;
    spiralCells = n;
    spiral.clear();
    for (let i = 0; i < n; i++) {
      const c = SPIRAL[i]!;
      spiral.rect(c.x * TILE, c.y * TILE, TILE, TILE).fill(0x000000);
    }
  };

  // ---------- shiny sparkles ----------
  // A burst of small stars around the follower (on load and on every room entry) when it spawned shiny.
  const sparkleLayer = new Container();
  app.stage.addChild(sparkleLayer);
  let burst: { t: number; stars: { g: Graphics; dx: number; dy: number; at: number }[] } | null = null;
  const shinyBurst = () => {
    if (!shiny) return;
    for (const st of burst?.stars ?? []) st.g.destroy();
    const stars = Array.from({ length: 7 }, (_, i) => {
      const g = drawSparkle();
      g.alpha = 0;
      sparkleLayer.addChild(g);
      const a = (i / 7) * Math.PI * 2;
      return { g, dx: Math.round(Math.cos(a) * 12), dy: Math.round(Math.sin(a) * 10) - 14, at: i * 110 };
    });
    burst = { t: 0, stars };
    container.dataset.shiny = 'burst';
  };

  /** Load textures for an emote slot (first call per slot; cached by Pixi Assets). */
  const loadEmoteTextures = async (slot: string): Promise<[Texture, Texture] | null> => {
    const meta = getEmoteAsset(slot);
    if (!meta) return null;
    const base = await Assets.load<Texture>(meta.path);
    base.source.scaleMode = 'nearest';
    const t0 = new Texture({ source: base.source, frame: new Rectangle(0, 0, meta.w, meta.h) });
    const t1 = new Texture({ source: base.source, frame: new Rectangle(meta.w, 0, meta.w, meta.h) });
    return [t0, t1];
  };

  const showEmote = (actor: 'player' | 'follower', slot: string, ms: number) => {
    void loadEmoteTextures(slot).then((textures) => {
      if (!textures) return;
      const meta = getEmoteAsset(slot)!;
      activeEmote = { sprite: emoteSprite, textures, t: 0, ms, actor, w: meta.w, h: meta.h };
      emoteSprite.texture = textures[0];
      if (reducedMotion()) {
        emoteSprite.texture = textures[1];
        emoteSprite.scale.set(1);
        emoteSprite.alpha = 1;
      } else {
        emoteSprite.scale.set(0);
        emoteSprite.alpha = 0;
      }
    });
  };

  /** Stop and hide the active emote immediately. */
  const hideEmote = () => {
    activeEmote = null;
    emoteSprite.alpha = 0;
  };

  app.ticker.add((t) => {
    const dt = Math.min(t.deltaMS, 50);
    game.update(dt);
    fxState.update(dt);
    tour?.update(dt);
    // ambient loops (`frameMs`): forward, skipped under reduced motion and while that slot plays a one-shot.
    // nightOnly slots loop only at night; by day they hold the static dayFrame.
    // See ambientFrameIndex() for the full selection logic.
    {
      const isNightNow = fxState.night;
      const rm = reducedMotion();
      ambientClock += t.deltaMS;
      for (const [id, a] of view.anims) {
        if (!a.frameMs || activeAnim?.id === id) continue;
        const n = ambientFrameIndex({
          nightOnly: a.nightOnly,
          dayFrame: a.dayFrame,
          frames: a.frames,
          isNight: isNightNow,
          rm,
          clock: ambientClock,
          frameMs: a.frameMs,
        });
        if (n === null) continue;
        if (n !== ambientFrame.get(id)) {
          ambientFrame.set(id, n);
          setFrame(id, n);
        }
      }
    }
    if (activeAnim) {
      const cur = activeAnim;
      cur.t += dt;
      const frames = view.anims.get(cur.id)!.frames;
      const cycle = 2 * (frames - 1); // ping-pong: 0,1,2,1
      const step = Math.floor(cur.t / (500 / cycle)) % cycle;
      const n = cur.t >= cur.ms ? 0 : step < frames ? step : cycle - step;
      if (n !== cur.frame) setFrame(cur.id, n);
      cur.frame = n;
      if (cur.t >= cur.ms) {
        activeAnim = null;
        ambientFrame.delete(cur.id); // the ambient loop (if any) re-syncs on the next tick
        delete container.dataset.anim;
        cur.done();
      }
    }
    // Per-room tint: each room's tintLayer uses its own roomNightAlpha.
    // fxState.nightAlpha is 0 or 1 (binary day/night); scale it by the room's target alpha.
    const nightFrac = fxState.night ? 1 : 0; // 0 = day, 1 = night (binary, set immediately on ?night=1)
    view.tintLayer.alpha = nightFrac * view.roomNightAlpha;
    if (view.night.alpha !== view.tintLayer.alpha) {
      const a = view.tintLayer.alpha;
      view.night.alpha = a;
      view.night.filter.matrix = nightMatrix(a) as typeof view.night.filter.matrix;
      const filters = a > 0 ? [view.night.filter] : [];
      view.spriteLayer.filters = filters;
      view.fg.filters = filters;
    }
    for (const w of view.lit) w.alpha = nightFrac * view.roomNightAlpha * 1.4;
    // Reveal + wash layers: fade in with the binary night fraction.
    // Flicker (TV): ±20% on washG alpha.
    // Cloud pass (moon): CloudPass.update() advances the schedule; factor() dims both revealG and washG.
    {
      const na = nightFrac;
      view.revealLayer.alpha = na;
      view.washLayer.alpha = na;
      const room = ROOMS[view.id as RoomId];
      room.lights.forEach((ls, i) => {
        const pair = view.lightPairs[i];
        if (!pair) return;
        // Advance cloud scheduler every tick (no-op if no cloud pass on this light)
        if (pair.cloud) pair.cloud.update(dt);
        const cloudFac = pair.cloud ? pair.cloud.factor(fxState.night, reducedMotion()) : 1;
        if (ls.flicker && !reducedMotion()) {
          // subtle TV flicker: ±20% on the wash (colour cast), reveal stays stable
          pair.washG.alpha = 0.80 + 0.20 * (0.5 + 0.5 * Math.sin(clock / 130 + i * 1.9));
        } else {
          pair.washG.alpha = cloudFac;
        }
        // Cloud dims the reveal layer too (the patch fades together, not just the colour cast)
        pair.revealG.alpha = cloudFac;
      });
    }
    blackout.alpha = fxState.fade;
    for (let i = bursts.length - 1; i >= 0; i--) {
      const it = bursts[i]!;
      if (!it.b.update(dt)) continue;
      it.layer.removeChild(it.b.g);
      it.b.g.destroy();
      bursts.splice(i, 1);
      it.done();
    }
    if (dropped) {
      const d = dropped;
      if (d.t < DROP_TOTAL_MS) {
        d.t += dt;
        const p = dropPos(d.t, d.from, d.to);
        d.sprite.position.set(p.x, p.y);
        if (d.t >= DROP_ARC_MS) d.landed(); // resolves once; later calls are no-ops
      } else if (!game.isFrozen) {
        // the dialogue closed (the world resumed): fade the item away, then drop it
        d.fade += dt;
        d.sprite.alpha = Math.max(0, 1 - d.fade / DROP_FADE_MS);
        if (d.fade >= DROP_FADE_MS || reducedMotion()) clearDrop();
      }
    }
    drawSpiral();
    if (burst) {
      burst.t += dt;
      const fv0 = game.followerView();
      const bx = ROOM_X + fv0.x * TILE + TILE / 2;
      const by = ROOM_Y + fv0.y * TILE + TILE - 16;
      let alive = false;
      for (const st of burst.stars) {
        const k = (burst.t - st.at) / 500; // each star: 500 ms pop in / out
        if (k < 0) {
          alive = true;
          continue;
        }
        if (k < 1) {
          alive = true;
          const s = reducedMotion() ? 1 : Math.sin(k * Math.PI);
          st.g.alpha = s;
          st.g.scale.set(0.6 + 0.6 * s);
          st.g.position.set(snap(bx + st.dx), snap(by + st.dy - k * 6));
        } else st.g.alpha = 0;
      }
      if (!alive) {
        for (const st of burst.stars) st.g.destroy();
        burst = null;
        container.dataset.shiny = 'done';
      }
    }
    if (script && script.update(dt)) {
      const done = script.done;
      script = null;
      done();
    }
    const pv = override ?? game.playerView();
    const fv = game.followerView();
    place(playerSprite, playerSheet, pv, pLast);
    place(followerSprite, followerSheet, fv, fLast);
    playerSprite.zIndex += 0.01; // player wins ties
    view.grass?.update(dt, view.id, [game.player.settled, game.follower.settled], [pv, fv], reducedMotion());

    // emote bubble: follow the actor, pop in, then hide after ms
    if (activeEmote) {
      const em = activeEmote;
      em.t += dt;
      // Position: bottom-centre of the actor's tile, 2px above the sprite top (room coords → screen)
      const av = em.actor === 'player' ? pv : fv;
      const ax = ROOM_X + av.x * TILE + TILE / 2;
      const ay = ROOM_Y + av.y * TILE + TILE - 32 - 2; // top of the 32px sprite, 2px gap
      emoteSprite.x = snap(ax);
      emoteSprite.y = snap(ay);
      if (!reducedMotion()) {
        if (em.t < POP_MS) {
          // pop-in: scale 0→1 with ease-out
          const k = em.t / POP_MS;
          const ease = 1 - (1 - k) * (1 - k); // quadratic ease-out
          emoteSprite.scale.set(ease);
          emoteSprite.alpha = ease;
          emoteSprite.texture = em.textures[0];
        } else {
          emoteSprite.scale.set(1);
          emoteSprite.alpha = 1;
          emoteSprite.texture = em.textures[1];
        }
      }
      if (em.t >= em.ms) hideEmote();
    }

    // cues: shown for objects the player is next to (not while frozen), or the hovered object
    clock += dt;
    const reduced = reducedMq.matches;
    const near = new Set<string>();
    if (!game.isFrozen) {
      const p = game.player.settled;
      for (const d of DIRS) {
        const nx = p.x + DIR_VEC[d].dx;
        const ny = p.y + DIR_VEC[d].dy;
        const id = game.grid.objectAt(nx, ny) ?? game.grid.reactAt(nx, ny)?.key; // reactive decor cues by its instance key
        if (id) near.add(id);
      }
    }
    if (hoverId) near.add(hoverId);
    const fade = Math.min(1, dt / 150);
    for (const [id, sp] of view.sparkles) {
      const target = near.has(id) ? 1 : 0;
      sp.alpha += (target - sp.alpha) * fade;
      if (Math.abs(target - sp.alpha) < 0.01) sp.alpha = target;
      const k = reduced ? 1 : 0.75 + 0.25 * Math.sin(clock / 160);
      sp.scale.set(k);
    }
    for (const [id, g] of view.glows) {
      const target = seen.has(id) ? 0 : reduced ? 0.7 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((clock * Math.PI * 2) / 1800));
      g.alpha += (target - g.alpha) * Math.min(1, dt / (seen.has(id) ? 120 : 60));
    }
  });

  // tap / click to walk (or talk to the follower if tapping its tile)
  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const wx = ((e.clientX - r.left) / r.width) * SCREEN_W - ROOM_X;
    const wy = ((e.clientY - r.top) / r.height) * SCREEN_H - ROOM_Y;
    if (wx < 0 || wy < 0 || wx >= ROOM_W || wy >= ROOM_H) return; // the dark surround is not part of the room
    e.preventDefault();
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    // Tapping the follower's settled tile: if adjacent, talk; if not adjacent, ignore (never walkTo onto the follower).
    const f = game.follower.settled;
    if (tx === f.x && ty === f.y) {
      game.interactFollower(); // no-op if not adjacent or busy; never falls through
      return;
    }
    game.walkTo(tx, ty);
  };
  canvas.addEventListener('pointerdown', onPointer);
  const tileAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.floor((((e.clientX - r.left) / r.width) * SCREEN_W - ROOM_X) / TILE),
      y: Math.floor((((e.clientY - r.top) / r.height) * SCREEN_H - ROOM_Y) / TILE),
    };
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const t = tileAt(e);
    hoverId = game.grid.inBounds(t.x, t.y) ? (game.grid.objectAt(t.x, t.y) ?? game.grid.reactAt(t.x, t.y)?.key ?? null) : null;
  };
  const onLeave = () => (hoverId = null);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  const unbindKeys = bindKeyboard(game);

  // Idle attract tour
  const params = new URLSearchParams(window.location.search);
  const tourEnabled = tourShouldRun(reducedMotion(), params);
  const tour = tourEnabled
    ? new Tour(game, { waitMs: tourWaitMs(params), motionMq, emit: opts.emit, onEmote: showEmote })
    : null;
  const unbindTour = tour ? bindTourCancelListeners(tour) : () => undefined;
  if (shiny) {
    container.dataset.shiny = 'yes';
    shinyBurst();
  }

  return {
    game,
    rest: () => fxState.rest(),
    startWipe: () => fxState.startWipe(reducedMotion()),
    clearWipe: () => fxState.clearWipe(reducedMotion()),
    isShiny: () => shiny,
    isNight: () => fxState.night,
    playObjectAnim,
    playReaction,
    showEmote,
    getDebug: () => ({ dpr: dprNow(), scale, fps: app.ticker.FPS }),
    getTourState: () => tour?.stateForTest ?? 'off',
    getGrass: () => view.grass?.debug() ?? { rustling: [], tips: [] },
    destroy() {
      // pending reactions must not strand the world frozen on remount
      activeAnim?.done();
      activeAnim = null;
      delete container.dataset.anim;
      for (const it of bursts) it.done();
      bursts.length = 0;
      clearDrop();
      hideEmote();
      unbindKeys();
      unbindTour();
      canvas.removeEventListener('pointerdown', onPointer);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', layout);
      mql?.removeEventListener('change', onDpr);
      ro.disconnect();
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
