import type { EndGameStanding } from '@0uroboros/engine/runtime';

type Props = {
  standings: readonly EndGameStanding[];
  colors: readonly [{ accent: string }, { accent: string }];
};

/**
 * Far-left live end-game award race. Replaces the ControlledWeight tug for now:
 * one compact row per enabled award (including Most Circuits) with scores as Enemy n / m You.
 */
export function EndGameAwardsColumn({ standings, colors }: Props) {
  if (!standings.length) return null;
  return <aside className='endgame-awards' aria-label='End-game awards'>
    <header className='endgame-awards-head'>
      <b>End-game</b>
    </header>
    <ol className='endgame-awards-list'>
      {standings.map(row => {
        const [you, enemy] = row.scores;
        const youLead = row.leader === 0;
        const enemyLead = row.leader === 1;
        return <li key={row.id} className={row.leader !== null ? 'is-lead' : 'is-tie'}>
          <span className='endgame-awards-title'>{row.label}: {row.vp}VP</span>
          <span className='endgame-awards-race' aria-label={`Enemy ${enemy} to You ${you}`}>
            <span className={enemyLead ? 'is-winner' : undefined} style={enemyLead ? { color: colors[1].accent } : undefined}>Enemy {enemy}</span>
            <span className='endgame-awards-sep'> / </span>
            <span className={youLead ? 'is-winner' : undefined} style={youLead ? { color: colors[0].accent } : undefined}>{you} You</span>
          </span>
        </li>;
      })}
    </ol>
  </aside>;
}
