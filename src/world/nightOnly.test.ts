/**
 * Unit tests for the nightOnly ambient frame-selection logic and layer-order contracts.
 *
 * ambientFrameIndex() is a pure function exported from render.ts — no Pixi dependency.
 * It picks the correct frame index given: nightOnly flag, dayFrame, isNight, reduced-motion,
 * clock progress, and frameMs.
 */
import { describe, expect, it } from 'vitest';
import { ambientFrameIndex, LAYER_ORDER } from './render';

// ─── Layer-order contract ────────────────────────────────────────────────────
//
// Each RoomView container's children follow a strict back-to-front order.
// LAYER_ORDER exports the named indices so this test can lock them in.
// If someone accidentally moves sprites behind the light layers, this breaks.

describe('layer order contract', () => {
  it('tintLayer is below revealLayer', () => {
    expect(LAYER_ORDER.tintLayer).toBeLessThan(LAYER_ORDER.revealLayer);
  });
  it('revealLayer is below washLayer', () => {
    expect(LAYER_ORDER.revealLayer).toBeLessThan(LAYER_ORDER.washLayer);
  });
  it('washLayer is below spriteLayer', () => {
    expect(LAYER_ORDER.washLayer).toBeLessThan(LAYER_ORDER.spriteLayer);
  });
  it('spriteLayer is below fgLayer', () => {
    expect(LAYER_ORDER.spriteLayer).toBeLessThan(LAYER_ORDER.fgLayer);
  });
  it('fgLayer is below litLayer', () => {
    expect(LAYER_ORDER.fgLayer).toBeLessThan(LAYER_ORDER.litLayer);
  });
  it('all layer indices are unique', () => {
    const indices = Object.values(LAYER_ORDER);
    expect(new Set(indices).size).toBe(indices.length);
  });
});

// ─── helpers ────────────────────────────────────────────────────────────────

const base = {
  frames: 4,     // TV: frames 0-2 = ON, frame 3 = OFF (dayFrame)
  frameMs: 800,
  nightOnly: true as const,
  dayFrame: 3,
};

// ─── nightOnly: true ────────────────────────────────────────────────────────

describe('ambientFrameIndex – nightOnly: true', () => {
  it('day (any time-of-day): returns dayFrame regardless of clock', () => {
    expect(ambientFrameIndex({ ...base, isNight: false, rm: false, clock: 0 })).toBe(3);
    expect(ambientFrameIndex({ ...base, isNight: false, rm: false, clock: 99999 })).toBe(3);
  });

  it('day + reduced motion: still returns dayFrame', () => {
    expect(ambientFrameIndex({ ...base, isNight: false, rm: true, clock: 0 })).toBe(3);
    expect(ambientFrameIndex({ ...base, isNight: false, rm: true, clock: 5000 })).toBe(3);
  });

  it('night + reduced motion: returns 0 (static ON, no flicker)', () => {
    expect(ambientFrameIndex({ ...base, isNight: true, rm: true, clock: 0 })).toBe(0);
    expect(ambientFrameIndex({ ...base, isNight: true, rm: true, clock: 99999 })).toBe(0);
  });

  it('night + motion: loops over frames 0, 1, 2 only (dayFrame=3 excluded)', () => {
    // With frameMs=800, loopCount=3, each step is 800ms.
    // step 0 → frame 0, step 1 → frame 1, step 2 → frame 2, step 3 → wraps to frame 0 again.
    expect(ambientFrameIndex({ ...base, isNight: true, rm: false, clock: 0 })).toBe(0);
    expect(ambientFrameIndex({ ...base, isNight: true, rm: false, clock: 800 })).toBe(1);
    expect(ambientFrameIndex({ ...base, isNight: true, rm: false, clock: 1600 })).toBe(2);
    // wraps around: step 3 → frame 0 again (NOT frame 3)
    expect(ambientFrameIndex({ ...base, isNight: true, rm: false, clock: 2400 })).toBe(0);
    expect(ambientFrameIndex({ ...base, isNight: true, rm: false, clock: 3200 })).toBe(1);
  });

  it('night loop never returns dayFrame (frame 3)', () => {
    // Check 10 clock values spanning 2+ full loops
    for (let t = 0; t < 8000; t += 300) {
      const n = ambientFrameIndex({ ...base, isNight: true, rm: false, clock: t });
      expect(n, `clock=${t}`).not.toBe(3);
    }
  });

  it('works when dayFrame is 0 (PC case: day=frame0, night loops frame1 only)', () => {
    const pc = { frames: 2, frameMs: 1200, nightOnly: true as const, dayFrame: 0 };
    // day: frame 0
    expect(ambientFrameIndex({ ...pc, isNight: false, rm: false, clock: 0 })).toBe(0);
    // night + rm: frame 0 (base ON)
    expect(ambientFrameIndex({ ...pc, isNight: true, rm: true, clock: 0 })).toBe(0);
    // night + motion: only frame 1 (loopCount=1, step always maps to frame after df=0)
    expect(ambientFrameIndex({ ...pc, isNight: true, rm: false, clock: 0 })).toBe(1);
    expect(ambientFrameIndex({ ...pc, isNight: true, rm: false, clock: 1200 })).toBe(1);
    expect(ambientFrameIndex({ ...pc, isNight: true, rm: false, clock: 9600 })).toBe(1);
  });

  it('uses frames-1 as dayFrame when dayFrame is omitted', () => {
    const opts = { frames: 3, frameMs: 500, nightOnly: true as const, isNight: false, rm: false, clock: 0 };
    // no dayFrame → defaults to frames-1 = 2
    expect(ambientFrameIndex(opts)).toBe(2);
  });
});

// ─── nightOnly: false / undefined ───────────────────────────────────────────

describe('ambientFrameIndex – nightOnly: false (normal loop)', () => {
  const norm = { frames: 8, frameMs: 1500, nightOnly: false as const };

  it('non-nightOnly under reduced motion returns null (caller skips)', () => {
    expect(ambientFrameIndex({ ...norm, isNight: false, rm: true, clock: 0 })).toBeNull();
    expect(ambientFrameIndex({ ...norm, isNight: true, rm: true, clock: 9999 })).toBeNull();
  });

  it('non-nightOnly + motion: cycles all frames regardless of day/night', () => {
    // frameMs=1500, clock=0→frame0, 1500→frame1, …
    expect(ambientFrameIndex({ ...norm, isNight: false, rm: false, clock: 0 })).toBe(0);
    expect(ambientFrameIndex({ ...norm, isNight: true, rm: false, clock: 1500 })).toBe(1);
    expect(ambientFrameIndex({ ...norm, isNight: false, rm: false, clock: 12000 })).toBe(0); // wraps: 12000/1500=8 % 8 = 0
  });

  it('non-nightOnly with no nightOnly key (undefined): treated as false', () => {
    const opts = { frames: 3, frameMs: 400, isNight: false, rm: false, clock: 0 };
    expect(ambientFrameIndex(opts)).toBe(0);
    expect(ambientFrameIndex({ ...opts, rm: true })).toBeNull();
  });
});
