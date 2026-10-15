import { describe, expect, it } from 'vitest';
import { OPEN_OVERLAYS, openForOverlay, overlayForOpen } from './deeplink';
import { OVERLAYS } from './overlay/registry';

describe('?open= overlay deep links', () => {
  it('maps each value to a registered overlay', () => {
    for (const [value, id] of Object.entries(OPEN_OVERLAYS)) expect(OVERLAYS[id], value).toBeDefined();
  });
  it('parses known values, including the plain-page names', () => {
    expect(overlayForOpen('townmap')).toBe('townmap');
    expect(overlayForOpen('photos')).toBe('corkboard');
    expect(overlayForOpen('food')).toBe('fridge');
  });
  it('ignores unknown, empty and prototype-ish values', () => {
    for (const v of [null, '', 'nope', 'card', 'projects/x', 'constructor', '__proto__', 'toString']) expect(overlayForOpen(v), String(v)).toBeNull();
  });
  it('round-trips overlay id back to the value', () => {
    for (const [value, id] of Object.entries(OPEN_OVERLAYS)) expect(openForOverlay(id)).toBe(value);
    expect(openForOverlay('dialogue')).toBeNull();
    expect(openForOverlay(null)).toBeNull();
  });
});
