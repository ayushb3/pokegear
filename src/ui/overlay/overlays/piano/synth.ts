import { midiToFreq } from './keys';
import type { Voice } from './score';

/**
 * 8-bit voices on Web Audio: a 25% pulse (melody + the keys), a triangle (bass) and white noise (drums).
 * Short ADSR, everything through one low master gain so it is never harsh.
 */
export const MASTER_GAIN = 0.16;
const ADSR = { a: 0.005, d: 0.09, s: 0.55, r: 0.14 };
const PEAK: Record<Voice, number> = { pulse: 0.5, tri: 0.9, noise: 0.3 };
const DUTY = 0.25;
export const KILL_FADE = 0.015;

interface Bus {
  master: GainNode;
  pulse: PeriodicWave;
  noise: AudioBuffer;
}
const buses = new WeakMap<BaseAudioContext, Bus>();

function bus(ctx: AudioContext): Bus {
  let b = buses.get(ctx);
  if (!b) {
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
    // pulse wave of duty DUTY as a Fourier series
    const N = 48;
    const real = new Float32Array(N + 1);
    const imag = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) {
      real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * DUTY);
      imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(n * Math.PI * DUTY));
    }
    const pulse = ctx.createPeriodicWave(real, imag);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    b = { master, pulse, noise };
    buses.set(ctx, b);
  }
  return b;
}

export interface Playing {
  /** start the release at `at` (audio clock seconds); safe to call once */
  release(at?: number): void;
  /** cut now (short fade), for Stop */
  kill(): void;
}

/** Start one note at `when` (audio clock). It sustains until `release()`. */
export function noteOn(ctx: AudioContext, voice: Voice, midi: number, when: number, vel = 0.8): Playing {
  const b = bus(ctx);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(b.master);
  let src: OscillatorNode | AudioBufferSourceNode;
  if (voice === 'noise') {
    const s = ctx.createBufferSource();
    s.buffer = b.noise;
    s.loop = true;
    src = s;
  } else {
    const o = ctx.createOscillator();
    if (voice === 'pulse') o.setPeriodicWave(b.pulse);
    else o.type = 'triangle';
    o.frequency.value = midiToFreq(midi);
    src = o;
  }
  src.connect(gain);
  const peak = PEAK[voice] * vel;
  const g = gain.gain;
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(peak, when + ADSR.a);
  g.setTargetAtTime(peak * ADSR.s, when + ADSR.a, ADSR.d / 3);
  src.start(when);
  let ended = false;
  let killed = false;
  const stopAt = (at: number, tau: number) => {
    if (ended) return;
    ended = true;
    const t = Math.max(at, when + ADSR.a + 0.005);
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, tau);
    src.stop(t + tau * 8 + 0.02);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
  };
  return {
    release: (at = ctx.currentTime) => stopAt(at, ADSR.r / 3),
    kill: () => {
      // Always honours a cut, even after release() was scheduled ahead (the piece does that for every note):
      // fade to 0 over ~15 ms, stop the source (a not-yet-started note never sounds) and detach it.
      if (killed) return;
      killed = true;
      ended = true;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + KILL_FADE);
      try {
        src.stop(now + KILL_FADE + 0.005);
      } catch {
        /* already stopped */
      }
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
    },
  };
}
