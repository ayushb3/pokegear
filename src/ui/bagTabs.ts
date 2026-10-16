import type { RoomId } from '../world/api';

/**
 * Bag room tabs (pure helpers, unit-tested in `bagTabs.test.ts`).
 *
 * The idle bag lists ONE room's objects at a time; a tab row (Bedroom / Downstairs / Yard) picks which. The selected tab shows
 * the room's location name (`roomLabel`: "Ayush's room", "Downstairs", "Front yard"), the others a short name, so all three
 * always fit the 240u box at the 16u pixel font.
 *
 * L / R shoulder keys: the arrows and WASD walk the player and Z / X / Enter / Esc are A / B, so the bag's L / R are Q / E
 * (also PageUp / PageDown). They only act while the bag shows (no overlay open).
 */
const SHORT: Record<RoomId, string> = { bedroom: 'Bedroom', downstairs: 'Downstairs', yard: 'Yard' };

/** The tab's text: the full location name while selected, else the short name. */
export function tabText(id: RoomId, label: string, selected: boolean): string {
  return selected ? label : SHORT[id];
}

/** -1 (L) / +1 (R) for the bag's shoulder keys, else 0. `code` is `KeyboardEvent.code`. */
export function tabKeyStep(code: string): -1 | 0 | 1 {
  if (code === 'KeyQ' || code === 'PageUp') return -1;
  if (code === 'KeyE' || code === 'PageDown') return 1;
  return 0;
}

/** The room `step` tabs away from `cur`, wrapping round (HGSS bag pockets wrap). */
export function stepRoom(order: readonly RoomId[], cur: RoomId, step: number): RoomId {
  const i = order.indexOf(cur);
  if (i < 0 || order.length === 0) return cur;
  return order[(i + step + order.length * 8) % order.length]!;
}
