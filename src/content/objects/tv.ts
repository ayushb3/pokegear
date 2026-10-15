import type { ObjectAction } from '../actions';

// `anim` plays the slot's frames once the TV has them (assets.json `frames`); until then the line just appears.
// Second line: Ayush's own watching habits (signed off by him).
const action: ObjectAction = {
  lines: [
    'A show is on. A trainer and their partner are heading out on a journey.',
    'Ayush likes to binge Monk before bed, or put on Babish or Andy Cooks while he cooks and eats.',
  ],
  anim: { ms: 1200 },
};
export default action;
