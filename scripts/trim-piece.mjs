// Trims a full MIDI to an excerpt: keeps every note that STARTS before `endSec` (clamping durations to it), drops the rest.
// Original tempo and notes untouched; nothing is added.
// Used for music.piece: `in the pool` (Kensuke Ushio), the opening theme up to the first long rest (44.9 s).
//   node scripts/trim-piece.mjs <in.mid> <out.mid> <endSec>      (46 s falls inside that rest)
import { readFileSync, writeFileSync } from 'node:fs';
import midiPkg from '@tonejs/midi';

const { Midi } = midiPkg;
const [inPath, outPath, endArg] = process.argv.slice(2);
const end = Number(endArg);
if (!inPath || !outPath || !(end > 0)) {
  console.error('usage: node scripts/trim-piece.mjs <in.mid> <out.mid> <endSec>');
  process.exit(1);
}
const midi = new Midi(readFileSync(inPath));
for (const tr of midi.tracks) {
  tr.notes = tr.notes.filter((n) => n.time < end - 1e-6);
  for (const n of tr.notes) if (n.time + n.duration > end) n.durationTicks = Math.max(1, midi.header.secondsToTicks(end) - n.ticks);
  for (const k of Object.keys(tr.controlChanges)) tr.controlChanges[k] = tr.controlChanges[k].filter((c) => c.time < end);
}
writeFileSync(outPath, Buffer.from(midi.toArray()));
const out = new Midi(readFileSync(outPath));
console.log(`wrote ${outPath}: ${out.duration.toFixed(1)}s, ${out.tracks.reduce((s, t) => s + t.notes.length, 0)} notes`);
