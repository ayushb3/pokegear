import { describe, expect, it } from 'vitest';
import { AUTO_MS, INTRO_MS, shouldShowTitle, SHOW_SKIP_BUTTON, type TitleParams } from './titleScreenLogic';

const base: TitleParams = {
  hasOpen: false,
  isDebug: false,
  forceTitle: false,
  reducedMotion: false,
  alreadyShown: false,
};

describe('shouldShowTitle', () => {
  it('shows on a fresh normal visit', () => {
    expect(shouldShowTitle(base)).toBe(true);
  });

  it('hides when ?open= is present (deep link)', () => {
    expect(shouldShowTitle({ ...base, hasOpen: true })).toBe(false);
  });

  it('hides when ?debug is set (test/dev)', () => {
    expect(shouldShowTitle({ ...base, isDebug: true })).toBe(false);
  });

  it('shows when ?debug AND ?title=1 (explicit override for e2e tests)', () => {
    expect(shouldShowTitle({ ...base, isDebug: true, forceTitle: true })).toBe(true);
  });

  it('hides when already shown this session', () => {
    expect(shouldShowTitle({ ...base, alreadyShown: true })).toBe(false);
  });

  it('hides under prefers-reduced-motion', () => {
    expect(shouldShowTitle({ ...base, reducedMotion: true })).toBe(false);
  });

  it('reduced-motion takes priority even with ?title=1', () => {
    expect(shouldShowTitle({ ...base, reducedMotion: true, isDebug: true, forceTitle: true })).toBe(false);
  });

  it('all suppression flags: still hides', () => {
    expect(shouldShowTitle({ hasOpen: true, isDebug: true, forceTitle: false, reducedMotion: true, alreadyShown: true })).toBe(false);
  });
});

describe('INTRO_MS / AUTO_MS', () => {
  it('the intro runs 3200 ms', () => {
    expect(INTRO_MS).toBe(3200);
  });

  it('auto-dismiss holds the settled title for 2.5 s after the intro (5700 ms)', () => {
    expect(AUTO_MS).toBe(INTRO_MS + 2500);
    expect(AUTO_MS).toBe(5700);
    expect(AUTO_MS).toBeGreaterThan(INTRO_MS);
  });
});

describe('SHOW_SKIP_BUTTON', () => {
  it('is true: the intro animation needs a visible early exit for mouse/touch users', () => {
    expect(SHOW_SKIP_BUTTON).toBe(true);
  });

  it('is a boolean so it can be passed directly as the showSkip prop', () => {
    // The TitleScreen `showSkip` prop defaults to SHOW_SKIP_BUTTON.
    // The sr-only "Skip intro" button is always rendered; true adds the visible "Skip".
    // Rendering paths are covered by e2e; here we guard the flag type and value.
    expect(typeof SHOW_SKIP_BUTTON).toBe('boolean');
  });
});
