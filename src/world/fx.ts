/** World-wide visual state: day/night tint, the fade used to switch it, and the wild-encounter wipe. Pure, ticker-driven. */
export const FADE_MS = 350;
/** Encounter wipe: two black blinks, then a spiral of cells closes in on the screen; it stays black until `clearWipe`. */
export const WIPE_FLASH_MS = 320;
export const WIPE_SPIRAL_MS = 640;
export const WIPE_MS = WIPE_FLASH_MS + WIPE_SPIRAL_MS;

/** Clockwise spiral from the top-left corner inward: the order the wipe blacks out a cols x rows grid of cells. */
export function spiralOrder(cols: number, rows: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x0 = 0;
  let y0 = 0;
  let x1 = cols - 1;
  let y1 = rows - 1;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push({ x, y: y0 });
    for (let y = y0 + 1; y <= y1; y++) out.push({ x: x1, y });
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) out.push({ x, y: y1 });
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) out.push({ x: x0, y });
    x0++;
    y0++;
    x1--;
    y1--;
  }
  return out;
}
/** Opacity of the dark+blue night overlay. Higher = darker room at night (unmistakably night). */
export const NIGHT_ALPHA = 0.58;

export class Fx {
  night = false;
  /** 0..1 black overlay used while resting */
  fade = 0;
  /** 0..1 progress of the encounter spiral (0 = nothing drawn, 1 = the screen is covered); 0 outside a wipe */
  wipe = 0;
  private phase: 'idle' | 'out' | 'in' | 'wipe' | 'held' = 'idle';
  private t = 0;
  private mid: (() => void) | null = null;
  private done: (() => void) | null = null;
  /** resolves when the fade in flight (if any) has finished */
  private current: Promise<void> = Promise.resolve();

  /**
   * Fade to black, run `mid` at the peak (nothing is visible then: swap rooms, toggle the tint), fade back.
   * Resolves when finished. A fade asked for while another is running waits for it, so `mid` always runs.
   * The fade is an opacity change, so it also runs under prefers-reduced-motion.
   */
  fadeThrough(mid: () => void): Promise<void> {
    if (this.phase === 'held') {
      mid(); // the screen is already black (a battle is on): nothing to hide
      return Promise.resolve();
    }
    if (this.phase !== 'idle') {
      const next = this.current.then(() => this.fadeThrough(mid));
      this.current = next;
      return next;
    }
    this.phase = 'out';
    this.t = 0;
    this.mid = mid;
    this.current = new Promise((res) => {
      this.done = res;
    });
    return this.current;
  }

  /** Fade to black, toggle day/night at the peak, fade back in. Ignored while a fade is already running. */
  rest(): Promise<void> {
    if (this.phase !== 'idle') return Promise.resolve();
    return this.fadeThrough(() => {
      this.night = !this.night;
    });
  }

  /**
   * The wild-encounter transition: two quick black blinks, then the spiral closes in. Resolves once the screen is fully black
   * and STAYS black (phase `held`) until `clearWipe`. Under `instant` (reduced motion) it cuts straight to black.
   * Queued behind a fade in flight, like `fadeThrough`.
   */
  startWipe(instant = false): Promise<void> {
    if (this.phase === 'held') return Promise.resolve();
    if (this.phase !== 'idle') {
      const next = this.current.then(() => this.startWipe(instant));
      this.current = next;
      return next;
    }
    if (instant) {
      this.phase = 'held';
      this.fade = 1;
      this.wipe = 1;
      return Promise.resolve();
    }
    this.phase = 'wipe';
    this.t = 0;
    this.wipe = 0;
    this.current = new Promise((res) => {
      this.done = res;
    });
    return this.current;
  }

  /** From black (after `startWipe`): fade the world back in. Resolves when done; no-op if nothing is held. */
  clearWipe(instant = false): Promise<void> {
    if (this.phase !== 'held') return Promise.resolve();
    this.wipe = 0;
    if (instant) {
      this.phase = 'idle';
      this.fade = 0;
      return Promise.resolve();
    }
    this.phase = 'in';
    this.t = 0;
    this.current = new Promise((res) => {
      this.done = res;
    });
    return this.current;
  }

  get nightAlpha(): number {
    return this.night ? NIGHT_ALPHA : 0;
  }

  update(dtMs: number) {
    if (this.phase === 'idle' || this.phase === 'held') return;
    this.t += dtMs;
    if (this.phase === 'wipe') {
      if (this.t < WIPE_FLASH_MS) {
        // two blinks: black on 0-80, off 80-160, on 160-240, off 240-320
        this.fade = Math.floor(this.t / 80) % 2 === 0 ? 1 : 0;
        this.wipe = 0;
      } else {
        this.fade = 0;
        this.wipe = Math.min(1, (this.t - WIPE_FLASH_MS) / WIPE_SPIRAL_MS);
        if (this.wipe >= 1) {
          this.fade = 1;
          this.phase = 'held';
          this.done?.();
          this.done = null;
        }
      }
      return;
    }
    if (this.phase === 'out') {
      this.fade = Math.min(1, this.t / FADE_MS);
      if (this.t >= FADE_MS) {
        this.mid?.();
        this.mid = null;
        this.phase = 'in';
        this.t = 0;
      }
    } else {
      this.fade = Math.max(0, 1 - this.t / FADE_MS);
      if (this.t >= FADE_MS) {
        this.fade = 0;
        this.phase = 'idle';
        this.done?.();
        this.done = null;
      }
    }
  }
}
