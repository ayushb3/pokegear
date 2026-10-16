import type { ObjectAction } from '../actions';

// Narrator line, then the radio overlay (the same one as Start > Radio).
const action: ObjectAction = { lines: ["Ayush's radio hums."], emote: 'emote.note', next: { overlay: 'radio' } };
export default action;
