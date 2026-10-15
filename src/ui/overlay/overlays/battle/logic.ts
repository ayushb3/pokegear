import type { BattleData } from '../../../../content/battle';

/**
 * The battle as a pure state machine (no React, no DOM): the overlay renders `screen` and feeds it events.
 *
 *   intro ──introDone──▶ text("A wild RECRUITER appeared!", "Go! OSHAWOTT!") ──▶ menu
 *   menu: FIGHT ▶ moves · BAG ▶ bag · POKéMON ▶ text ▶ menu · RUN (or B) ▶ text("Got away safely!") ▶ closed
 *   moves: A on a move with PP ▶ text(used X!, the résumé line, effect) ▶ enemy turn ▶ menu, or ▶ win ▶ links
 *          A on a spent move ▶ text("no PP left") ▶ moves · B ▶ menu
 *   bag: A on an item with a count ▶ text (count - 1) ▶ enemy turn · A on an item at ×0 ▶ text("none left") ▶ bag · B ▶ menu
 *        (the bag never opens the résumé: that is only ever a row on the final links screen)
 *   links: A ▶ open the selected link (the component does it) · B ▶ closed
 *
 * Every move has 1 PP and the recruiter's HP is the sum of their power, so winning shows every line once.
 * The recruiter's attacks never take OSHAWOTT below 1 HP: there is no losing, only RUN.
 */
export type Then = 'menu' | 'moves' | 'bag' | 'enemy' | 'win' | 'links' | 'run';
export type Screen =
  | { kind: 'intro' }
  | { kind: 'text'; lines: string[]; then: Then }
  | { kind: 'menu'; cursor: number }
  | { kind: 'moves'; cursor: number }
  | { kind: 'bag'; cursor: number }
  | { kind: 'links'; cursor: number }
  | { kind: 'closed'; reason: 'run' | 'won' };

export interface BattleState {
  screen: Screen;
  enemyHp: number;
  playerHp: number;
  /** PP left per move (1 each) */
  pp: number[];
  /** count left per BAG_ITEMS entry; a new battle (initialState) restocks it */
  bag: number[];
  /** the recruiter's next move (round robin) */
  enemyMove: number;
  /** last hit, for the top-screen animation; `n` increments so a repeat replays */
  hit: { who: 'enemy' | 'player'; n: number } | null;
  won: boolean;
}

export type BattleEvent =
  | { type: 'introDone' }
  | { type: 'textDone' }
  | { type: 'a' }
  | { type: 'b' }
  | { type: 'dir'; dir: 'up' | 'down' | 'left' | 'right' }
  | { type: 'select'; index: number };

export const MENU = ['FIGHT', 'BAG', 'POKéMON', 'RUN'] as const;
/** The bag's items and their stock at the start of every battle. */
export const BAG_ITEMS = [{ name: 'RÉSUMÉ', count: 1 }] as const;
/** The bag row, HGSS style: "RÉSUMÉ ×1". At 0 the row stays (greyed, "×0") so the pocket never looks broken. */
export const bagLabel = (i: number, count: number) => `${BAG_ITEMS[i]!.name} ×${count}`;

export function initialState(data: BattleData): BattleState {
  return {
    screen: { kind: 'intro' },
    enemyHp: data.enemy.hp,
    playerHp: data.player.hp,
    pp: data.moves.map(() => 1),
    bag: BAG_ITEMS.map((it) => it.count),
    enemyMove: 0,
    hit: null,
    won: false,
  };
}

/** 2 x 2 grid cursor: left/right flip the column, up/down flip the row (never leaves the grid). */
export function gridMove(cursor: number, dir: 'up' | 'down' | 'left' | 'right', count: number): number {
  let next = cursor;
  if (dir === 'left' || dir === 'right') next = cursor ^ 1;
  else next = cursor ^ 2;
  return next < count ? next : cursor;
}

const SUPER = "It's super effective!";
/** The closing line of a move: the win line, else the generic one unless the move's own text already says it. */
function effect(moveText: string, done: boolean, enemy: string): string[] {
  if (done) return [`${enemy} was convinced!`];
  return moveText.includes(SUPER) ? [] : [SUPER];
}

export function battleReducer(state: BattleState, ev: BattleEvent, data: BattleData): BattleState {
  const s = state.screen;
  const text = (lines: string[], then: Then): Screen => ({ kind: 'text', lines, then });

  if (s.kind === 'intro') {
    if (ev.type === 'introDone') return { ...state, screen: text([`A wild ${data.enemy.name} appeared!`, `Go! ${data.player.name}!`], 'menu') };
    return state;
  }

  if (s.kind === 'text') {
    if (ev.type !== 'textDone') return state; // A / B page the text; the component reports the end
    switch (s.then) {
      case 'menu':
        return { ...state, screen: { kind: 'menu', cursor: 0 } };
      case 'moves':
        return { ...state, screen: { kind: 'moves', cursor: 0 } };
      case 'bag':
        return { ...state, screen: { kind: 'bag', cursor: 0 } };
      case 'links':
        return { ...state, screen: { kind: 'links', cursor: 0 } };
      case 'run':
        return { ...state, screen: { kind: 'closed', reason: 'run' } };
      case 'win':
        return { ...state, won: true, screen: text([`${data.enemy.name} wants to connect!`], 'links') };
      case 'enemy': {
        const m = data.enemy.moves[state.enemyMove % data.enemy.moves.length]!;
        const playerHp = Math.max(1, state.playerHp - data.enemy.damage);
        return {
          ...state,
          playerHp,
          enemyMove: state.enemyMove + 1,
          hit: { who: 'player', n: (state.hit?.n ?? 0) + 1 },
          screen: text([`${data.enemy.name} used ${m.name}!`, m.text], 'menu'),
        };
      }
    }
  }

  if (s.kind === 'menu') {
    if (ev.type === 'dir') return { ...state, screen: { ...s, cursor: gridMove(s.cursor, ev.dir, MENU.length) } };
    if (ev.type === 'b') return { ...state, screen: text(['Got away safely!'], 'run') };
    const pick = ev.type === 'a' ? s.cursor : ev.type === 'select' ? ev.index : -1;
    if (pick === 0) return { ...state, screen: { kind: 'moves', cursor: 0 } };
    if (pick === 1) return { ...state, screen: { kind: 'bag', cursor: 0 } };
    if (pick === 2) return { ...state, screen: text([`${data.player.name} is the only Pokémon in the party.`], 'menu') };
    if (pick === 3) return { ...state, screen: text(['Got away safely!'], 'run') };
    return state;
  }

  if (s.kind === 'moves') {
    if (ev.type === 'dir') return { ...state, screen: { ...s, cursor: gridMove(s.cursor, ev.dir, data.moves.length) } };
    if (ev.type === 'b') return { ...state, screen: { kind: 'menu', cursor: 0 } };
    const pick = ev.type === 'a' ? s.cursor : ev.type === 'select' ? ev.index : -1;
    const move = data.moves[pick];
    if (!move) return state;
    if ((state.pp[pick] ?? 0) <= 0) return { ...state, screen: text(["There's no PP left for this move!"], 'moves') };
    const pp = state.pp.slice();
    pp[pick] = 0;
    const enemyHp = Math.max(0, state.enemyHp - move.power);
    const done = enemyHp <= 0;
    return {
      ...state,
      pp,
      enemyHp,
      hit: { who: 'enemy', n: (state.hit?.n ?? 0) + 1 },
      screen: text([`${data.player.name} used ${move.name}!`, move.text, ...effect(move.text, done, data.enemy.name)], done ? 'win' : 'enemy'),
    };
  }

  if (s.kind === 'bag') {
    if (ev.type === 'b') return { ...state, screen: { kind: 'menu', cursor: 0 } };
    const pick = ev.type === 'a' ? s.cursor : ev.type === 'select' ? ev.index : -1;
    if (pick < 0 || pick >= BAG_ITEMS.length) return state;
    if ((state.bag[pick] ?? 0) <= 0) return { ...state, screen: text([`There are no ${BAG_ITEMS[pick]!.name}S left!`], 'bag') };
    const bag = state.bag.slice();
    bag[pick] = bag[pick]! - 1;
    return { ...state, bag, screen: text([`${data.player.name} handed over the résumé.`], 'enemy') };
  }

  if (s.kind === 'links') {
    if (ev.type === 'b') return { ...state, screen: { kind: 'closed', reason: 'won' } };
    return state; // the component owns the link cursor (A opens a link, a side effect)
  }

  return state;
}
