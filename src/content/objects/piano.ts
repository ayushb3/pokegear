import type { ObjectAction } from '../actions';

// Narrator line, then the piano overlay (keys, "Ayush's piece"). The overlay owns the muted-state nudge.
const action: ObjectAction = { lines: ['Ayush sat down at the piano.'], emote: 'emote.note', next: { overlay: 'piano' } };
export default action;
