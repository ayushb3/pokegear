/**
 * What happens when the player interacts with an object (UI-side content).
 * One module per object in `src/content/objects/<id>.ts` (default export = ObjectAction; the file
 * name is the object id from the object table in src/world/grid.ts), collected here by glob.
 * Third-person narrator voice. `next` opens an overlay (by overlay folder id) after the dialogue;
 * `after: 'rest'` runs the world fade + day/night toggle after the last line,
 * `before: 'rest'` runs it before the first line.
 */
export interface ObjectAction {
  lines: string[];
  /** sfx slot from assets.json */
  sfx?: string;
  next?: { overlay: string; props?: Record<string, unknown> };
  after?: 'rest';
  /** world effect to run BEFORE the first line (e.g. fade first, then the text) */
  before?: 'rest';
  /** appended as a last line (with an icon) while sound is muted, e.g. the piano: "Turn on sound to hear it." */
  whenMuted?: { line: string; icon?: 'speaker' };
  /** play the object's world animation (assets.json `frames`) for `ms` before the dialogue opens; skipped under prefers-reduced-motion */
  anim?: { ms: number };
  /** `emote.*` slot (kind emote) Oshawott shows (900 ms) when this object is used */
  emote?: string;
}

const modules = import.meta.glob<{ default: ObjectAction }>('./objects/*.ts', { eager: true });

export const OBJECT_ACTIONS: Record<string, ObjectAction> = Object.fromEntries(
  Object.entries(modules).map(([path, m]) => [(path.split('/').pop() as string).replace(/\.ts$/, ''), m.default]),
);
