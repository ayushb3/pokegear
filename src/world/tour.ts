/**
 * Idle attract tour — plays once per browser session when the visitor doesn't touch anything.
 *
 * Sequence (bedroom only):
 *   1. Wait 8 s (or 500 ms when ?tour=1 forces early start, for e2e)
 *   2. Walk to the PC, pause ~1.2 s  — emote "!" above follower, narrator line in idle box
 *   3. Walk to the piano, pause       — emote "♪" above follower, narrator line
 *   4. Walk to the town map, pause    — emote "…" above follower, narrator line
 *   5. Walk back to the bedroom start tile; idle line cleared
 *   6. Done — never restarts this session
 *
 * Guards (tour is skipped entirely if any apply):
 *   - prefers-reduced-motion (also checked live each tick; cancels if it becomes true)
 *   - URL has ?open=... (deep link)
 *   - URL has ?debug but NOT also ?tour=1 (value must be exactly '1')
 *   - SessionStorage flag set from a previous run this session
 *   - World warping / not in bedroom (resets wait timer only)
 *   - freeze() during wait: resets timer; freeze() while active: cancels
 *
 * Cancellation:
 *   - Any keydown / pointerdown / touchstart / wheel on window (capture phase)
 *   - freeze() while active (walking/pausing/returning)
 *   - Drops the path (game.dropPath()); the in-flight step still finishes
 *   - SessionStorage flag written on walk-start AND on cancel/done (reload never replays)
 *   - Window capture listeners unbound immediately on cancel or done
 *   - Emits { type: 'tour', line: null } to clear the idle line
 */

import type { Game } from './actors';
import type { WorldEvent } from './actors';
import { PLAYER_START } from './grid';

/** The session key: once set, the tour never runs again in this tab. */
const SESSION_KEY = 'idle-tour-done';

const PAUSE_MS = 1200;

/** One stop on the tour. */
interface TourStop {
  objectId: string;
  /** emote.* slot to show above the follower */
  emoteSlot: string;
  /** actor to show the emote above */
  emoteActor: 'player' | 'follower';
  /** third-person narrator line for the idle box */
  line: string;
}

const STOPS: readonly TourStop[] = [
  { objectId: 'pc',      emoteSlot: 'emote.exclaim',  emoteActor: 'follower', line: 'Ayush checks on his projects.' },
  { objectId: 'piano',   emoteSlot: 'emote.note',     emoteActor: 'follower', line: 'Ayush hums his piece.' },
  { objectId: 'townmap', emoteSlot: 'emote.ellipsis', emoteActor: 'follower', line: 'Ayush looks at where he\'s been.' },
];

export type TourState = 'waiting' | 'walking' | 'pausing' | 'returning' | 'done' | 'cancelled';

export class Tour {
  private state: TourState = 'waiting';
  private timer = 0;
  private stopIndex = 0;
  private readonly waitMs: number;
  private readonly game: Game;
  private readonly emit: (e: WorldEvent) => void;
  private readonly onEmote: (actor: 'player' | 'follower', slot: string, ms: number) => void;
  /** Cleanup fn for the window capture listeners; set externally via setUnbind(). */
  private unbind: (() => void) | null = null;
  /** `matchMedia` result for live reduced-motion checks inside the ticker. */
  private readonly motionMq: MediaQueryList | null;

  constructor(
    game: Game,
    opts: {
      waitMs?: number;
      motionMq?: MediaQueryList | null;
      /** Called to emit a WorldEvent (tour lines → UI) */
      emit?: (e: WorldEvent) => void;
      /** Called to show an emote bubble above an actor */
      onEmote?: (actor: 'player' | 'follower', slot: string, ms: number) => void;
    } = {},
  ) {
    this.game = game;
    this.waitMs = opts.waitMs ?? 8000;
    this.motionMq = opts.motionMq ?? null;
    this.emit = opts.emit ?? (() => undefined);
    this.onEmote = opts.onEmote ?? (() => undefined);
  }

  /** Provide the cancel-listener unbind function (called by bindTourCancelListeners). */
  setUnbind(fn: () => void): void {
    this.unbind = fn;
  }

  /** Call from the render ticker on every frame. No-op after done/cancelled. */
  update(dtMs: number): void {
    const g = this.game;
    if (this.state === 'done' || this.state === 'cancelled') return;

    // Live reduced-motion check: cancel if motion preference changed
    if (this.motionMq?.matches) {
      this.cancel();
      return;
    }

    if (g.isWarping || g.room !== 'bedroom') {
      if (this.state === 'waiting') this.timer = 0;
      return;
    }

    // freeze() while active cancels the tour
    if (g.isFrozen) {
      if (this.state === 'waiting') {
        this.timer = 0;
      } else {
        this.cancel();
      }
      return;
    }

    switch (this.state) {
      case 'waiting': {
        this.timer += dtMs;
        if (this.timer >= this.waitMs) {
          this._startNextStop();
        }
        break;
      }
      case 'walking': {
        if (g.isIdle) {
          this._arriveAtStop();
        }
        break;
      }
      case 'pausing': {
        this.timer += dtMs;
        if (this.timer >= PAUSE_MS) {
          this.stopIndex++;
          if (this.stopIndex < STOPS.length) {
            this._startNextStop();
          } else {
            this._startReturn();
          }
        }
        break;
      }
      case 'returning': {
        if (g.isIdle) {
          this._finish();
        }
        break;
      }
    }
  }

  /** Cancel the tour immediately (user input detected or freeze while active). */
  cancel(): void {
    if (this.state === 'done' || this.state === 'cancelled') return;
    this.state = 'cancelled';
    this.game.dropPath();
    this._writeFlag();
    this._emitLine(null); // clear the idle line immediately
    this._cleanup();
  }

  get isDone(): boolean { return this.state === 'done'; }
  get isCancelled(): boolean { return this.state === 'cancelled'; }
  get isActive(): boolean {
    return this.state !== 'done' && this.state !== 'cancelled' && this.state !== 'waiting';
  }
  get stateForTest(): TourState { return this.state; }

  private _startNextStop(): void {
    const stop = STOPS[this.stopIndex]!;
    const ok = this.game.walkToObject(stop.objectId);
    if (!ok) {
      this._finish();
      return;
    }
    this._writeFlag();
    this.state = 'walking';
    this.timer = 0;
  }

  private _arriveAtStop(): void {
    const stop = STOPS[this.stopIndex]!;
    this.state = 'pausing';
    this.timer = 0;
    // Show the emote bubble above the follower for the duration of the pause
    this.onEmote(stop.emoteActor, stop.emoteSlot, PAUSE_MS);
    // Emit the narrator line to the idle box
    this._emitLine(stop.line);
  }

  private _startReturn(): void {
    const { x, y } = PLAYER_START;
    this._emitLine(null); // clear idle line during the return walk
    const ok = this.game.walkTo(x, y);
    if (!ok) {
      this._finish();
      return;
    }
    this.state = 'returning';
    this.timer = 0;
  }

  private _finish(): void {
    this.state = 'done';
    this._emitLine(null);
    this._writeFlag();
    this._cleanup();
  }

  private _emitLine(line: string | null): void {
    this.emit({ type: 'tour', line });
  }

  private _writeFlag(): void {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // Private browsing or storage quota exceeded — no harm done
    }
  }

  private _cleanup(): void {
    this.unbind?.();
    this.unbind = null;
  }
}

/**
 * Should the tour run in this page load?
 * @param reducedMotion - pass `matchMedia('(prefers-reduced-motion: reduce)').matches`
 * @param params - the current URL's search params
 */
export function tourShouldRun(reducedMotion: boolean, params: URLSearchParams): boolean {
  if (reducedMotion) return false;
  if (params.has('open')) return false;
  // ?debug without ?tour=1 → skip (e2e and console use ?debug; ?tour=1 forces the tour for e2e)
  if (params.has('debug') && params.get('tour') !== '1') return false;
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
  } catch {
    // sessionStorage unavailable — allow
  }
  return true;
}

/**
 * How long to wait before the tour starts.
 * Forced short (500ms) when ?tour=1 is set (e2e / testing).
 */
export function tourWaitMs(params: URLSearchParams): number {
  return params.get('tour') === '1' ? 500 : 8000;
}

/**
 * Bind cancel listeners on `window` and return a cleanup function.
 * Wires the returned fn into tour.setUnbind() so the tour can self-unbind on cancel/done.
 */
export function bindTourCancelListeners(tour: Tour): () => void {
  const handler = () => tour.cancel();
  window.addEventListener('keydown', handler, { capture: true });
  window.addEventListener('pointerdown', handler, { capture: true });
  window.addEventListener('touchstart', handler, { capture: true, passive: true });
  window.addEventListener('wheel', handler, { capture: true, passive: true });
  const unbind = () => {
    window.removeEventListener('keydown', handler, { capture: true });
    window.removeEventListener('pointerdown', handler, { capture: true });
    window.removeEventListener('touchstart', handler, { capture: true });
    window.removeEventListener('wheel', handler, { capture: true });
  };
  tour.setUnbind(unbind);
  return unbind;
}
