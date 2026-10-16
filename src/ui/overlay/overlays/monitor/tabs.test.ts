import { describe, expect, it } from 'vitest';
import { PAGES, stepPage } from './tabs';

describe('monitor pages', () => {
  it('opens on Market, then Journal', () => {
    expect(PAGES.map((p) => p.id)).toEqual(['market', 'journal']);
  });
  it('L / R step and wrap', () => {
    expect(stepPage('market', 1)).toBe('journal');
    expect(stepPage('journal', 1)).toBe('market');
    expect(stepPage('market', -1)).toBe('journal');
    expect(stepPage('journal', -1)).toBe('market');
  });
});
