import type { Game, WorldEvent } from './actors';

/** Internal wiring between the mounted world and the public api. UI code must not import this. */
type Listener = (e: WorldEvent) => void;
const listeners = new Set<Listener>();
/** The room the player is in (kept here so React can subscribe without touching the Game). */
let room = 'bedroom';
const roomListeners = new Set<() => void>();
const setRoom = (r: string) => {
  if (r === room) return;
  room = r;
  roomListeners.forEach((l) => l());
};
let game: Game | null = null;
type Fx = {
  rest(): Promise<void>;
  isNight(): boolean;
  playObjectAnim(id: string, ms: number): Promise<void>;
  playReaction(key: string, opts: { ms: number; burst?: string; drop?: { slot: string } }): Promise<void>;
  showEmote(actor: 'player' | 'follower', slot: string, ms: number): void;
  startWipe(): Promise<void>;
  clearWipe(): Promise<void>;
  isShiny(): boolean;
};
let fx: Fx | null = null;
let frozen = false;
let dimEl: HTMLElement | null = null;
let dimmed = false;
/** The last input made before the world existed; replayed once it does (if still fresh). */
let pending: { run: (g: Game) => void; at: number } | null = null;
const PENDING_MAX_MS = 4000;

export const bus = {
  emit(e: WorldEvent) {
    if (e.type === 'room') setRoom(e.room);
    listeners.forEach((l) => l(e));
  },
  subscribe(cb: Listener) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  bind(g: Game | null, f: Fx | null = null) {
    game = g;
    fx = f;
    setRoom(g ? g.room : 'bedroom');
    if (g && frozen) g.freeze();
    if (g && pending) {
      const p = pending;
      pending = null;
      if (performance.now() - p.at < PENDING_MAX_MS && !frozen) p.run(g);
    }
  },
  /** Input before the world is ready: keep only the latest, run it on bind. No-op once bound. */
  defer(run: (g: Game) => void) {
    if (!game) pending = { run, at: performance.now() };
  },
  /** Run `run` now if the world exists, else keep it (latest only) for `bind`. Never drops input in the gap between `bind` and React's `ready`. */
  runOrDefer(run: (g: Game) => void) {
    if (game) run(game);
    else pending = { run, at: performance.now() };
  },
  get room() {
    return room;
  },
  subscribeRoom(cb: () => void) {
    roomListeners.add(cb);
    return () => {
      roomListeners.delete(cb);
    };
  },
  get game() {
    return game;
  },
  get fx() {
    return fx;
  },
  /** The element that holds the world canvas (set by World.tsx). */
  setDimTarget(el: HTMLElement | null) {
    dimEl = el;
    if (el) el.toggleAttribute('data-dim', dimmed);
  },
  setDim(on: boolean) {
    dimmed = on;
    dimEl?.toggleAttribute('data-dim', on);
  },
  setFrozen(f: boolean) {
    frozen = f;
    if (game) {
      if (f) game.freeze();
      else game.resume();
    }
  },
};
