/** Pure maths for the item a reactive piece drops (the found-item pop): a parabola with a short settle bounce. Integer native px. */
export interface Pt {
  x: number;
  y: number;
}

export const DROP_ARC_MS = 480;
export const DROP_BOUNCE_MS = 140;
export const DROP_APEX = 20; // px above the higher of start/end
export const DROP_BOUNCE = 3; // px
export const DROP_TOTAL_MS = DROP_ARC_MS + DROP_BOUNCE_MS;

/** Item position at `t` ms: from `from` (inside the piece) arcing up to the landing `to`, then one small bounce. Rounded to whole px. */
export function dropPos(t: number, from: Pt, to: Pt): Pt {
  if (t >= DROP_TOTAL_MS) return { x: to.x, y: to.y };
  if (t >= DROP_ARC_MS) {
    const u = (t - DROP_ARC_MS) / DROP_BOUNCE_MS; // 0..1
    return { x: to.x, y: Math.round(to.y - DROP_BOUNCE * 4 * u * (1 - u)) };
  }
  const u = Math.max(0, t) / DROP_ARC_MS;
  const apexY = Math.min(from.y, to.y) - DROP_APEX;
  // quadratic Bezier through (from, apex control, to): y goes up fast, then falls onto the floor
  const cy = 2 * apexY - (from.y + to.y) / 2;
  const y = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * cy + u * u * to.y;
  return { x: Math.round(from.x + (to.x - from.x) * u), y: Math.round(y) };
}

/** Where a piece's drop comes to rest: centred just above the top of its art, where the player and follower never stand (clear at 1x). */
export function dropLanding(art: { x: number; y: number; w: number; h: number }): Pt {
  return { x: art.x + Math.floor(art.w / 2), y: art.y - 1 };
}
