import { getAsset, getObjectAsset } from '../../../../assets/useAsset';
import type { BattleData } from '../../../../content/battle';
import type { BattleState } from './logic';

const RECRUITER = getObjectAsset('battle.recruiter');
const PLATFORM = getObjectAsset('battle.platform');

function level(hp: number, max: number): 'ok' | 'mid' | 'low' {
  const k = hp / max;
  return k > 0.5 ? 'ok' : k > 0.2 ? 'mid' : 'low';
}

function Bar({ hp, max }: { hp: number; max: number }) {
  return (
    <div className="bt-hp-row">
      <span className="bt-hp-label" aria-hidden="true">
        HP
      </span>
      <div className="bt-bar" role="img" aria-label={`HP ${hp} of ${max}`}>
        <div className="bt-bar-fill" data-level={level(hp, max)} style={{ width: `${Math.round((100 * hp) / max)}%` }} />
      </div>
    </div>
  );
}

/** The battle scene on the TOP screen: the recruiter on its platform, Oshawott's back, two HP boxes. */
export default function Scene({ state, data, shiny }: { state: BattleState; data: BattleData; shiny: boolean }) {
  const follower = getAsset(shiny ? 'sprite.follower-shiny' : 'sprite.follower');
  const hit = state.hit;
  return (
    <div className={`bt${state.won ? ' bt-won' : ''}`} data-testid="battle-scene" data-enemy-hp={state.enemyHp} data-player-hp={state.playerHp}>
      <div className="bt-platform bt-platform-enemy" style={{ backgroundImage: `url(${PLATFORM.path})` }} aria-hidden="true" />
      <div className="bt-platform bt-platform-player" style={{ backgroundImage: `url(${PLATFORM.path})` }} aria-hidden="true" />
      <div
        key={hit ? `e${hit.n}` : 'e'}
        className="bt-enemy"
        role="img"
        aria-label={`A wild ${data.enemy.name}`}
        style={{ backgroundImage: `url(${RECRUITER.path})` }}
        data-hit={hit?.who === 'enemy' ? '' : undefined}
        data-lunge={hit?.who === 'player' ? '' : undefined}
      />
      <div
        key={hit ? `p${hit.n}` : 'p'}
        className="bt-player"
        role="img"
        aria-label={data.player.name}
        style={{ backgroundImage: `url(${follower.path})` }}
        data-hit={hit?.who === 'player' ? '' : undefined}
        data-lunge={hit?.who === 'enemy' ? '' : undefined}
      />
      <div className="bt-box bt-box-enemy">
        <div className="bt-name">
          <span>{data.enemy.name}</span>
          <span className="bt-lv">Lv?</span>
        </div>
        <Bar hp={state.enemyHp} max={data.enemy.hp} />
      </div>
      <div className="bt-box bt-box-player">
        <div className="bt-name">
          <span>{data.player.name}</span>
          <span className="bt-lv">Lv?</span>
        </div>
        <Bar hp={state.playerHp} max={data.player.hp} />
        <div className="bt-hp-num">
          {state.playerHp}/{data.player.hp}
        </div>
      </div>
    </div>
  );
}
