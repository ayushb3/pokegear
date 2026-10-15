import { DIRS, DIR_VEC, type Dir, type Grid, type Pt } from './grid';

export function dirBetween(a: Pt, b: Pt): Dir | null {
  for (const d of DIRS) {
    if (a.x + DIR_VEC[d].dx === b.x && a.y + DIR_VEC[d].dy === b.y) return d;
  }
  return null;
}

/** 4-direction BFS. Returns the tiles to walk through (excluding `from`), or null. */
function bfs(grid: Grid, from: Pt, isGoal: (p: Pt) => boolean): Pt[] | null {
  const key = (p: Pt) => p.y * grid.cols + p.x;
  const prev = new Map<number, Pt | null>([[key(from), null]]);
  const queue: Pt[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as Pt;
    if (isGoal(cur)) {
      const out: Pt[] = [];
      for (let p: Pt | null = cur; p && (p.x !== from.x || p.y !== from.y); p = prev.get(key(p)) ?? null) out.push(p);
      return out.reverse();
    }
    // a warp tile can only be where a path ENDS: stairs are never a shortcut through
    if (cur !== from && grid.warpAt(cur.x, cur.y)) continue;
    for (const d of DIRS) {
      const n = { x: cur.x + DIR_VEC[d].dx, y: cur.y + DIR_VEC[d].dy };
      if (!grid.isWalkable(n.x, n.y) || prev.has(key(n))) continue;
      prev.set(key(n), cur);
      queue.push(n);
    }
  }
  return null;
}

/** Shortest path to a walkable tile. [] when already there, null when unreachable. */
export function findPath(grid: Grid, from: Pt, to: Pt): Pt[] | null {
  if (!grid.isWalkable(to.x, to.y)) return null;
  return bfs(grid, from, (p) => p.x === to.x && p.y === to.y);
}

/**
 * Shortest path to the nearest walkable tile that has a target tile (`isTarget`) as a 4-neighbour,
 * plus the direction to face that target from there. The end tile is never a warp tile (a tap must not take the stairs).
 * Null when no such tile is reachable.
 */
export function findPathAdjacent(grid: Grid, from: Pt, isTarget: (x: number, y: number) => boolean): { path: Pt[]; face: Dir } | null {
  const faceFrom = (p: Pt): Dir | null => {
    for (const d of DIRS) if (isTarget(p.x + DIR_VEC[d].dx, p.y + DIR_VEC[d].dy)) return d;
    return null;
  };
  const path = bfs(grid, from, (p) => !grid.warpAt(p.x, p.y) && faceFrom(p) !== null);
  if (!path) return null;
  const end = path[path.length - 1] ?? from;
  const face = faceFrom(end);
  return face ? { path, face } : null;
}

/**
 * Shortest path to the nearest walkable tile adjacent to any tile of object `id`,
 * plus the direction to face the object from there.
 */
export function findPathToObject(grid: Grid, from: Pt, id: string): { path: Pt[]; face: Dir } | null {
  if (grid.tilesOf(id).length === 0) return null;
  return findPathAdjacent(grid, from, (x, y) => grid.objectAt(x, y) === id);
}
