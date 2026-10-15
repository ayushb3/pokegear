// Writes public/assets/music/sample-piece.mid: the PLACEHOLDER for `music.piece` (assets.json).
// A short, simplified opening in the manner of Satie's Gymnopedie No. 1 (public domain), written by hand:
// 12 bars of 3/4 at 80 bpm = 27 s. Two tracks: right hand (melody) and left hand (bass + chords).
// Run: node scripts/make-piece.mjs   (uses @tonejs/midi, already a dependency)
import { mkdirSync, writeFileSync } from 'node:fs';
import tone from '@tonejs/midi';
const { Midi } = tone;

const PPQ = 480;
const BEAT = PPQ;
const BAR = BEAT * 3;
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const n = (s) => {
  const [, l, acc, oct] = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  return 12 * (Number(oct) + 1) + NOTE[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
};

const midi = new Midi();
midi.header.setTempo(80);
midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
midi.header.name = 'Sample piece (Gymnopedie No. 1, simplified opening)';
const rh = midi.addTrack();
rh.name = 'Right hand';
const lh = midi.addTrack();
lh.name = 'Left hand';

const add = (track, names, bar, beat, beats, vel) => {
  for (const name of [].concat(names)) track.addNote({ midi: n(name), ticks: bar * BAR + beat * BEAT, durationTicks: Math.round(beats * BEAT * 0.97), velocity: vel });
};

// left hand: bass on 1, chord on 2 (held through 3). Gmaj7 / Dmaj7 alternating, 12 bars.
for (let bar = 0; bar < 12; bar++) {
  const g = bar % 2 === 0;
  add(lh, g ? 'G2' : 'D3', bar, 0, 1.2, 0.55);
  add(lh, g ? ['B3', 'D4', 'F#4'] : ['A3', 'D4', 'F#4'], bar, 1, 2, 0.4);
}
// right hand: bars 5..12 (the first four are the introduction)
const mel = [
  [4, 0, 3, 'F#5'],
  [5, 0, 1, 'A5'], [5, 1, 1, 'G5'], [5, 2, 1, 'F#5'],
  [6, 0, 3, 'E5'],
  [7, 0, 1, 'D5'], [7, 1, 1, 'E5'], [7, 2, 1, 'F#5'],
  [8, 0, 3, 'F#5'],
  [9, 0, 1, 'A5'], [9, 1, 1, 'G5'], [9, 2, 1, 'F#5'],
  [10, 0, 3, 'E5'],
  [11, 0, 3, 'D5'],
];
for (const [bar, beat, beats, name] of mel) add(rh, name, bar, beat, beats, 0.7);

mkdirSync('public/assets/music', { recursive: true });
writeFileSync('public/assets/music/sample-piece.mid', Buffer.from(midi.toArray()));
console.log('wrote public/assets/music/sample-piece.mid', midi.duration.toFixed(1) + 's');
