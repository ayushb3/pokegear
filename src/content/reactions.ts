/**
 * What a reactive decor piece does when the player faces it and presses A, or taps it (UI-side content).
 * Reactive decor stays decor (no object id, no bag slot, no overlay, not counted in the 7-per-room cap): a `Decor` row in
 * src/world/grid.ts carries `react: '<id>'`, and one module per reaction id lives in `src/content/reactions/<id>.ts`
 * (default export = DecorReaction; the file name is the id), collected here by glob. Several pieces may share one id.
 * Third-person narrator voice; never facts about Ayush.
 */
export interface DecorReaction {
  /** narrator lines the first time a piece reacts this session */
  lines: string[];
  /** lines for any later time the SAME piece (room + instance) reacts this session; `lines` again when absent */
  again?: string[];
  /** emote bubble shown as the reaction starts (`emote.*` slot in assets.json) */
  emote?: { actor: 'player' | 'follower'; slot: string; ms: number };
  /** play the piece's frames (assets.json `frames`) for `ms` before the dialogue, plus an optional shower of drops in `burst` (#rrggbb); skipped under prefers-reduced-motion */
  anim?: { ms: number; burst?: string };
  /** sfx slot from assets.json */
  sfx?: string;
  /** optional: a watering sometimes drops an item (see `DropTable`) */
  drop?: DropTable;
}

/** One thing a reactive piece can drop. `slot` is an `item.*` asset slot; its id (for the `?drop=` debug override) is the part after `item.`. */
export interface DropItem {
  slot: string;
  /** narrator lines for this item (after the table's `lead`) */
  lines: string[];
  /** relative weight in the pick (default 1) */
  weight?: number;
  /** emote slot for Oshawott's reaction when it lands; the table's `emote` slot when absent */
  emote?: string;
  /** true while Ayush has not signed off this item's lines (a content test requires it on any line that speaks for Ayush) */
  draft?: true;
}

/** Optional drop table of a reaction: each reaction has `chance` (0..1) of dropping one of `items` instead of the normal lines. */
export interface DropTable {
  chance: number;
  /** narrator lines that open every drop, before the item's own lines */
  lead: string[];
  /** Oshawott's reaction when the item lands */
  emote: { actor: 'player' | 'follower'; slot: string; ms: number };
  items: DropItem[];
}

export const dropId = (item: DropItem): string => item.slot.replace(/^item\./, '');

/**
 * Decide a reaction's drop. `rnd` is injected (Math.random in the app) so tests are deterministic: the first call decides
 * whether anything drops (`< chance`), the second picks the item by weight. `force` is the `?drop=` debug override:
 * `none` = never drop, an item id = always that item, anything else = normal rolling.
 */
export function rollDrop(table: DropTable | undefined, rnd: () => number = Math.random, force?: string | null): DropItem | null {
  if (!table || table.items.length === 0) return null;
  if (force === 'none') return null;
  const forced = force ? table.items.find((i) => dropId(i) === force) : undefined;
  if (forced) return forced;
  if (!(rnd() < table.chance)) return null;
  const total = table.items.reduce((n, i) => n + (i.weight ?? 1), 0);
  let r = rnd() * total;
  for (const i of table.items) {
    r -= i.weight ?? 1;
    if (r < 0) return i;
  }
  return table.items[table.items.length - 1] ?? null;
}

/** `?drop=<id>` from a location.search string, honoured ONLY with `?debug` (so a shared link cannot rig the plants). */
export function dropOverride(search: string): string | null {
  const q = new URLSearchParams(search);
  return q.has('debug') ? q.get('drop') : null;
}

const modules = import.meta.glob<{ default: DecorReaction }>('./reactions/*.ts', { eager: true });

export const DECOR_REACTIONS: Record<string, DecorReaction> = Object.fromEntries(
  Object.entries(modules).map(([path, m]) => [(path.split('/').pop() as string).replace(/\.ts$/, ''), m.default]),
);
