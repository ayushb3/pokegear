import { describe, expect, it } from 'vitest';
import {
  CloudPass,
  CLOUD_FLOOR,
  CLOUD_FADE_MS,
  CLOUD_MIN_HOLD_MS,
  CLOUD_MAX_HOLD_MS,
  CLOUD_MIN_WAIT_MS,
  CLOUD_MAX_WAIT_MS,
} from './cloud';

/** Deterministic rand: always returns a fixed value so we can predict wait/hold durations. */
const fixedRand = (v: number) => () => v;

describe('CloudPass', () => {
  it('factor is always 1 when not night', () => {
    const cp = new CloudPass(fixedRand(0));
    // rand=0 → waitMs=MIN, initial t=0. Advance exactly to MIN to enter fade-out.
    cp.update(CLOUD_MIN_WAIT_MS);
    expect(cp.currentPhase).toBe('fade-out');
    expect(cp.factor(false, false)).toBe(1);
    expect(cp.factor(false, true)).toBe(1);
  });

  it('factor is always 1 under prefers-reduced-motion (even at night)', () => {
    const cp = new CloudPass(fixedRand(0));
    cp.update(CLOUD_MIN_WAIT_MS);
    expect(cp.currentPhase).toBe('fade-out');
    expect(cp.factor(true, true)).toBe(1);
  });

  it('factor is 1 during wait phase', () => {
    // rand=0 → waitMs = CLOUD_MIN_WAIT_MS, initial t offset = 0
    const cp = new CloudPass(fixedRand(0));
    // Has not reached end of wait yet
    cp.update(CLOUD_MIN_WAIT_MS - 100);
    expect(cp.currentPhase).toBe('wait');
    expect(cp.factor(true, false)).toBe(1);
  });

  it('factor descends to CLOUD_FLOOR over CLOUD_FADE_MS during fade-out', () => {
    const cp = new CloudPass(fixedRand(0));
    // Advance past wait into fade-out (rand=0: waitMs=MIN, initial t=0)
    cp.update(CLOUD_MIN_WAIT_MS);
    expect(cp.currentPhase).toBe('fade-out');

    const f0 = cp.factor(true, false);
    expect(f0).toBeCloseTo(1, 2); // just entered, t≈0

    cp.update(CLOUD_FADE_MS / 2);
    const fMid = cp.factor(true, false);
    expect(fMid).toBeGreaterThan(CLOUD_FLOOR);
    expect(fMid).toBeLessThan(1);
    // At midpoint: factor ≈ 1 - 0.5*(1 - CLOUD_FLOOR)
    expect(fMid).toBeCloseTo(1 - 0.5 * (1 - CLOUD_FLOOR), 1);

    cp.update(CLOUD_FADE_MS / 2);
    expect(cp.currentPhase).toBe('hold');
    expect(cp.factor(true, false)).toBe(CLOUD_FLOOR);
  });

  it('factor is exactly CLOUD_FLOOR during hold phase', () => {
    const cp = new CloudPass(fixedRand(0));
    cp.update(CLOUD_MIN_WAIT_MS + CLOUD_FADE_MS);
    expect(cp.currentPhase).toBe('hold');
    expect(cp.factor(true, false)).toBe(CLOUD_FLOOR);
    // Still CLOUD_FLOOR partway through hold
    cp.update(CLOUD_MIN_HOLD_MS / 2);
    expect(cp.factor(true, false)).toBe(CLOUD_FLOOR);
  });

  it('factor ascends from CLOUD_FLOOR to 1 during fade-in', () => {
    const cp = new CloudPass(fixedRand(0));
    // rand=0: holdMs = MIN_HOLD
    cp.update(CLOUD_MIN_WAIT_MS + CLOUD_FADE_MS + CLOUD_MIN_HOLD_MS);
    expect(cp.currentPhase).toBe('fade-in');

    const f0 = cp.factor(true, false);
    expect(f0).toBeCloseTo(CLOUD_FLOOR, 2);

    cp.update(CLOUD_FADE_MS / 2);
    const fMid = cp.factor(true, false);
    expect(fMid).toBeGreaterThan(CLOUD_FLOOR);
    expect(fMid).toBeLessThan(1);

    cp.update(CLOUD_FADE_MS / 2);
    expect(cp.currentPhase).toBe('wait');
    expect(cp.factor(true, false)).toBe(1);
  });

  it('returns to wait and reschedules after a full pass', () => {
    const cp = new CloudPass(fixedRand(0));
    const totalPass = CLOUD_FADE_MS + CLOUD_MIN_HOLD_MS + CLOUD_FADE_MS;
    cp.update(CLOUD_MIN_WAIT_MS + totalPass);
    expect(cp.currentPhase).toBe('wait');
    expect(cp.factor(true, false)).toBe(1);
  });

  it('wait range constants are within spec [30–60 s]', () => {
    expect(CLOUD_MIN_WAIT_MS).toBeGreaterThanOrEqual(30_000);
    expect(CLOUD_MAX_WAIT_MS).toBeLessThanOrEqual(60_000);
    expect(CLOUD_MIN_WAIT_MS).toBeLessThan(CLOUD_MAX_WAIT_MS);
  });

  it('with rand=0 the first pass starts at exactly CLOUD_MIN_WAIT_MS', () => {
    // rand=0 → waitMs = MIN, initial t offset = 0 * MIN/2 = 0
    const cp = new CloudPass(fixedRand(0));
    // Just before MIN: still waiting
    cp.update(CLOUD_MIN_WAIT_MS - 1);
    expect(cp.currentPhase).toBe('wait');
    // At MIN: enters fade-out
    cp.update(1);
    expect(cp.currentPhase).toBe('fade-out');
  });

  it('with rand=0.99 the first pass starts at close to CLOUD_MAX_WAIT_MS', () => {
    // rand=0.99 → waitMs ≈ MAX (initial offset ≈ MAX/2, so we subtract that)
    // constructor initial t = rand() * waitMs * 0.5 = 0.99 * MAX * 0.5
    const cp = new CloudPass(fixedRand(0.99));
    // Compute expected waitMs: MIN + floor(0.99 * (MAX - MIN))
    const expectedWait = CLOUD_MIN_WAIT_MS + Math.floor(0.99 * (CLOUD_MAX_WAIT_MS - CLOUD_MIN_WAIT_MS));
    // Initial t = floor(0.99 * expectedWait * 0.5)
    const initT = Math.floor(0.99 * expectedWait * 0.5);
    // So remaining wait = expectedWait - initT
    const remaining = expectedWait - initT;
    cp.update(remaining - 1);
    expect(cp.currentPhase).toBe('wait');
    cp.update(1);
    expect(cp.currentPhase).toBe('fade-out');
  });

  it('hold duration is within [CLOUD_MIN_HOLD_MS, CLOUD_MAX_HOLD_MS]', () => {
    expect(CLOUD_MIN_HOLD_MS).toBeGreaterThanOrEqual(1_500);
    expect(CLOUD_MAX_HOLD_MS).toBeLessThanOrEqual(3_000);
    expect(CLOUD_MIN_HOLD_MS).toBeLessThan(CLOUD_MAX_HOLD_MS);
  });
});
