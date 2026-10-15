/** The ONLY module UI code may import from src/world/. */
// Exports: interact, freeze, resume, goTo, onEvent, rest, isNight, dim, objectBox, playObjectAnim, showEmote, startWipe, clearWipe, isShiny,
// objects, emphasisObject, currentRoom, roomLabel, onRoom, WorldView.
import { bus } from './bus';
import { ALL_FURNITURE, ROOMS, ROOM_X, ROOM_Y, TILE, listObjects, listReactive, roomOf, type RoomId } from './grid';
import type { WorldEvent } from './actors';
import { isShiny as shinyRoll } from './shiny';

export { default as WorldView } from './World';
export type { WorldEvent, RoomId };

/** What A does: interact with whatever the player is facing. */
export function interact(): boolean {
  return bus.game?.interact() ?? false;
}
/** Stop all input and movement (a step in flight finishes and snaps to the grid). */
export function freeze(): void {
  bus.setFrozen(true);
}
export function resume(): void {
  bus.setFrozen(false);
}
/** Walk to an object: path to an adjacent tile, face it, auto-interact. Works across rooms: takes the stairs first. */
export function goTo(objectId: string): boolean {
  if (!bus.game) {
    bus.defer((g) => g.goTo(objectId)); // tapped before load: do it as soon as the world exists
    return false;
  }
  return bus.game.goTo(objectId);
}
export function onEvent(cb: (e: WorldEvent) => void): () => void {
  return bus.subscribe(cb);
}
/** Interactable objects of a room (default: the room the player is in), for UI labels and shortcuts. */
export function objects(room: RoomId = currentRoom()): { id: string; label: string }[] {
  return listObjects(room);
}
/** The object of a room that glows until opened (`emphasis` in the object table), if any. */
export function emphasisObject(room: RoomId = currentRoom()): string | null {
  return ROOMS[room].furniture.find((f) => f.id && f.emphasis)?.id ?? null;
}
/** Reactive decor of a room (default: the current one): pieces that react to A / a tap without being objects (no bag slot). */
export function reactives(room: RoomId = currentRoom()): { id: string; label: string; key: string }[] {
  return listReactive(room);
}
/** The room the player is in. */
export function currentRoom(): RoomId {
  return bus.room as RoomId;
}
/** HGSS-style location name of a room (default: the current one). */
export function roomLabel(room: RoomId = currentRoom()): string {
  return roomOf(room).label;
}
/** Fires when the player enters another room (after the fade). Works with useSyncExternalStore(onRoom, currentRoom). */
export function onRoom(cb: () => void): () => void {
  return bus.subscribeRoom(cb);
}
/** Fade out, toggle the world-wide day/night tint, fade in. Resolves when done. */
export function rest(): Promise<void> {
  return bus.fx?.rest() ?? Promise.resolve();
}
/** Play an object's animation frames (assets.json `frames`) for `ms`. Resolves when done; resolves at once under prefers-reduced-motion or if the object has no frames. */
export function playObjectAnim(objectId: string, ms: number): Promise<void> {
  return bus.fx?.playObjectAnim(objectId, ms) ?? Promise.resolve();
}
/**
 * Play a reactive decor piece's reaction in the current room (`key` from the `react` event): its frames as a one-shot ping-pong
 * and, if `burst` (#rrggbb) is set, a shower of drops onto it, for `ms`; then, if `drop` is set, that `item.*` slot pops out of the piece and rests beside it
 * until the world resumes (the dialogue closes). Resolves when done (the item has landed); at once under prefers-reduced-motion, which shows the item still.
 */
export function playReaction(key: string, opts: { ms: number; burst?: string; drop?: { slot: string } }): Promise<void> {
  return bus.fx?.playReaction(key, opts) ?? Promise.resolve();
}
export function isNight(): boolean {
  return bus.fx?.isNight() ?? false;
}
/** Dim the top-screen world (a full-screen layer such as the Pokédex sits on top). Pair every `dim(true)` with a `dim(false)`. */
export function dim(on: boolean): void {
  bus.setDim(on);
}
/** An object's box in top-screen NATIVE pixels (256x192), or null. For UI that animates out of an object (Rotom from the PC). */
export function objectBox(objectId: string): { x: number; y: number; w: number; h: number } | null {
  const f = ALL_FURNITURE.find((o) => o.id === objectId);
  return f ? { x: ROOM_X + f.x * TILE, y: ROOM_Y + f.y * TILE, w: f.w * TILE, h: f.h * TILE } : null;
}
/**
 * Show an emote bubble above an actor for `ms` milliseconds.
 * Slot must be an `emote.*` key in assets.json. No-op if the world is not yet mounted.
 */
export function showEmote(actor: 'player' | 'follower', slot: string, ms: number): void {
  bus.fx?.showEmote(actor, slot, ms);
}
/**
 * Wild-encounter transition on the top screen: two blinks, a spiral to black, then black until `clearWipe()`.
 * Resolves once the screen is black (at once under prefers-reduced-motion). The battle overlay calls it after `freeze()`.
 */
export function startWipe(): Promise<void> {
  return bus.fx?.startWipe() ?? Promise.resolve();
}
/** Fade the world back in after a battle. Pair every `startWipe()` with a `clearWipe()`. */
export function clearWipe(): Promise<void> {
  return bus.fx?.clearWipe() ?? Promise.resolve();
}
/** true when the follower spawned shiny on this page load (decided once; see src/world/shiny.ts). Same value the world uses. */
export function isShiny(): boolean {
  return shinyRoll();
}
