import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let night = false;
vi.mock('../world/api', () => ({ isNight: () => night }));

const glyphs = new Set<number>(JSON.parse(readFileSync(fileURLToPath(new URL('./fontGlyphs.json', import.meta.url)), 'utf8')) as number[]);

describe('mom lines', () => {
  beforeEach(() => {
    night = false;
    vi.resetModules();
  });

  it('day talks rotate through every set in order, then wrap', async () => {
    const { default: mom, DAY } = await import('./objects/mom');
    const seen = DAY.map(() => mom.lines);
    expect(seen).toEqual(DAY);
    expect(mom.lines).toEqual(DAY[0]);
  });

  it('night always gives the night lines and does not advance the day rotation', async () => {
    const { default: mom, DAY, NIGHT } = await import('./objects/mom');
    night = true;
    expect(mom.lines).toEqual(NIGHT);
    expect(mom.lines).toEqual(NIGHT);
    night = false;
    expect(mom.lines).toEqual(DAY[0]);
  });

  it('every line renders in the pixel font and stays short (about 3 lines in the box)', async () => {
    const { DAY, NIGHT } = await import('./objects/mom');
    for (const line of [...DAY.flat(), ...NIGHT]) {
      for (const ch of line) expect(ch === ' ' || glyphs.has(ch.codePointAt(0)!), `${ch} in ${line}`).toBe(true);
      expect(line.length, line).toBeLessThanOrEqual(90);
    }
  });
});
