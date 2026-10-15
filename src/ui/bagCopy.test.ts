import { describe, expect, it } from 'vitest';
import { ALL_FURNITURE } from '../world/grid';
import { DESC } from './bagCopy';

describe('bag slot descriptions', () => {
  it('has a one-line "Name: thing" description for every object (the Card is a pad button, not a bag slot)', () => {
    for (const f of ALL_FURNITURE.filter((o) => o.id)) {
      expect(DESC[f.id as string], f.id as string).toMatch(new RegExp(`^${f.label}: .+`));
    }
    expect(DESC.card).toBeUndefined();
  });
});
