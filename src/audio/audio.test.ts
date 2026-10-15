import { describe, expect, it, vi } from 'vitest';

// the real slots no longer include an sfx (the piano is synthesised): give the loader one to decode
vi.mock('../assets/useAsset', () => ({ sfxSlots: () => ['sfx.test'], getSfxPath: () => '/assets/sfx/test.mp3' }));

describe('audio unlock', () => {
  it('unlocks on pointerup/touchend/click, decodes, resumes if suspended on play', async () => {
    const listeners = new Map<string, () => void>();
    const started: number[] = [];
    class FakeCtx {
      state = 'suspended';
      destination = {};
      resume = vi.fn(async () => {
        this.state = 'running';
      });
      decodeAudioData = vi.fn(async () => ({ fake: true }));
      createBufferSource() {
        return { buffer: null, connect() {}, start: () => started.push(1) };
      }
    }
    const win = { AudioContext: FakeCtx, addEventListener: (t: string, f: () => void) => listeners.set(t, f) };
    vi.stubGlobal('window', win);
    vi.stubGlobal('fetch', async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    const { initAudio, playSfx, isMuted, setMuted } = await import('./audio');
    expect(isMuted()).toBe(true); // off by default (no storage here: still off)
    initAudio();
    for (const t of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) expect(listeners.has(t)).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(playSfx('sfx.test')).toBe(false); // muted
    setMuted(false);
    expect(started.length).toBe(0); // muted: nothing played, nothing queued
    listeners.get('pointerup')!(); // still muted: a tap does not unlock
    setMuted(false); // the toggle press is the unlock gesture
    await new Promise((r) => setTimeout(r, 10));
    expect(playSfx('sfx.test')).toBe(true);
    expect(started.length).toBe(1);
    vi.unstubAllGlobals();
  });
});
