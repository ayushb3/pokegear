import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { getObjectAsset } from '../assets/useAsset';
import { GrassFx, tipsTiles, type Pt } from './grass';
import { TILE, type Decor } from './grid';

/**
 * Draws the tall-grass field effects (logic in grass.ts) for every decor piece whose slot declares `field`
 * (assets.json `decor.grass`). Built once per RoomView, like the rest of the room; sprites are reused, never rebuilt.
 *   - rustle: one sprite per grass tile in the room's bg (above the patch art), hidden at rest; it covers the tile and
 *     `head` px above it (the leaves).
 *   - tips: one sprite per grass tile in the y-sorted sprite layer, zIndex just above an actor standing on that tile and
 *     below anyone on the tile beneath, shown only on the tiles an actor's feet are in (`tipsTiles`). At rest its pixels
 *     are the patch's own, so it is invisible except where it covers legs; while the tile rustles it follows the frame.
 */
interface GrassTile extends Pt {
  rustle: Sprite;
  rustleTex: Texture[];
  tips: Sprite;
  tipsTex: Texture[];
}

export interface GrassView {
  readonly fx: GrassFx;
  isGrass(x: number, y: number): boolean;
  /**
   * One tick: `settled` = each actor's settled tile (player, follower) for the rustle trigger; `views` = where their
   * sprites are drawn (tile units, fractional) for the tips. `still` = prefers-reduced-motion. (Night: the
   * tips live in the sprite layer, which render.ts darkens with the room's night filter, nightTint.ts.)
   */
  update(dt: number, room: string, settled: Pt[], views: Pt[], still: boolean): void;
  /** ?debug only: the tiles rustling (with their frame) and the tiles drawing tips */
  debug(): { rustling: (Pt & { frame: number })[]; tips: Pt[] };
}

export async function buildGrassView(decor: readonly Decor[], bg: Container, spriteLayer: Container): Promise<GrassView | null> {
  const tiles = new Map<string, GrassTile>();
  let fx: GrassFx | null = null;
  for (const d of decor) {
    const asset = getObjectAsset(d.slot);
    const field = asset.field;
    // the effect strips are cut tile for tile from the art, so the art must cover the footprint exactly
    if (!field || !asset.path || asset.w !== d.w * TILE || asset.h !== d.h * TILE) continue;
    const { rustle, tips } = field;
    fx ??= new GrassFx(rustle.frames, rustle.frameMs);
    const [rb, tb] = await Promise.all([Assets.load<Texture>(rustle.path), Assets.load<Texture>(tips.path)]);
    rb.source.scaleMode = 'nearest';
    tb.source.scaleMode = 'nearest';
    const ch = TILE + rustle.head;
    for (let ty = 0; ty < d.h; ty++)
      for (let tx = 0; tx < d.w; tx++) {
        const x = d.x + tx;
        const y = d.y + ty;
        const rustleTex = Array.from({ length: rustle.frames }, (_, f) => new Texture({ source: rb.source, frame: new Rectangle(f * asset.w + tx * TILE, ty * ch, TILE, ch) }));
        const tipsTex = Array.from({ length: rustle.frames + 1 }, (_, f) => new Texture({ source: tb.source, frame: new Rectangle(f * asset.w + tx * TILE, ty * TILE, TILE, TILE) }));
        const r = new Sprite(rustleTex[0]);
        r.position.set(x * TILE, y * TILE - rustle.head);
        r.visible = false;
        bg.addChild(r);
        const t = new Sprite(tipsTex[0]);
        t.position.set(x * TILE, y * TILE);
        t.zIndex = (y + 1) * TILE + 0.02; // actors on this tile sort at (y + 1) * TILE (+ 0.01 for the player)
        t.visible = false;
        spriteLayer.addChild(t);
        tiles.set(`${x},${y}`, { x, y, rustle: r, rustleTex, tips: t, tipsTex });
      }
  }
  if (!fx) return null;
  const gfx = fx;
  const shown = new Set<string>();
  return {
    fx: gfx,
    isGrass: (x, y) => tiles.has(`${x},${y}`),
    update(dt, room, settled, views, still) {
      gfx.update(dt, room, settled, (x, y) => tiles.has(`${x},${y}`), still);
      shown.clear();
      for (const v of views) for (const p of tipsTiles(v)) if (tiles.has(`${p.x},${p.y}`)) shown.add(`${p.x},${p.y}`);
      for (const [k, g] of tiles) {
        const f = gfx.frameAt(g.x, g.y);
        g.rustle.visible = f > 0;
        if (f > 0) g.rustle.texture = g.rustleTex[f - 1] as Texture;
        g.tips.visible = shown.has(k);
        if (g.tips.visible) g.tips.texture = g.tipsTex[f] as Texture;
      }
    },
    debug: () => ({
      rustling: [...gfx.rustles.values()].map((r) => ({ x: r.x, y: r.y, frame: gfx.frameAt(r.x, r.y) })),
      tips: [...shown].map((k) => {
        const [x, y] = k.split(',').map(Number);
        return { x: x!, y: y! };
      }),
    }),
  };
}
