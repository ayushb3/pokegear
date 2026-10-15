/**
 * MIDI -> note events for the 8-bit synth. Pure: takes the shape @tonejs/midi produces (seconds already
 * tempo-resolved), returns a time-sorted list of events with a chiptune voice each.
 *
 * Voices: melody = pulse, bass = triangle, drums = noise.
 *  - GM percussion (channel 10) -> noise.
 *  - Two or more pitched tracks: the track with the highest mean pitch is the melody, the rest are bass.
 *  - One pitched track (a keyboard export, both hands): split by pitch at SPLIT.
 */
export type Voice = 'pulse' | 'tri' | 'noise';

export interface MidiNoteLike {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
}
export interface MidiTrackLike {
  channel?: number;
  instrument?: { percussion?: boolean };
  notes: MidiNoteLike[];
}
export interface MidiLike {
  tracks: MidiTrackLike[];
}
export interface NoteEvent {
  /** seconds from the start of the piece */
  t: number;
  dur: number;
  midi: number;
  vel: number;
  voice: Voice;
}

export const SPLIT = 60; // middle C: below is the left hand
const MIN_DUR = 0.06;

const isDrums = (t: MidiTrackLike) => t.instrument?.percussion === true || t.channel === 9;
const mean = (t: MidiTrackLike) => t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length;

export function toEvents(m: MidiLike): NoteEvent[] {
  const pitched = m.tracks.filter((t) => !isDrums(t) && t.notes.length > 0);
  const melodyTrack = pitched.length >= 2 ? pitched.reduce((a, b) => (mean(b) > mean(a) ? b : a)) : null;
  const out: NoteEvent[] = [];
  for (const tr of m.tracks) {
    const drums = isDrums(tr);
    for (const n of tr.notes) {
      const voice: Voice = drums ? 'noise' : melodyTrack ? (tr === melodyTrack ? 'pulse' : 'tri') : n.midi < SPLIT ? 'tri' : 'pulse';
      out.push({ t: n.time, dur: Math.max(MIN_DUR, n.duration), midi: n.midi, vel: Math.min(1, Math.max(0.1, n.velocity)), voice });
    }
  }
  return out.sort((a, b) => a.t - b.t || a.midi - b.midi);
}

/** Total length of the piece in seconds (end of the last note). */
export const lengthOf = (ev: NoteEvent[]) => ev.reduce((m, e) => Math.max(m, e.t + e.dur), 0);

/** Events sounding at time `t` (seconds). A note shows for at least `minShow` so quick notes still flash. */
export function activeAt(ev: NoteEvent[], t: number, minShow = 0.12): NoteEvent[] {
  return ev.filter((e) => e.voice !== 'noise' && t >= e.t && t < e.t + Math.max(e.dur, minShow));
}

/** Schedule plan for an audio clock: when each event starts / ends relative to `base` (the clock time of piece t = 0). */
export function schedule(ev: NoteEvent[], base: number) {
  return ev.map((e) => ({ ...e, start: base + e.t, end: base + e.t + e.dur }));
}
