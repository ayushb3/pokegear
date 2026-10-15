/**
 * Cloud pass: periodic dimming of moon-light patches to simulate a cloud crossing the moon.
 *
 * State machine (all durations in ms):
 *   idle   → wait  (random 30–60 s between passes)
 *   fade-out → hold → fade-in → idle (and reschedule)
 *
 * The "factor" is the multiplier applied to the moon patch's reveal+wash alpha:
 *   1.0 = clear (no cloud), 0.35 = fully obscured.
 *
 * The schedule and factor are computed by a pure class driven by elapsed time so
 * the logic is fully unit-testable without a canvas or Pixi.
 */

export const CLOUD_MIN_WAIT_MS  = 30_000;  // minimum idle time between passes
export const CLOUD_MAX_WAIT_MS  = 60_000;  // maximum idle time between passes
export const CLOUD_FADE_MS      = 2_000;   // fade-out duration (and fade-in)
export const CLOUD_MIN_HOLD_MS  = 1_500;   // minimum hold at peak obscuration
export const CLOUD_MAX_HOLD_MS  = 3_000;   // maximum hold at peak obscuration
export const CLOUD_FLOOR        = 0.35;    // factor at full obscuration (35% of normal brightness)

type Phase = 'wait' | 'fade-out' | 'hold' | 'fade-in';

/**
 * Pure cloud-pass scheduler. Advance with `update(dtMs)` and read `factor` each frame.
 *
 * @param rand - zero-arg function returning a [0,1) uniform random number.
 *               Defaults to Math.random; pass a seeded PRNG for deterministic tests.
 */
export class CloudPass {
  private phase: Phase = 'wait';
  private t     = 0;              // elapsed ms within the current phase
  private waitMs: number;         // how long to wait in this idle period
  private holdMs: number = CLOUD_MIN_HOLD_MS; // how long to hold at floor

  constructor(private readonly rand: () => number = Math.random) {
    // Stagger the first pass: start partway through the first wait
    this.waitMs = this.nextWait();
    // Offset by up to 1/2 the wait so different sessions don't all sync up
    this.t = Math.floor(this.rand() * this.waitMs * 0.5);
  }

  private nextWait(): number {
    return CLOUD_MIN_WAIT_MS + Math.floor(this.rand() * (CLOUD_MAX_WAIT_MS - CLOUD_MIN_WAIT_MS));
  }
  private nextHold(): number {
    return CLOUD_MIN_HOLD_MS + Math.floor(this.rand() * (CLOUD_MAX_HOLD_MS - CLOUD_MIN_HOLD_MS));
  }

  /**
   * Advance the scheduler by `dtMs`. Call once per ticker frame.
   * Cascades through multiple phase transitions in a single call so a large dt
   * (e.g. in unit tests) never skips a phase.
   */
  update(dtMs: number): void {
    this.t += dtMs;
    // Cascade: keep transitioning while the accumulated time exceeds the current phase duration.
    // Under normal frame rates (16–50 ms) this loop runs at most once.
    let safety = 8; // guard against infinite loop bugs
    while (safety-- > 0) {
      switch (this.phase) {
        case 'wait':
          if (this.t < this.waitMs) return;
          this.t -= this.waitMs;
          this.holdMs = this.nextHold();
          this.phase  = 'fade-out';
          break;
        case 'fade-out':
          if (this.t < CLOUD_FADE_MS) return;
          this.t    -= CLOUD_FADE_MS;
          this.phase = 'hold';
          break;
        case 'hold':
          if (this.t < this.holdMs) return;
          this.t    -= this.holdMs;
          this.phase = 'fade-in';
          break;
        case 'fade-in':
          if (this.t < CLOUD_FADE_MS) return;
          this.t      -= CLOUD_FADE_MS;
          this.waitMs  = this.nextWait();
          this.phase   = 'wait';
          break;
      }
    }
  }

  /**
   * Current cloud factor: 1.0 = fully clear, CLOUD_FLOOR = fully obscured.
   * Always 1.0 when `night` is false or `reducedMotion` is true.
   */
  factor(night: boolean, reducedMotion: boolean): number {
    if (!night || reducedMotion) return 1;
    switch (this.phase) {
      case 'wait':
        return 1;
      case 'fade-out': {
        // linear ease from 1 → CLOUD_FLOOR
        const k = Math.min(1, this.t / CLOUD_FADE_MS);
        return 1 - k * (1 - CLOUD_FLOOR);
      }
      case 'hold':
        return CLOUD_FLOOR;
      case 'fade-in': {
        // linear ease from CLOUD_FLOOR → 1
        const k = Math.min(1, this.t / CLOUD_FADE_MS);
        return CLOUD_FLOOR + k * (1 - CLOUD_FLOOR);
      }
    }
  }

  /** Exposed for unit tests: read the current phase. */
  get currentPhase(): Phase { return this.phase; }
  /** Exposed for unit tests: read elapsed ms within the current phase. */
  get elapsed(): number { return this.t; }
}
