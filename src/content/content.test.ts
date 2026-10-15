import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import assets from '../assets/assets.json';
import { ALL_FURNITURE, COLS, DIR_VEC, DIRS, ROOMS, ROWS, WALL_ROWS, createGrid, createRoomGrid, decorKey, listReactive, roomOfObject, standingSpotFor } from '../world/grid';
import { findPath } from '../world/path';
import { findPathAdjacent, findPathToObject } from '../world/path';
import { Fx, FADE_MS } from '../world/fx';
import { OVERLAYS } from '../ui/overlay/registry';
import { OBJECT_ACTIONS } from './actions';
import { DECOR_REACTIONS, dropId, dropOverride, rollDrop, type DropTable } from './reactions';
import projects from './pokedex.json';
import { DEX } from './pokedex';
import piano from './piano.json';
import { card, labelOf } from './trainer-card';
import followerContent from './follower.json' with { type: 'json' };
import fridgeContent from './fridge.json' with { type: 'json' };
import radioData from './radio.json' with { type: 'json' };
import { PHOTOS, captionOf } from './photos';
import { PLACES } from './places';
import { filtersOf } from '../ui/overlay/overlays/corkboard/board';
import { BATTLE } from './battle';
import { STATIONS, tune, needlePct, markerPcts, playlistId, trackUrl } from '../ui/overlay/overlays/radio/stations';

describe('object wiring (adding an object must keep these green)', () => {
  const ids = ALL_FURNITURE.filter((f) => f.id).map((f) => f.id as string);
  it('every interactable object has an action', () => {
    for (const id of ids) expect(OBJECT_ACTIONS[id], id).toBeDefined();
  });
  it('actions only reference registered overlays and existing sfx slots', () => {
    for (const [id, a] of Object.entries(OBJECT_ACTIONS)) {
      expect(ids, id).toContain(id);
      if (a.next) expect(OVERLAYS[a.next.overlay], a.next.overlay).toBeDefined();
      if (a.sfx) expect(assets[a.sfx as keyof typeof assets], a.sfx).toBeDefined();
    }
  });
  it('the five emote objects declare their emote', () => {
    const want = { pc: 'emote.exclaim', piano: 'emote.note', townmap: 'emote.ellipsis', fridge: 'emote.heart', monitor: 'emote.question' };
    for (const [id, slot] of Object.entries(want)) expect(OBJECT_ACTIONS[id]?.emote, id).toBe(slot);
  });
  it('object emotes name existing emote slots', () => {
    for (const [id, a] of Object.entries(OBJECT_ACTIONS)) {
      if (!a.emote) continue;
      expect(a.emote, id).toMatch(/^emote\./);
      expect((assets[a.emote as keyof typeof assets] as { kind?: string } | undefined)?.kind, a.emote).toBe('emote');
    }
  });
  it('every furniture piece has an asset slot; placeholders have a colour', () => {
    for (const f of ALL_FURNITURE) {
      const a = assets[f.slot as keyof typeof assets] as { path?: string; placeholder?: boolean; color?: string };
      expect(a, f.slot).toBeDefined();
      expect(Boolean(a.path) || a.placeholder === true, f.slot).toBe(true);
      expect(a.color, f.slot).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('projects have unique slugs', () => {
    expect(new Set(projects.map((p) => p.slug)).size).toBe(projects.length);
    expect(projects.map((p) => p.slug)).toContain('bubblychef');
  });
  it('every nightOnly asset slot has a valid dayFrame index (< frames)', () => {
    for (const [slot, a] of Object.entries(assets)) {
      const obj = a as { nightOnly?: boolean; dayFrame?: number; frames?: number };
      if (!obj.nightOnly) continue;
      const frames = obj.frames ?? 1;
      expect(obj.dayFrame, `${slot}: nightOnly slot must declare dayFrame`).toBeDefined();
      expect(obj.dayFrame! >= 0 && obj.dayFrame! < frames,
        `${slot}: dayFrame=${obj.dayFrame} must be a valid frame index (0-${frames - 1})`
      ).toBe(true);
    }
  });
});

describe.each(Object.values(ROOMS))('room layout: $id', (room) => {
  const grid = createRoomGrid(room);
  const furniture = room.furniture;
  const decor = room.decor;
  const ids = furniture.filter((f) => f.id).map((f) => f.id as string);
  const tiles = (r: { x: number; y: number; w: number; h: number }) =>
    Array.from({ length: r.w * r.h }, (_, i) => ({ x: r.x + (i % r.w), y: r.y + Math.floor(i / r.w) }));
  /** every tile that is a valid place to stand to use an object */
  const standingTiles = () => {
    const out = new Set<string>();
    for (const id of ids)
      for (const t of grid.tilesOf(id))
        for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]] as const) {
          const n = { x: t.x + dx, y: t.y + dy };
          if (grid.isWalkable(n.x, n.y)) out.add(`${n.x},${n.y}`);
        }
    return out;
  };
  /** where a player can start: the room's start tile and every tile a warp drops you on */
  const entries = [room.start, ...Object.values(ROOMS).flatMap((r) => r.warps.filter((w) => w.to === room.id).map((w) => w.arrive))];

  it('is 14 x 10 tiles, and its start tile is walkable', () => {
    expect([COLS, ROWS]).toEqual([14, 10]);
    expect(grid.isWalkable(room.start.x, room.start.y)).toBe(true);
  });
  it('has at most 7 objects, all with unique ids', () => {
    expect(ids.length).toBeLessThanOrEqual(7);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('objects do not overlap each other', () => {
    const seen = new Set<string>();
    for (const f of furniture.filter((f) => f.id))
      for (const t of tiles(f)) {
        expect(seen.has(`${t.x},${t.y}`), `${f.id} @${t.x},${t.y}`).toBe(false);
        seen.add(`${t.x},${t.y}`);
      }
  });
  it('every piece (furniture and decor) stays inside the room', () => {
    for (const r of [...furniture, ...decor]) for (const t of tiles(r)) expect(grid.inBounds(t.x, t.y), `${r.label} ${t.x},${t.y}`).toBe(true);
  });
  it('every decor piece has an asset slot named decor.*, and decor has no interaction id', () => {
    for (const d of decor) {
      expect(d.slot).toMatch(/^decor\./);
      expect(assets[d.slot as keyof typeof assets], d.slot).toBeDefined();
      expect('id' in d, d.label).toBe(false);
    }
  });
  it('solid decor overlaps neither furniture nor other solid decor', () => {
    const seen = new Map<string, string>();
    for (const r of [...furniture.filter((f) => f.solid), ...decor.filter((d) => d.solid)])
      for (const t of tiles(r)) {
        const k = `${t.x},${t.y}`;
        expect(seen.get(k), `${r.label} @${k} overlaps ${seen.get(k)}`).toBeUndefined();
        seen.set(k, r.label);
      }
  });
  it('rugs lie inside their footprint vertically (bottom-anchored art + dy, as render.ts places it)', () => {
    // render.ts: top = fy + fh - art.h + dy. Narrow on purpose: tall solid pieces rise above their footprint by design.
    for (const d of decor.filter((o) => !o.solid && o.slot.startsWith('decor.rug'))) {
      const h = (assets as unknown as Record<string, { h: number }>)[d.slot]!.h;
      const top = d.h * 16 - h + (d.dy ?? 0);
      expect(top, `${d.label} top`).toBeGreaterThanOrEqual(0);
      expect(top + h, `${d.label} bottom`).toBeLessThanOrEqual(d.h * 16);
    }
  });
  it('solid decor blocks movement, rugs and wall pieces do not', () => {
    // a floor piece (the yard's lawn) may run under a solid piece, e.g. a tree: that tile is blocked by the other piece
    const blocked = (x: number, y: number) => [...furniture.filter((f) => f.solid), ...decor.filter((o) => o.solid)].some((o) => tiles(o).some((t) => t.x === x && t.y === y));
    for (const d of decor) for (const t of tiles(d)) if (t.y >= WALL_ROWS) expect(grid.isWalkable(t.x, t.y), `${d.label} ${t.x},${t.y}`).toBe(d.solid ? false : !blocked(t.x, t.y));
  });
  it('every object has a standing spot, reachable from the start tile and from every arrival tile', () => {
    for (const from of entries)
      for (const id of ids) {
        expect(standingSpotFor(grid, id), id).not.toBeNull();
        expect(findPathToObject(grid, from, id), `${id} from ${from.x},${from.y}`).not.toBeNull();
      }
  });
  it('decor never covers a standing spot: EVERY free neighbour of an object is reachable', () => {
    for (const from of entries)
      for (const id of ids) {
        const spot = standingSpotFor(grid, id)!;
        expect(grid.isWalkable(spot.x, spot.y), id).toBe(true);
        for (const key of standingTiles()) {
          const [x, y] = key.split(',').map(Number) as [number, number];
          expect(findPath(grid, from, { x, y }), `${id} via ${key}`).not.toBeNull();
        }
      }
  });
  it('no walkable floor tile is walled off from the start or an arrival tile (decor makes no dead pockets)', () => {
    for (const from of entries)
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) if (grid.isWalkable(x, y)) expect(findPath(grid, from, { x, y }), `${x},${y}`).not.toBeNull();
  });

  describe('warps', () => {
    it('warp tiles are walkable, not standing spots, and sit under non-solid decor', () => {
      const stand = standingTiles();
      for (const w of room.warps) {
        expect(grid.isWalkable(w.x, w.y), `${w.x},${w.y} walkable`).toBe(true);
        expect(stand.has(`${w.x},${w.y}`), `${w.x},${w.y} is a standing spot`).toBe(false);
        expect(decor.some((d) => !d.solid && tiles(d).some((t) => t.x === w.x && t.y === w.y)), `${w.x},${w.y} under decor`).toBe(true);
      }
    });
    it('arrival tiles are walkable and are not warps', () => {
      for (const w of room.warps) {
        const dest = ROOMS[w.to];
        const g = createRoomGrid(dest);
        expect(g.isWalkable(w.arrive.x, w.arrive.y), `${w.to} ${w.arrive.x},${w.arrive.y}`).toBe(true);
        expect(g.warpAt(w.arrive.x, w.arrive.y)).toBeNull();
      }
    });
    it('every warp has a return warp', () => {
      for (const w of room.warps) expect(ROOMS[w.to].warps.some((r) => r.to === room.id), `${room.id} -> ${w.to}`).toBe(true);
    });
  });
});

describe('reactive decor (decor that reacts to A / a tap without being an object)', () => {
  const rooms = Object.values(ROOMS);
  const reactive = (r: (typeof rooms)[number]) => r.decor.filter((d) => d.react);
  it('every react id has a reaction module, and every reaction module is used by some decor', () => {
    const used = new Set(rooms.flatMap((r) => reactive(r).map((d) => d.react as string)));
    for (const id of used) expect(DECOR_REACTIONS[id], id).toBeDefined();
    for (const id of Object.keys(DECOR_REACTIONS)) expect(used.has(id), id).toBe(true);
  });
  it('reactive decor is solid and stands on the floor (not in the wall rows)', () => {
    for (const r of rooms)
      for (const d of reactive(r)) {
        expect(d.solid, `${r.id} ${d.label}`).toBe(true);
        expect(d.y, `${r.id} ${d.label}`).toBeGreaterThanOrEqual(WALL_ROWS);
      }
  });
  it('no two reactive pieces of a room share a tile, and every animated decor row has a unique instance key', () => {
    for (const r of rooms) {
      const seen = new Set<string>();
      for (const d of reactive(r))
        for (let y = d.y; y < d.y + d.h; y++)
          for (let x = d.x; x < d.x + d.w; x++) {
            expect(seen.has(`${x},${y}`), `${r.id} ${d.label} @${x},${y}`).toBe(false);
            seen.add(`${x},${y}`);
          }
      const animated = r.decor.filter((d) => ((assets[d.slot as keyof typeof assets] as { frames?: number } | undefined)?.frames ?? 1) > 1);
      const keys = animated.map(decorKey);
      expect(new Set(keys).size, r.id).toBe(keys.length);
    }
  });
  it('no 4-neighbour of a reactive piece is a warp tile (a tap must never take the stairs)', () => {
    for (const r of rooms) {
      const g = createRoomGrid(r);
      for (const piece of g.reactives)
        for (let y = piece.y; y < piece.y + piece.h; y++)
          for (let x = piece.x; x < piece.x + piece.w; x++)
            for (const d of DIRS) {
              const nx = x + DIR_VEC[d].dx;
              const ny = y + DIR_VEC[d].dy;
              expect(g.warpAt(nx, ny), `${r.id} ${piece.key} neighbour ${nx},${ny}`).toBeNull();
            }
    }
  });
  it('every reactive piece has a walkable neighbour, reachable from the start tile and from every arrival tile', () => {
    for (const r of rooms) {
      const g = createRoomGrid(r);
      const entries = [r.start, ...rooms.flatMap((o) => o.warps.filter((w) => w.to === r.id).map((w) => w.arrive))];
      for (const piece of g.reactives) {
        let free = false;
        for (let y = piece.y; y < piece.y + piece.h; y++)
          for (let x = piece.x; x < piece.x + piece.w; x++)
            for (const d of DIRS) if (g.isWalkable(x + DIR_VEC[d].dx, y + DIR_VEC[d].dy)) free = true;
        expect(free, `${r.id} ${piece.key}`).toBe(true);
        for (const from of entries)
          expect(findPathAdjacent(g, from, (x, y) => g.reactAt(x, y)?.key === piece.key), `${r.id} ${piece.key} from ${from.x},${from.y}`).not.toBeNull();
      }
    }
  });
  it('reaction emotes are emote.* slots, sfx exist, burst is a #rrggbb colour', () => {
    for (const [id, re] of Object.entries(DECOR_REACTIONS)) {
      expect(re.lines.length, id).toBeGreaterThan(0);
      if (re.emote) {
        expect(re.emote.slot, id).toMatch(/^emote\./);
        expect((assets[re.emote.slot as keyof typeof assets] as { kind?: string } | undefined)?.kind, re.emote.slot).toBe('emote');
      }
      if (re.sfx) expect(assets[re.sfx as keyof typeof assets], re.sfx).toBeDefined();
      if (re.anim?.burst) expect(re.anim.burst, id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('drop tables: chance in (0,1), emote + item slots exist, ids unique, lines about Ayush are flagged draft', () => {
    const tables = Object.entries(DECOR_REACTIONS).filter(([, r]) => r.drop);
    expect(tables.length).toBeGreaterThan(0);
    for (const [id, re] of tables) {
      const t = re.drop as DropTable;
      expect(t.chance, id).toBeGreaterThan(0);
      expect(t.chance, id).toBeLessThan(1);
      expect(t.lead.length, id).toBeGreaterThan(0);
      expect((assets[t.emote.slot as keyof typeof assets] as { kind?: string } | undefined)?.kind, t.emote.slot).toBe('emote');
      expect(t.items.length, id).toBeGreaterThan(0);
      const ids = t.items.map(dropId);
      expect(new Set(ids).size, `${id}: item ids unique`).toBe(ids.length);
      for (const it of t.items) {
        expect(it.slot, id).toMatch(/^item\./);
        const a = assets[it.slot as keyof typeof assets] as { kind?: string; path?: string; placeholder?: boolean; w?: number; h?: number } | undefined;
        expect(a?.kind, it.slot).toBe('object');
        expect(a?.placeholder, `${it.slot} has real art`).toBeFalsy();
        expect(a?.path, it.slot).toMatch(/^\/assets\/items\//);
        expect((a?.w ?? 1) % 2 === 0 && (a?.h ?? 1) % 2 === 0, `${it.slot} even art size`).toBe(true);
        if (it.emote) expect((assets[it.emote as keyof typeof assets] as { kind?: string } | undefined)?.kind, it.emote).toBe('emote');
        expect(it.lines.length, it.slot).toBeGreaterThan(0);
        expect(it.lines.length + t.lead.length, `${it.slot}: about 3 dialogue lines`).toBeLessThanOrEqual(4);
        if ((it.weight ?? 1) <= 0) throw new Error(`${it.slot}: weight must be positive`);
        // anything that speaks for Ayush is a placeholder until he signs it off
        if (it.lines.some((l) => /Ayush/.test(l))) expect(it.draft, `${it.slot} speaks for Ayush: needs draft: true`).toBe(true);
      }
      // every item the plan names is in the pool
      for (const want of ['oran-berry', 'pecha-berry', 'cheri-berry', 'medal', 'labubu', 'jellycat']) expect(ids, id).toContain(want);
    }
  });
  it('the item PNGs exist and match their slot size', () => {
    for (const [slot, a] of Object.entries(assets).filter(([k]) => k.startsWith('item.')) as [string, { path: string; w: number; h: number }][]) {
      const png = readFileSync(fileURLToPath(new URL(`../../public${a.path}`, import.meta.url)));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], slot).toEqual([a.w, a.h]);
    }
  });
  it('the plants: two per room, all reacting as "plant"', () => {
    for (const room of ['bedroom', 'downstairs'] as const) {
      const list = listReactive(room);
      expect(list, room).toHaveLength(2);
      for (const r of list) expect(r.id, room).toBe('plant');
    }
  });
});

describe('the house', () => {
  it('object ids are unique across rooms', () => {
    const all = ALL_FURNITURE.filter((f) => f.id).map((f) => f.id as string);
    expect(new Set(all).size).toBe(all.length);
  });
  it('roomOfObject finds the room that holds an object', () => {
    expect(roomOfObject('pc')).toBe('bedroom');
    expect(roomOfObject('nope')).toBeNull();
  });
});

describe('deep link spot', () => {
  it('stands in front of the PC, facing it', () => {
    const grid = createGrid();
    const s = standingSpotFor(grid, 'pc')!;
    expect(s).toEqual({ x: 8, y: 3, facing: 'up' });
  });
});

describe('light sources', () => {
  it('every light.ref is a known furniture id or decor slot in its room', () => {
    for (const room of Object.values(ROOMS)) {
      const furnitureIds = new Set(room.furniture.filter((f) => f.id).map((f) => f.id as string));
      const decorSlots = new Set(room.decor.map((d) => d.slot));
      for (const ls of room.lights) {
        const knownRef = furnitureIds.has(ls.ref) || decorSlots.has(ls.ref);
        expect(knownRef, `${room.id}: light ref "${ls.ref}" not found in furniture ids or decor slots`).toBe(true);
      }
    }
  });

  it('every light has sane rx/ry (>0 and <=6 tiles)', () => {
    for (const room of Object.values(ROOMS)) {
      for (const ls of room.lights) {
        expect(ls.rx, `${room.id}: light "${ls.ref}" rx`).toBeGreaterThan(0);
        expect(ls.rx, `${room.id}: light "${ls.ref}" rx`).toBeLessThanOrEqual(6);
        expect(ls.ry, `${room.id}: light "${ls.ref}" ry`).toBeGreaterThan(0);
        expect(ls.ry, `${room.id}: light "${ls.ref}" ry`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('washAlpha is in range (0.08–0.50)', () => {
    // Ellipse lights use low reveal alphas (≤0.48) so their washAlpha stays ≤0.25.
    // Moon lights use very low reveal (0.30 inner) so washAlpha can go up to 0.50
    // to let the cool blue hue dominate over the partially-revealed warm floor.
    for (const room of Object.values(ROOMS)) {
      for (const ls of room.lights) {
        expect(ls.washAlpha, `${room.id}: light "${ls.ref}" washAlpha`).toBeGreaterThanOrEqual(0.08);
        expect(ls.washAlpha, `${room.id}: light "${ls.ref}" washAlpha`).toBeLessThanOrEqual(0.50);
      }
    }
  });

  it('every light centre is within the room bounds (in tiles)', () => {
    for (const room of Object.values(ROOMS)) {
      for (const ls of room.lights) {
        expect(ls.cx, `${room.id}: light "${ls.ref}" cx`).toBeGreaterThanOrEqual(0);
        expect(ls.cx, `${room.id}: light "${ls.ref}" cx`).toBeLessThanOrEqual(COLS);
        expect(ls.cy, `${room.id}: light "${ls.ref}" cy`).toBeGreaterThanOrEqual(0);
        expect(ls.cy, `${room.id}: light "${ls.ref}" cy`).toBeLessThanOrEqual(ROWS);
      }
    }
  });

  it('shape is ellipse or moon', () => {
    for (const room of Object.values(ROOMS)) {
      for (const ls of room.lights) {
        expect(['ellipse', 'moon'], `${room.id}: light "${ls.ref}" shape`).toContain(ls.shape);
      }
    }
  });
});

describe('?night URL override parsing', () => {
  it('detects night=1, night=0, day=1, and absent params', () => {
    // Simulate the parsing logic from World.tsx
    const parse = (search: string): boolean | undefined => {
      const p = new URLSearchParams(search);
      return p.has('night') ? p.get('night') !== '0' : p.has('day') ? false : undefined;
    };
    expect(parse('?night=1')).toBe(true);
    expect(parse('?night=0')).toBe(false);
    expect(parse('?day=1')).toBe(false);
    expect(parse('?debug')).toBeUndefined();
    expect(parse('')).toBeUndefined();
    expect(parse('?night=1&debug')).toBe(true);
  });
});

describe('Fx (day/night + fade)', () => {
  it('fades out, toggles at the peak, fades back in and resolves', async () => {
    const fx = new Fx();
    let resolved = false;
    void fx.rest().then(() => (resolved = true));
    fx.update(FADE_MS - 1);
    expect(fx.night).toBe(false);
    fx.update(1);
    expect(fx.night).toBe(true);
    expect(fx.fade).toBe(1);
    fx.update(FADE_MS);
    await Promise.resolve();
    expect(fx.fade).toBe(0);
    expect(resolved).toBe(true);
    expect(fx.nightAlpha).toBeGreaterThan(0);
  });
});

describe('pokedex content', () => {
  const copy = ['category', 'stats', 'flavour', 'ribbon', 'what', 'how', 'impact', 'built', 'learned'] as const;
  it('Rotom + 3 projects, Rotom is No. 000 with the how-i-build slug', () => {
    expect(DEX.map((e) => e.slug)).toEqual(['how-i-build', 'bubblychef', 'tradedesk', 'stave']);
    expect(DEX.map((e) => e.no)).toEqual([0, 1, 2, 3]);
  });
  // Fields Ayush has signed off, per entry; every other copy field stays flagged draft.
  const signedOff: Record<string, string[]> = {
    'how-i-build': ['category', 'stats', 'flavour', 'ribbon', 'what', 'how', 'impact', 'built', 'learned'],
    bubblychef: ['category', 'stats', 'flavour', 'ribbon', 'what', 'how', 'impact', 'built', 'learned'],
    tradedesk: ['category', 'stats', 'flavour', 'ribbon', 'what', 'how', 'impact', 'built', 'learned'],
    stave: ['category', 'stats', 'flavour', 'ribbon', 'what', 'how', 'impact', 'built', 'learned'],
  };
  it('every copy field is flagged draft unless signed off; 2 flavour lines, 3 beats, 2-3 learnings, 2-3 chips, 2 stats each', () => {
    for (const e of DEX) {
      for (const k of copy) expect(e.draft[k], `${e.slug}.${k}`).toBe(!signedOff[e.slug]?.includes(k));
      expect(e.flavour).toHaveLength(2);
      expect(e.built).toHaveLength(3);
      expect(e.learned.length).toBeGreaterThanOrEqual(2);
      expect(e.learned.length).toBeLessThanOrEqual(3);
      expect(e.types.length).toBeGreaterThanOrEqual(2);
      expect(e.types.length).toBeLessThanOrEqual(3);
      expect(e.stats).toHaveLength(2);
    }
  });
  it('sprite slots exist; TradeDesk links no repo; no course material anywhere', () => {
    for (const e of DEX) expect(assets[e.sprite as keyof typeof assets], e.sprite).toBeDefined();
    expect(DEX.find((e) => e.slug === 'tradedesk')!.links).toEqual([]);
    expect(JSON.stringify(DEX)).not.toMatch(/course|education/i);
  });
  it('cost is not the story: no dollar figures anywhere in the entries', () => {
    expect(JSON.stringify(DEX)).not.toMatch(/\$|cost/i);
  });
  it('missing content is a clearly marked Placeholder, never an invented fact', () => {
    const ph = DEX.flatMap((e) => [...e.built, ...e.learned].filter((x) => /placeholder/i.test(x.text)).map(() => e.slug));
    expect(ph).toEqual([]);
  });
  it('Stave: local project, no links, local-only ribbon (build log in its HANDOFF.md)', () => {
    const e = DEX.find((x) => x.slug === 'stave')!;
    expect(e.no).toBe(3);
    expect(e.sprite).toBe('sprite.dex.jigglypuff');
    expect(e.links).toEqual([]);
    expect(e.ribbon).toEqual({ icon: 'lock', text: 'Local only — no public repo' });
  });
  it('BubblyChef carries the Rotom-assisted mark; entry links point at real entries', () => {
    expect(DEX[1]!.ribbon.text).toBe('Built with the agent loop \u00b7 21 runs');
    for (const e of DEX) for (const l of e.links) if (l.entry) expect(DEX.some((x) => x.slug === l.entry)).toBe(true);
  });
});

describe('Fx.fadeThrough', () => {
  it('runs mid once at the peak, while fully black, then fades back', async () => {
    const fx = new Fx();
    const seen: number[] = [];
    let done = false;
    void fx.fadeThrough(() => seen.push(fx.fade)).then(() => (done = true));
    fx.update(FADE_MS - 1);
    expect(seen).toEqual([]);
    fx.update(1);
    expect(seen).toEqual([1]);
    fx.update(FADE_MS);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(fx.fade).toBe(0);
    expect(fx.night).toBe(false); // a plain fade does not touch day/night
  });
  it('a second fade waits for the first, and its mid still runs', async () => {
    const fx = new Fx();
    const order: string[] = [];
    void fx.fadeThrough(() => order.push('a'));
    void fx.fadeThrough(() => order.push('b'));
    for (let i = 0; i < 6 && order.length < 2; i++) {
      fx.update(FADE_MS);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(order).toEqual(['a', 'b']);
  });
  it('rest() is ignored while a fade is running', async () => {
    const fx = new Fx();
    void fx.fadeThrough(() => undefined);
    await fx.rest();
    expect(fx.night).toBe(false);
  });
});

describe('radio.json content shape and rules', () => {
  it('has a stations array with at least one station', () => {
    expect(Array.isArray(radioData.stations)).toBe(true);
    expect(radioData.stations.length).toBeGreaterThanOrEqual(1);
  });

  it('each station has id, kind, sample, name, desc; kind is list | playlist | object', () => {
    for (const s of STATIONS) {
      expect(s.id).toBeTruthy();
      expect(['list', 'playlist', 'object']).toContain(s.kind);
      expect(typeof s.sample).toBe('boolean');
      expect(s.name).toBeTruthy();
      expect(s.desc).toBeTruthy();
    }
  });

  it('per-station sample: true => name, desc, and track content are prefixed "Sample:"', () => {
    for (const s of STATIONS) {
      if (!s.sample) continue;
      if (s.kind !== 'object') {
        // object stations (Piano) may use real names even when sample:true
        expect(s.name, `station ${s.id} name`).toMatch(/^Sample:/);
        expect(s.desc, `station ${s.id} desc`).toMatch(/^Sample:/);
      }
      if (s.kind === 'list') {
        for (const t of s.tracks) {
          expect(t.title, `${s.id} track title`).toMatch(/^Sample:/);
          expect(t.artist, `${s.id} track artist`).toMatch(/^Sample:/);
          if (t.note) expect(t.note, `${s.id} track note`).toMatch(/^Sample:/);
        }
      }
    }
  });

  it('per-station sample: false => no "Sample:" prefixes in name/desc', () => {
    for (const s of STATIONS) {
      if (s.sample) continue;
      expect(s.name, `station ${s.id}`).not.toMatch(/^Sample:/);
      expect(s.desc, `station ${s.id}`).not.toMatch(/^Sample:/);
    }
  });

  it('list stations have a non-empty tracks array with valid Spotify URLs', () => {
    for (const s of STATIONS) {
      if (s.kind !== 'list') continue;
      expect(s.tracks.length).toBeGreaterThan(0);
      for (const t of s.tracks) {
        expect(t.title).toBeTruthy();
        expect(t.artist).toBeTruthy();
        expect(t.spotifyUrl).toMatch(/^https:\/\/open\.spotify\.com\//);
      }
    }
  });

  it('playlist stations with sample:false have a validated playlist URL (not placeholder)', () => {
    for (const s of STATIONS) {
      if (s.kind !== 'playlist') continue;
      if (s.sample) {
        // sample stations may use "placeholder" or a valid URL
        const url = s.spotifyPlaylistUrl;
        expect(url === 'placeholder' || url.startsWith('https://open.spotify.com/')).toBe(true);
      } else {
        // non-sample playlist stations must have a real, validated URL
        expect(playlistId(s.spotifyPlaylistUrl), `${s.id} playlist URL`).not.toBeNull();
      }
    }
  });

  it('object stations reference an existing furniture object id', () => {
    const objIds = ALL_FURNITURE.filter((f) => f.id).map((f) => f.id as string);
    for (const s of STATIONS) {
      if (s.kind !== 'object') continue;
      expect(objIds, `station ${s.id} objectId`).toContain(s.objectId);
    }
  });
});

describe('radio station tuning helpers', () => {
  it('tune wraps forward and backward', () => {
    const n = STATIONS.length;
    expect(tune(0, 1)).toBe(1);
    expect(tune(n - 1, 1)).toBe(0);
    expect(tune(0, -1)).toBe(n - 1);
    expect(tune(1, -1)).toBe(0);
  });

  it('needlePct returns 0 for the first station and 100 for the last', () => {
    expect(needlePct(0)).toBe(0);
    expect(needlePct(STATIONS.length - 1)).toBe(100);
  });

  it('markerPcts returns one pct per interior station, all in 1..99', () => {
    const marks = markerPcts();
    expect(marks.length).toBe(Math.max(0, STATIONS.length - 2));
    for (const p of marks) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(100);
    }
  });
});

describe('radio URL validators', () => {
  const VALID_PLAYLIST = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
  const VALID_ID = '37i9dQZF1DXcBWIGoYBM5M';

  describe('playlistId', () => {
    it('returns the 22-char ID for a valid playlist URL', () => {
      expect(playlistId(VALID_PLAYLIST)).toBe(VALID_ID);
    });
    it('also accepts URLs with query params (strips them)', () => {
      expect(playlistId(`${VALID_PLAYLIST}?si=abc123`)).toBe(VALID_ID);
    });
    it('returns null for "placeholder"', () => {
      expect(playlistId('placeholder')).toBeNull();
    });
    it('returns null for empty string', () => {
      expect(playlistId('')).toBeNull();
    });
    it('rejects http: (not https:)', () => {
      expect(playlistId(`http://open.spotify.com/playlist/${VALID_ID}`)).toBeNull();
    });
    it('rejects javascript: scheme', () => {
      expect(playlistId(`javascript:alert(1)`)).toBeNull();
    });
    it('rejects a different host', () => {
      expect(playlistId(`https://evil.com/playlist/${VALID_ID}`)).toBeNull();
    });
    it('rejects subdomain of open.spotify.com', () => {
      expect(playlistId(`https://evil.open.spotify.com/playlist/${VALID_ID}`)).toBeNull();
    });
    it('rejects extra path segments after the ID', () => {
      expect(playlistId(`https://open.spotify.com/playlist/${VALID_ID}/extra`)).toBeNull();
    });
    it('rejects ../ tricks', () => {
      expect(playlistId(`https://open.spotify.com/playlist/../${VALID_ID}`)).toBeNull();
    });
    it('rejects an ID that is not exactly 22 chars', () => {
      expect(playlistId('https://open.spotify.com/playlist/short')).toBeNull();
      expect(playlistId(`https://open.spotify.com/playlist/${VALID_ID}X`)).toBeNull();
    });
    it('rejects a track URL (wrong path type)', () => {
      expect(playlistId(`https://open.spotify.com/track/${VALID_ID}`)).toBeNull();
    });
  });

  describe('trackUrl', () => {
    const VALID_TRACK = `https://open.spotify.com/track/${VALID_ID}`;
    const VALID_ALBUM = `https://open.spotify.com/album/${VALID_ID}`;
    it('accepts a valid track URL', () => {
      expect(trackUrl(VALID_TRACK)).toBe(VALID_TRACK);
    });
    it('accepts a valid album URL', () => {
      expect(trackUrl(VALID_ALBUM)).toBe(VALID_ALBUM);
    });
    it('rejects empty string', () => {
      expect(trackUrl('')).toBeNull();
    });
    it('rejects http: scheme', () => {
      expect(trackUrl(`http://open.spotify.com/track/${VALID_ID}`)).toBeNull();
    });
    it('rejects javascript: scheme', () => {
      expect(trackUrl('javascript:alert(1)')).toBeNull();
    });
    it('rejects a different host', () => {
      expect(trackUrl(`https://evil.com/track/${VALID_ID}`)).toBeNull();
    });
    it('rejects a playlist URL', () => {
      expect(trackUrl(`https://open.spotify.com/playlist/${VALID_ID}`)).toBeNull();
    });
    it('rejects extra path segments', () => {
      expect(trackUrl(`https://open.spotify.com/track/${VALID_ID}/extra`)).toBeNull();
    });
    it('rejects an ID that is not exactly 22 chars', () => {
      expect(trackUrl('https://open.spotify.com/track/short')).toBeNull();
    });
  });
});

describe('townmap assets', () => {
  it('townmap.world slot exists and has a non-empty path', () => {
    const slot = assets['townmap.world' as keyof typeof assets] as
      | { path?: string; placeholder?: boolean }
      | undefined;
    expect(slot, 'townmap.world slot missing from assets.json').toBeDefined();
    expect(slot!.placeholder, 'townmap.world must not be a placeholder').toBeFalsy();
    expect(typeof slot!.path, 'townmap.world must have a path string').toBe('string');
    expect((slot!.path as string).length).toBeGreaterThan(0);
  });
});

/**
 * Pixel-font glyph guard: src/content/fontGlyphs.json (generated by
 * scripts/emit-font-glyphs.py from public/assets/fonts/hgss.ttf) is the codepoint
 * source of truth. Every character rendered in the HGSS pixel font must be covered;
 * fallback to Courier New renders in the wrong typeface.
 *
 * Whitespace (U+0020, U+00A0) is always allowed. The ♪ prefix in object lines is
 * stripped by the dialogue renderer before display — it is excluded from the check.
 */
describe('pixel-font glyph guard', () => {
  const glyphSet = new Set<number>(
    JSON.parse(
      readFileSync(fileURLToPath(new URL('./fontGlyphs.json', import.meta.url)), 'utf8'),
    ) as number[],
  );

  /** Returns the set of uncovered codepoints (printable, non-whitespace). */
  function uncovered(texts: string[]): Map<string, string> {
    const out = new Map<string, string>();
    const ALLOW = new Set([0x0020, 0x00a0]); // space, nbsp
    for (const t of texts) {
      for (const ch of t) {
        const cp = ch.codePointAt(0)!;
        if (!ALLOW.has(cp) && !glyphSet.has(cp)) out.set(ch, `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
      }
    }
    return out;
  }

  it('font glyph set loaded (sanity: has A-Z, 0-9, » and ▼)', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789»▼') {
      expect(glyphSet.has(ch.codePointAt(0)!), ch).toBe(true);
    }
  });

  it('trainer-card labelOf() for all links', () => {
    const labels = card.links.map((l) => labelOf(l));
    const bad = uncovered(labels);
    expect([...bad.entries()], 'uncovered chars').toEqual([]);
  });

  it('piano.json display strings (nowPracticing, pieceCredit title/composer/source)', () => {
    // Collect all string values from piano.json (skips null/url fields)
    const texts = Object.values(piano.pieceCredit).filter((v): v is string => typeof v === 'string');
    texts.push(piano.nowPracticing.text);
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars').toEqual([]);
  });

  it('pokedex.json display fields (name, title, category, flavour, what, how, impact, types, stats, built, learned, ribbon)', () => {
    const texts: string[] = [];
    for (const e of DEX) {
      texts.push(e.name, e.title, e.category, e.summary, ...e.flavour, e.what, e.how, e.impact);
      texts.push(...e.types);
      for (const s of e.stats) texts.push(s.k, s.v);
      for (const b of e.built) texts.push(b.title, b.text);
      for (const l of e.learned) texts.push(l.title, l.text);
      texts.push(e.ribbon.text);
    }
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars').toEqual([]);
  });

  it('object action lines (♪ prefix is stripped by the renderer, exclude it)', () => {
    const texts: string[] = [];
    for (const action of Object.values(OBJECT_ACTIONS)) {
      for (const line of action.lines) {
        // The dialogue renderer strips a leading ♪ before rendering — exclude it
        texts.push(line.replace(/^♪\s*/, ''));
      }
      if (action.whenMuted) texts.push(action.whenMuted.line);
    }
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars').toEqual([]);
  });

  it('follower.json lines: all start with "Oshawott " and contain only covered glyphs', () => {
    const allLines = [
      followerContent.lines.night,
      followerContent.lines.downstairs,
      ...followerContent.lines.rotate,
    ];
    for (const line of allLines) {
      expect(line, `line must start with "Oshawott ": "${line}"`).toMatch(/^Oshawott /);
    }
    const bad = uncovered(allLines);
    expect([...bad.entries()], 'uncovered chars in follower lines').toEqual([]);
  });

  it('fridge.json strings: titles, places and notes contain only covered glyphs', () => {
    const texts = fridgeContent.entries.flatMap((e) => [e.title, (e as { place?: string }).place, (e as { note?: string }).note].filter((t): t is string => typeof t === 'string'));
    expect(texts.length).toBeGreaterThan(30);
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars in fridge strings').toEqual([]);
  });

  it('decor reaction lines (lines + again) contain only covered glyphs', () => {
    const texts = Object.values(DECOR_REACTIONS).flatMap((r) => [...r.lines, ...(r.again ?? []), ...(r.drop ? [...r.drop.lead, ...r.drop.items.flatMap((i) => i.lines)] : [])]);
    expect(texts.length).toBeGreaterThan(0);
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars in reaction lines').toEqual([]);
  });

  it.skipIf(!(() => { try { readFileSync(fileURLToPath(new URL('./townmap.json', import.meta.url))); return true; } catch { return false; } })())('townmap.json display strings (station name, story, now; line name)', () => {
    const towns = JSON.parse(
      readFileSync(fileURLToPath(new URL('./townmap.json', import.meta.url)), 'utf8'),
    ) as { lines: Array<{ name: string }>; stations: Array<{ name: string; story?: string; now?: string }> };
    const texts: string[] = [];
    for (const l of towns.lines) texts.push(l.name);
    for (const s of towns.stations) {
      texts.push(s.name);
      if (s.story) texts.push(s.story);
      if (s.now) texts.push(s.now);
    }
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars').toEqual([]);
  });

  it('photo board filter bar, captions and the Town Map "Photos" strings', () => {
    const filters = filtersOf(PHOTOS, (id) => PLACES.find((p) => p.id === id)?.name ?? id);
    const texts: string[] = ['▶', '·', 'Photos', 'Map', 'View', 'Next', 'Back', 'Close', '1 photo', '83 photos'];
    for (const f of filters) texts.push(`${f.label} ${f.count}`, `${f.name} · ${f.count} photos`);
    for (const p of PHOTOS) texts.push(captionOf(p));
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars').toEqual([]);
  });

  it('battle.json display strings (names, move names and lines, the recruiter lines) and the shiny follower line', () => {
    const texts = [BATTLE.enemy.name, BATTLE.player.name, ...BATTLE.moves.flatMap((m) => [m.name, m.type, m.text]), ...BATTLE.enemy.moves.flatMap((m) => [m.name, m.text])];
    // the lines the reducer composes around them
    texts.push('A wild RECRUITER appeared!', 'Go! OSHAWOTT!', "It's super effective!", 'RECRUITER was convinced!', 'RECRUITER wants to connect!', 'Got away safely!', "There's no PP left for this move!", 'OSHAWOTT is the only Pokémon in the party.', 'OSHAWOTT handed over the résumé.', 'FIGHT', 'BAG', 'POKéMON', 'RUN', 'RÉSUMÉ ×1', 'PP 1/1', 'TYPE/', 'Lv?', 'HP');
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars').toEqual([]);
  });

  it('radio.json display strings (station name, desc, track title, track artist, track note)', () => {
    const texts: string[] = [];
    for (const s of STATIONS) {
      texts.push(s.name, s.desc);
      if (s.kind === 'list') {
        for (const t of s.tracks) {
          texts.push(t.title, t.artist);
          if (t.note) texts.push(t.note);
        }
      }
    }
    const bad = uncovered(texts);
    expect([...bad.entries()], 'uncovered chars').toEqual([]);
  });
});

/**
 * Curly quotes only. The pixel font aliases a straight `"` to the CLOSING quote
 * (ALIASES in scripts/build-font.py), so `"Hi"` would render with a close quote on both
 * sides. Displayed strings must use the real “ (U+201C) and ” (U+201D), both of which the
 * font has. Radio content (radio.json / STATIONS) is deliberately NOT scanned: it is frozen
 * awaiting Ayush's content pass (it currently has no straight double quote anyway).
 */
describe('displayed text uses curly double quotes', () => {
  /** Every string value reachable from `v` (object keys are not displayed, so skipped). */
  function strings(v: unknown, out: string[] = []): string[] {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) for (const x of v) strings(x, out);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
    return out;
  }

  const texts = (): string[] => [
    ...Object.values(OBJECT_ACTIONS).flatMap((a) => strings([a.lines, a.whenMuted])),
    ...strings(Object.values(DECOR_REACTIONS).map((r) => [r.lines, r.again, r.drop])),
    ...strings(followerContent),
    ...strings(fridgeContent),
    ...strings(BATTLE),
    ...strings(DEX),
    ...strings(piano),
    ...strings(card),
    ...strings(PHOTOS),
    ...strings(PLACES),
  ];

  it('collects a meaningful number of strings', () => {
    expect(texts().length).toBeGreaterThan(300);
  });

  it('no straight " inside any dialogue / displayed string', () => {
    const bad = texts().filter((t) => t.includes('"'));
    expect(bad, 'use “ and ” (U+201C / U+201D), not a straight "').toEqual([]);
  });

  it('every “ has a matching ” after it', () => {
    for (const t of texts()) {
      const open = [...t].filter((c) => c === '“').length;
      const close = [...t].filter((c) => c === '”').length;
      expect(open, t).toBe(close);
    }
  });
});
