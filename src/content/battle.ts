import data from './battle.json' with { type: 'json' };

/**
 * The wild RECRUITER battle (tall grass in the front yard). Every move is a line from the résumé (resume/resume.typ):
 * no fact appears here that is not there. 1 PP per move, so winning means every move gets used once.
 * The recruiter's moves are in-game flavour about Oshawott only, never about Ayush.
 */
export interface BattleMove {
  name: string;
  type: string;
  power: number;
  text: string;
}
export interface BattleData {
  enemy: { name: string; hp: number; damage: number; moves: { name: string; text: string }[] };
  player: { name: string; hp: number };
  moves: BattleMove[];
}

export const BATTLE: BattleData = data;
