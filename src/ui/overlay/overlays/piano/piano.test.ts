import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Midi } from '@tonejs/midi';
import assets from '../../../../assets/assets.json';
import { FIRST, KEYMAP, KEYS, LAST, WHITE_COUNT, foldToRange, isBlack, midiToFreq, moveCursor, noteName } from './keys';
import { activeAt, lengthOf, schedule, toEvents, type MidiLike } from './score';
import { KILL_FADE, noteOn } from './synth';

describe('key layout', () => {
  it('spans C4..B5: 24 keys, 14 white, 10 black', () => {
    expect(KEYS).toHaveLength(24);
    expect(KEYS[0]!.midi).toBe(60);
    expect(KEYS.at(-1)!.midi).toBe(83);
    expect(WHITE_COUNT).toBe(14);
    expect(KEYS.filter((k) => k.black)).toHaveLength(10);
    expect(noteName(60)).toBe('C4');
    expect(noteName(83)).toBe('B5');
    expect(noteName(61)).toBe('C#4');
  });
  it('black keys sit between their two neighbours', () => {
    for (const k of KEYS.filter((x) => x.black)) {
      const left = KEYS.find((x) => x.midi === k.midi - 1)!;
      expect(left.black).toBe(false);
      expect(k.white).toBe(left.white);
    }
  });
  it('pitch maths: A4 = 440 Hz, C5 an octave above C4', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(72) / midiToFreq(60)).toBeCloseTo(2);
  });
  it('cursor clamps to the keyboard', () => {
    expect(moveCursor(FIRST, -1)).toBe(FIRST);
    expect(moveCursor(LAST, 1)).toBe(LAST);
    expect(moveCursor(60, 1)).toBe(61);
  });
  it('folds out-of-range pitches into the visible octaves (lighting only)', () => {
    expect(foldToRange(43)).toBe(67); // G2 -> G4
    expect(foldToRange(96)).toBe(72);
    expect(foldToRange(70)).toBe(70);
  });
});

describe('computer keyboard mapping', () => {
  it('A S D F G H J K are the white keys C4..C5 and W E T Y U the black ones in between', () => {
    const whites = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'].map((c) => KEYMAP[c]);
    expect(whites).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(whites.every((m) => !isBlack(m!))).toBe(true);
    const blacks = ['KeyW', 'KeyE', 'KeyT', 'KeyY', 'KeyU'].map((c) => KEYMAP[c]);
    expect(blacks).toEqual([61, 63, 66, 68, 70]);
    expect(blacks.every((m) => isBlack(m!))).toBe(true);
  });
  it('continues into the second octave and every mapped note has a key', () => {
    expect(KEYMAP.KeyL).toBe(74);
    expect(KEYMAP.KeyO).toBe(73);
    expect(KEYMAP.Semicolon).toBe(76);
    for (const m of Object.values(KEYMAP)) expect(m >= FIRST && m <= LAST).toBe(true);
    expect(new Set(Object.values(KEYMAP)).size).toBe(Object.keys(KEYMAP).length); // no two keys share a note
  });
  it('leaves the host keys alone (Z = A button, X = B button, Space / Enter / Escape)', () => {
    for (const c of ['KeyZ', 'KeyX', 'Space', 'Enter', 'Escape', 'Backspace']) expect(KEYMAP[c]).toBeUndefined();
  });
});

const note = (midi: number, time: number, duration = 0.5, velocity = 0.8) => ({ midi, time, duration, velocity });

describe('MIDI -> note events', () => {
  it('two pitched tracks: highest-pitched is the pulse melody, the other the triangle bass; drums are noise', () => {
    const m: MidiLike = {
      tracks: [
        { channel: 0, notes: [note(43, 0), note(55, 1)] },
        { channel: 1, notes: [note(74, 0.5), note(76, 1)] },
        { channel: 9, instrument: { percussion: true }, notes: [note(36, 0.25)] },
      ],
    };
    const ev = toEvents(m);
    expect(ev.map((e) => [e.t, e.midi, e.voice])).toEqual([
      [0, 43, 'tri'],
      [0.25, 36, 'noise'],
      [0.5, 74, 'pulse'],
      [1, 55, 'tri'],
      [1, 76, 'pulse'],
    ]);
  });
  it('one pitched track (a keyboard export): split at middle C', () => {
    const ev = toEvents({ tracks: [{ notes: [note(48, 0), note(72, 0), note(60, 1), note(59, 1)] }] });
    expect(ev.filter((e) => e.voice === 'tri').map((e) => e.midi)).toEqual([48, 59]);
    expect(ev.filter((e) => e.voice === 'pulse').map((e) => e.midi)).toEqual([72, 60]);
  });
  it('sorts by time, clamps velocity and tiny durations', () => {
    const ev = toEvents({ tracks: [{ notes: [note(72, 2, 0.5), note(74, 1, 0.001, 5), note(76, 3, 1, 0)] }] });
    expect(ev.map((e) => e.t)).toEqual([1, 2, 3]);
    expect(ev[0]!.dur).toBeGreaterThanOrEqual(0.05);
    expect(ev[0]!.vel).toBe(1);
    expect(ev[2]!.vel).toBeGreaterThan(0);
  });
  it('active notes at a time, with a minimum flash; noise never lights a key', () => {
    const ev = toEvents({
      tracks: [
        { notes: [note(72, 0, 1), note(74, 1, 0.01)] },
        { channel: 9, notes: [note(36, 0, 1)] },
      ],
    });
    expect(activeAt(ev, 0.5).map((e) => e.midi)).toEqual([72]);
    expect(activeAt(ev, 1.05).map((e) => e.midi)).toEqual([74]); // 10 ms note still shows for the flash window
    expect(activeAt(ev, 1.5)).toEqual([]);
    expect(lengthOf(ev)).toBeCloseTo(1.06, 1);
  });
  it('schedule offsets every event by the clock base', () => {
    const s = schedule(toEvents({ tracks: [{ notes: [note(72, 1, 0.5)] }] }), 10);
    expect(s[0]!.start).toBe(11);
    expect(s[0]!.end).toBe(11.5);
  });
  it('round-trips a real .mid file through @tonejs/midi', () => {
    const m = new Midi();
    m.header.setTempo(120);
    const t = m.addTrack();
    t.addNote({ midi: 72, time: 0, duration: 0.5, velocity: 0.7 });
    t.addNote({ midi: 48, time: 0.5, duration: 0.5, velocity: 0.7 });
    const ev = toEvents(new Midi(m.toArray()));
    expect(ev.map((e) => [e.midi, e.voice])).toEqual([[72, 'pulse'], [48, 'tri']]);
    expect(ev[1]!.t).toBeCloseTo(0.5, 2);
  });
});

describe('the shipped piece (music.piece)', () => {
  it('is the real "in the pool" excerpt: parses to under 75 s with melody + bass, notes outside C4-B5 are kept (keys fold them)', () => {
    const slot = assets['music.piece'] as { path: string; placeholder?: boolean };
    expect(slot.placeholder).toBeUndefined();
    const ev = toEvents(new Midi(readFileSync(new URL(`../../../../../public${slot.path}`, import.meta.url))));
    const len = lengthOf(ev);
    expect(len).toBeGreaterThan(30);
    expect(len).toBeLessThan(75);
    expect(ev).toHaveLength(175);
    expect(new Set(ev.map((e) => e.voice))).toEqual(new Set(['pulse', 'tri']));
    expect(ev.some((e) => e.midi < FIRST || e.midi > LAST)).toBe(true);
    for (const e of ev) {
      const k = foldToRange(e.midi);
      expect(k >= FIRST && k <= LAST).toBe(true);
    }
  });
});

describe('synth', () => {
  it('a note is a pulse oscillator at the right pitch through a gain, with an ADSR; release stops it', () => {
    const calls: string[] = [];
    const param = () => ({ value: 0, setValueAtTime: vi.fn(() => calls.push('set')), linearRampToValueAtTime: vi.fn(() => calls.push('ramp')), setTargetAtTime: vi.fn(() => calls.push('target')), cancelScheduledValues: vi.fn() });
    const osc = { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), setPeriodicWave: vi.fn(), type: 'sine' };
    const gain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
    const ctx = {
      currentTime: 0,
      sampleRate: 8000,
      destination: {},
      createGain: () => gain,
      createOscillator: () => osc,
      createPeriodicWave: vi.fn(() => ({})),
      createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
      createBufferSource: vi.fn(),
    } as unknown as AudioContext;
    const p = noteOn(ctx, 'pulse', 69, 1);
    expect(osc.frequency.value).toBeCloseTo(440);
    expect(osc.setPeriodicWave).toHaveBeenCalled();
    expect(osc.start).toHaveBeenCalledWith(1);
    expect(calls).toEqual(['set', 'ramp', 'target']); // attack, decay-to-sustain
    p.release(2);
    expect(osc.stop).toHaveBeenCalledTimes(1);
    expect(osc.stop.mock.calls[0]![0]).toBeGreaterThan(2);
    p.kill(); // a scheduled release must NOT stop a cut: kill still stops the source now
    expect(osc.stop).toHaveBeenCalledTimes(2);
    noteOn(ctx, 'tri', 48, 0);
    expect(osc.type).toBe('triangle');
  });

  it('kill() cuts a note scheduled ahead (already released), fades to 0, stops and detaches; twice is a no-op', () => {
    const ramps: Array<[number, number]> = [];
    const gp = { value: 0.4, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn((v: number, t: number) => ramps.push([v, t])), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
    const osc: Record<string, unknown> = { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), setPeriodicWave: vi.fn() };
    const gain = { gain: gp, connect: vi.fn(), disconnect: vi.fn() };
    const ctx = { currentTime: 5, sampleRate: 8000, destination: {}, createGain: () => gain, createOscillator: () => osc, createPeriodicWave: () => ({}), createBuffer: () => ({ getChannelData: () => new Float32Array(8) }) } as unknown as AudioContext;
    const p = noteOn(ctx, 'pulse', 60, 20); // starts far in the future
    p.release(21); // the piece pre-schedules the release, like startPiece does
    ramps.length = 0;
    p.kill();
    expect(gp.cancelScheduledValues).toHaveBeenLastCalledWith(5);
    expect(ramps).toEqual([[0, 5 + KILL_FADE]]);
    const stop = osc.stop as ReturnType<typeof vi.fn>;
    expect(stop.mock.calls.at(-1)![0]).toBeCloseTo(5 + KILL_FADE + 0.005);
    expect(stop.mock.calls.at(-1)![0]).toBeLessThan(6);
    (osc.onended as () => void)();
    expect(osc.disconnect).toHaveBeenCalled();
    expect(gain.disconnect).toHaveBeenCalled();
    p.kill();
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
