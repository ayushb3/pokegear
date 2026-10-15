import { describe, expect, it } from 'vitest';
import { frameClass } from './OverlayFrame';

describe('OverlayFrame classes', () => {
  it('a bottom-screen frame is also the .overlay root (layout, line metrics, the e2e hook)', () => {
    expect(frameClass('bottom', 'journal')).toBe('overlay oframe journal');
    expect(frameClass('bottom')).toBe('overlay oframe');
  });
  it('a top-screen frame is a full-screen layer and never an .overlay', () => {
    expect(frameClass('top', 'dx dx-grid')).toBe('oframe oframe-top dx dx-grid');
    expect(frameClass('top').split(' ')).not.toContain('overlay');
  });
});
