import { COLS, ROWS, TILE, WALL_ROWS, type LightSource, type Room } from './grid';

/**
 * Night light pools as HARD-EDGED, pixel-stepped rectangles (no blur, no per-pixel alpha ramp).
 * Pure: render.ts only turns each rect into a flat fill. Two flat tones: 0 = the rim, 1 = the core.
 *
 * Every edge sits on the `STEP` grid (4 native px) and the patch is clipped to FLOOR tiles: never the wall rows, never the
 * footprint of a solid object or solid decor, never a stairs tile (a door-mat warp is floor). Tall pieces are also drawn above the patch
 * (foreground layer), so the light never lands on their art either.
 */
export const STEP = TILE / 4;

export interface LightRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 = rim (fainter), 1 = core */
  tone: 0 | 1;
}

/** Tiles a light may NOT cover: solid footprints and stairs tiles (wall rows are cut separately). Keyed `x,y`. */
export function blockedTiles(room: Room): Set<string> {
  const out = new Set<string>();
  const block = (x: number, y: number, w: number, h: number) => {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) out.add(`${tx},${ty}`);
  };
  for (const f of room.furniture) if (f.solid) block(f.x, f.y, f.w, f.h);
  for (const d of room.decor) if (d.solid) block(d.x, d.y, d.w, d.h);
  // stairs only: a warp under stair art is not floor, but a door mat is (the porch light falls on it)
  const stairs = (x: number, y: number) =>
    room.decor.some((d) => d.slot.startsWith('decor.stairs') && x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h);
  for (const w of room.warps) if (stairs(w.x, w.y)) block(w.x, w.y, 1, 1);
  return out;
}

const snap = (v: number) => Math.round(v / STEP) * STEP;

/** One scanline: [x0, x1, tone] segments (px, room-local), before clipping. */
type Seg = readonly [number, number, 0 | 1];

function scanlines(light: LightSource): { y: number; segs: Seg[] }[] {
  const cx = snap(light.cx * TILE);
  const cy = snap(light.cy * TILE);
  const RX = Math.max(STEP, snap(light.rx * TILE));
  const RY = Math.max(STEP, snap(light.ry * TILE));
  const rows: { y: number; segs: Seg[] }[] = [];
  if (light.shape === 'ellipse') {
    // flattened ellipse: the rim is the outer third, the core the inner two thirds; half-widths snap to STEP
    for (let y = cy - RY; y < cy + RY; y += STEP) {
      const t = (y + STEP / 2 - cy) / RY;
      if (t * t >= 1) continue;
      const hw = snap(RX * Math.sqrt(1 - t * t));
      const core = snap(hw * 0.6);
      if (hw < STEP) continue;
      rows.push({ y, segs: core > 0 ? [[cx - hw, cx - core, 0], [cx - core, cx + core, 1], [cx + core, cx + hw, 0]] : [[cx - hw, cx + hw, 0]] });
    }
  } else {
    // 'moon': the window's light as a parallelogram: the first and last row and the outer STEP columns are the rim, and the
    // whole band steps right by STEP/2 every two rows (oblique light)
    const n = Math.max(1, (RY * 2) / STEP);
    for (let i = 0; i < n; i++) {
      const slant = Math.floor(i / 2) * (STEP / 2);
      const x0 = cx - RX + slant;
      const x1 = cx + RX + slant;
      const edge = i === 0 || i === n - 1;
      rows.push({ y: cy - RY + i * STEP, segs: edge ? [[x0, x1, 0]] : [[x0, x0 + STEP, 0], [x0 + STEP, x1 - STEP, 1], [x1 - STEP, x1, 0]] });
    }
  }
  return rows;
}

/** The light's rects, clipped to the room's lit-able floor. Each rect is one STEP tall and within one tile. */
export function lightPatchRects(light: LightSource, room: Room, blocked: ReadonlySet<string> = blockedTiles(room)): LightRect[] {
  const out: LightRect[] = [];
  for (const { y, segs } of scanlines(light)) {
    const ty = Math.floor(y / TILE);
    if (ty < WALL_ROWS || ty >= ROWS) continue;
    for (const [x0, x1, tone] of segs) {
      // split at tile boundaries, drop the blocked tiles' parts, merge neighbours of the same tone
      let runStart = -1;
      const flush = (end: number) => {
        if (runStart >= 0 && end > runStart) out.push({ x: runStart, y, w: end - runStart, h: STEP, tone });
        runStart = -1;
      };
      for (let x = x0; x < x1; ) {
        const tx = Math.floor(x / TILE);
        const next = Math.min(x1, (tx + 1) * TILE);
        const ok = tx >= 0 && tx < COLS && !blocked.has(`${tx},${ty}`);
        if (ok) {
          if (runStart < 0) runStart = x;
        } else flush(x);
        x = next;
      }
      flush(x1);
    }
  }
  return out;
}
