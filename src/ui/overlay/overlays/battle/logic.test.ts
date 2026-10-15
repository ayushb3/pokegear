import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BATTLE } from '../../../../content/battle';
import { BAG_ITEMS, MENU, bagLabel, battleReducer, gridMove, initialState, type BattleEvent, type BattleState } from './logic';

const step = (s: BattleState, ...evs: BattleEvent[]) => evs.reduce((st, e) => battleReducer(st, e, BATTLE), s);
const text = (s: BattleState) => (s.screen.kind === 'text' ? s.screen.lines : null);

describe('battle data (facts only)', () => {
  const typ = readFileSync(new URL('../../../../../resume/resume.typ', import.meta.url), 'utf8').toLowerCase();
  it('four moves of 1 PP whose power sums to the recruiter HP: winning shows every line', () => {
    expect(BATTLE.moves).toHaveLength(4);
    expect(BATTLE.moves.reduce((n, m) => n + m.power, 0)).toBe(BATTLE.enemy.hp);
    expect(new Set(BATTLE.moves.map((m) => m.name)).size).toBe(4);
    for (const m of BATTLE.moves) expect(m.name.length, m.name).toBeLessThanOrEqual(14); // fits a 2 x 2 grid cell at 1x
  });
  it('the recruiter can never take Oshawott to 0: three turns of damage stay above zero', () => {
    expect(BATTLE.player.hp - BATTLE.enemy.damage * (BATTLE.moves.length - 1)).toBeGreaterThan(0);
  });
  it('every move line is backed by the résumé (each phrase is in the line AND in resume.typ) and names no client', () => {
    // `line`: lower-case phrases the move text must contain; `typ`: the résumé wording of the same facts
    const keys: Record<string, { line: string[]; typ: string[] }> = {
      'GOLDEN JUDGE': { line: ['llm-as-judge', 'golden dataset'], typ: ['llm-as-judge', 'golden dataset', 'automated eval pipeline'] },
      'SWARM MIND': { line: ['multi-agent research', 'reasoning ui'], typ: ['multi-agent research', 'reasoning interface'] },
      'SELF-BUILD': { line: ['bubblychef', 'issue', 'reviewed pr', '20 merged'], typ: ['bubblychef', 'agent loop', 'issue to reviewed pr', '20 merged prs'] },
      'LOOK FIRST': { line: ['ayush', 'pause', 'plan', 'approve'], typ: ['plan mode', 'pause', 'review and approve their plan'] },
    };
    expect(BATTLE.moves.map((m) => m.name)).toEqual(Object.keys(keys));
    for (const m of BATTLE.moves) {
      const k = keys[m.name]!;
      for (const p of k.line) expect(m.text.toLowerCase(), `${m.name} line: ${p}`).toContain(p);
      for (const p of k.typ) expect(typ, `${m.name} résumé: ${p}`).toContain(p);
    }
    for (const m of BATTLE.enemy.moves) expect(m.text, m.name).not.toMatch(/Ayush/); // the recruiter's lines are about Oshawott only
  });
  it('the résumé is only ever opened from the final links screen (the bag never opens it)', () => {
    const src = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
    // RESUME_PDF is used exactly twice: its declaration and the LINKS row. A third use would be an early open.
    expect(src.match(/RESUME_PDF/g)).toHaveLength(2);
    expect(src.slice(src.indexOf('const useBag'), src.indexOf('const isText'))).not.toMatch(/window\.open|location/);
  });
});

describe('battleReducer', () => {
  const s0 = initialState(BATTLE);
  it('intro -> appeared text -> menu', () => {
    expect(s0.screen).toEqual({ kind: 'intro' });
    expect(step(s0, { type: 'a' }).screen.kind).toBe('intro'); // A does nothing during the wipe
    const s1 = step(s0, { type: 'introDone' });
    expect(text(s1)).toEqual(['A wild RECRUITER appeared!', 'Go! OSHAWOTT!']);
    const s2 = step(s1, { type: 'textDone' });
    expect(s2.screen).toEqual({ kind: 'menu', cursor: 0 });
  });
  const menu = step(s0, { type: 'introDone' }, { type: 'textDone' });
  it('the 2 x 2 cursor never leaves the grid', () => {
    expect(gridMove(0, 'right', 4)).toBe(1);
    expect(gridMove(1, 'left', 4)).toBe(0);
    expect(gridMove(0, 'down', 4)).toBe(2);
    expect(gridMove(3, 'up', 4)).toBe(1);
    expect(gridMove(2, 'down', 3)).toBe(0); // two rows: down from the bottom row toggles back up
    expect(gridMove(1, 'down', 3)).toBe(1); // a 3-item grid: (1,1) does not exist, the cursor stays
    expect(MENU).toEqual(['FIGHT', 'BAG', 'POKéMON', 'RUN']);
    expect(BAG_ITEMS).toEqual([{ name: 'RÉSUMÉ', count: 1 }]);
    expect(bagLabel(0, 1)).toBe('RÉSUMÉ ×1');
  });
  it('RUN (and B at the menu) leaves the battle', () => {
    const run = step(menu, { type: 'dir', dir: 'down' }, { type: 'dir', dir: 'right' }, { type: 'a' });
    expect(text(run)).toEqual(['Got away safely!']);
    expect(step(run, { type: 'textDone' }).screen).toEqual({ kind: 'closed', reason: 'run' });
    expect(text(step(menu, { type: 'b' }))).toEqual(['Got away safely!']);
  });
  it('POKéMON just says who is in the party; BAG uses the résumé and costs a turn', () => {
    expect(text(step(menu, { type: 'select', index: 2 }))).toEqual(['OSHAWOTT is the only Pokémon in the party.']);
    const bag = step(menu, { type: 'dir', dir: 'right' }, { type: 'a' });
    expect(bag.screen).toEqual({ kind: 'bag', cursor: 0 });
    expect(step(bag, { type: 'b' }).screen.kind).toBe('menu');
    const used = step(bag, { type: 'a' });
    expect(text(used)).toEqual(['OSHAWOTT handed over the résumé.']);
    const enemyTurn = step(used, { type: 'textDone' });
    expect(enemyTurn.playerHp).toBe(BATTLE.player.hp - BATTLE.enemy.damage);
    expect(text(enemyTurn)![0]).toBe(`RECRUITER used ${BATTLE.enemy.moves[0]!.name}!`);
    expect(step(enemyTurn, { type: 'textDone' }).screen.kind).toBe('menu');
  });
  it('the bag count is real: the résumé is used once, then ×0 is refused without a turn; a new battle restocks it', () => {
    expect(menu.bag).toEqual([1]);
    const used = step(menu, { type: 'select', index: 1 }, { type: 'a' });
    expect(used.bag).toEqual([0]);
    const back = step(used, { type: 'textDone' }, { type: 'textDone' }); // the recruiter's turn, back to the menu
    expect(back.screen.kind).toBe('menu');
    const again = step(back, { type: 'select', index: 1 });
    expect(again.screen).toEqual({ kind: 'bag', cursor: 0 });
    const refused = step(again, { type: 'select', index: 0 });
    expect(text(refused)).toEqual(['There are no RÉSUMÉS left!']);
    expect(refused.bag).toEqual([0]);
    expect(refused.playerHp).toBe(back.playerHp); // no turn was spent: the recruiter does not answer
    expect(refused.enemyMove).toBe(back.enemyMove);
    expect(step(refused, { type: 'textDone' }).screen).toEqual({ kind: 'bag', cursor: 0 });
    expect(step(again, { type: 'a' }, { type: 'textDone' }).bag).toEqual([0]); // A at ×0 is refused too
    expect(step(again, { type: 'select', index: 5 })).toBe(again); // no such row
    expect(initialState(BATTLE).bag).toEqual([1]); // a new battle starts restocked
  });
  it('a spent move never comes back: every move can be used exactly once per battle', () => {
    let s = menu;
    s = step(s, { type: 'a' }, { type: 'select', index: 1 }, { type: 'textDone' }, { type: 'textDone' });
    for (let k = 0; k < 3; k++) {
      const r = step(s, { type: 'a' }, { type: 'select', index: 1 });
      expect(text(r)).toEqual(["There's no PP left for this move!"]);
      expect(r.enemyHp).toBe(BATTLE.enemy.hp - BATTLE.moves[1]!.power);
      s = step(r, { type: 'textDone' }, { type: 'b' });
    }
    expect(s.pp).toEqual([1, 0, 1, 1]);
  });
  it('a move: the line is the résumé fact, the recruiter loses HP, PP is spent, the recruiter answers', () => {
    const moves = step(menu, { type: 'a' });
    expect(moves.screen).toEqual({ kind: 'moves', cursor: 0 });
    const hit = step(moves, { type: 'a' });
    expect(hit.enemyHp).toBe(BATTLE.enemy.hp - BATTLE.moves[0]!.power);
    expect(hit.pp[0]).toBe(0);
    expect(hit.hit).toEqual({ who: 'enemy', n: 1 });
    // GOLDEN JUDGE's own line already says "It's super effective!", so the generic one is not repeated
    expect(text(hit)).toEqual(['OSHAWOTT used GOLDEN JUDGE!', BATTLE.moves[0]!.text]);
    const answer = step(hit, { type: 'textDone' });
    expect(answer.hit).toEqual({ who: 'player', n: 2 });
    expect(answer.playerHp).toBe(BATTLE.player.hp - BATTLE.enemy.damage);
    expect(step(answer, { type: 'textDone' }).screen.kind).toBe('menu');
    // the spent move
    const again = step(answer, { type: 'textDone' }, { type: 'a' }, { type: 'a' });
    expect(text(again)).toEqual(["There's no PP left for this move!"]);
    expect(again.enemyHp).toBe(hit.enemyHp);
    expect(step(again, { type: 'textDone' }).screen.kind).toBe('moves');
    expect(step(moves, { type: 'b' }).screen.kind).toBe('menu');
  });
  it('all four moves win: convinced -> wants to connect -> links; B closes as won', () => {
    let s = menu;
    for (let i = 0; i < 4; i++) {
      s = step(s, { type: 'a' }, { type: 'select', index: i }); // FIGHT, pick move i
      const lines = text(s)!;
      expect(lines[1]).toBe(BATTLE.moves[i]!.text);
      if (i < 3) {
        if (lines[1]!.includes("It's super effective!")) expect(lines).toHaveLength(2);
        else expect(lines[2]).toBe("It's super effective!");
        s = step(s, { type: 'textDone' }, { type: 'textDone' }); // the recruiter's turn, back to the menu
        expect(s.screen.kind).toBe('menu');
      }
    }
    expect(s.enemyHp).toBe(0);
    expect(text(s)![2]).toBe('RECRUITER was convinced!');
    s = step(s, { type: 'textDone' });
    expect(s.won).toBe(true);
    expect(text(s)).toEqual(['RECRUITER wants to connect!']);
    s = step(s, { type: 'textDone' });
    expect(s.screen).toEqual({ kind: 'links', cursor: 0 });
    expect(s.playerHp).toBe(BATTLE.player.hp - 3 * BATTLE.enemy.damage);
    expect(step(s, { type: 'b' }).screen).toEqual({ kind: 'closed', reason: 'won' });
  });
});
