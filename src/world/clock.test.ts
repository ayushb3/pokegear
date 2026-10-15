import { describe, expect, it } from 'vitest';
import { nightByHour } from './clock';

describe('nightByHour', () => {
  it('is day from 06:00 to 19:59', () => {
    for (const h of [6, 7, 12, 19]) expect(nightByHour(h), String(h)).toBe(false);
  });
  it('is night from 20:00 to 05:59', () => {
    for (const h of [20, 23, 0, 3, 5]) expect(nightByHour(h), String(h)).toBe(true);
  });
});
