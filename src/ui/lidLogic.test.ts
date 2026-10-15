import { describe, expect, it } from 'vitest';
import { lidTransition } from './lidLogic';

describe('lid', () => {
  it('closing freezes the world only when nothing else holds the freeze', () => {
    expect(lidTransition({ was: false, hidden: true, first: false, ownsFreeze: false, othersHold: false })).toEqual({ freeze: true, resume: false, yawn: false });
    expect(lidTransition({ was: false, hidden: true, first: false, ownsFreeze: false, othersHold: true })).toEqual({ freeze: false, resume: false, yawn: false });
    expect(lidTransition({ was: true, hidden: true, first: false, ownsFreeze: true, othersHold: false })).toEqual({ freeze: false, resume: false, yawn: false });
  });
  it('opening releases only a freeze the lid placed, and Oshawott yawns', () => {
    expect(lidTransition({ was: true, hidden: false, first: false, ownsFreeze: true, othersHold: false })).toEqual({ freeze: false, resume: true, yawn: true });
    expect(lidTransition({ was: true, hidden: false, first: false, ownsFreeze: false, othersHold: true })).toEqual({ freeze: false, resume: false, yawn: true });
  });
  it('the first look does nothing when visible, closes (and freezes) when the tab opened in the background', () => {
    expect(lidTransition({ was: false, hidden: false, first: true, ownsFreeze: false, othersHold: false })).toEqual({ freeze: false, resume: false, yawn: false });
    expect(lidTransition({ was: true, hidden: true, first: true, ownsFreeze: false, othersHold: false })).toEqual({ freeze: true, resume: false, yawn: false });
  });
});
