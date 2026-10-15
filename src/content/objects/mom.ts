import type { ObjectAction } from '../actions';
import { isNight } from '../../world/api';

// Lines Ayush gave (or signed off) about his mom. Nothing here may add facts about Ayush.
/** By day, each talk shows the next set (session-local, wraps). */
export const DAY: string[][] = [
  ['Mom is experimenting with a dish for her next private dinner.'],
  ['Mom made spaghetti with olive oil and cheese.', '“Your favourite! Eat while it\'s warm.”'],
  ['“Clean your suitcase wheels!”'],
  ['“Be in the moment. Nothing is worth the stress.”'],
  ['“Miss you! California feels so far away.”'],
  ['“Call me sometime, okay? I miss you.”'],
];
/** At night she always says this. */
export const NIGHT: string[] = ['Mom is winding down for the night.', '“Miss you, you know. Don\'t stay up too late.”'];

let next = 0;

const action: ObjectAction = {
  // Read once per talk (App.tsx), so the getter is where the set is picked.
  get lines() {
    if (isNight()) return NIGHT;
    const set = DAY[next % DAY.length]!;
    next += 1;
    return set;
  },
};
export default action;
