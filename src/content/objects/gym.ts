import type { ObjectAction } from '../actions';
import gym from '../gym.json';

// The gym slot has a scripted `pose` (assets.json): Ethan walks onto the bench, lies down and presses the barbell for ~1s
// (2 reps), gets up and walks back (~1s more, ~2s in all). All skipped under prefers-reduced-motion. Then the narrator
// line and Ayush's own line (src/content/gym.json).
const action: ObjectAction = { lines: ['Ayush did a few reps.', gym.line], anim: { ms: 1000 } };
export default action;
