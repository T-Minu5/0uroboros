import type { PlayerId } from '@0uroboros/engine/game';
import type { EndGameStanding } from '@0uroboros/engine/runtime';

type Props = {
  standings: readonly EndGameStanding[];
  colors: readonly [{ accent: string }, { accent: string }];
  names?: readonly [string, string];
};

/**
 * Far-left live end-game award race. Replaces the ControlledWeight tug for now:
 * one compact row per enabled award (including Most Circuits) with the current leader.
 */
export function EndGameAwardsColumn({ standings, colors, names = ['You', 'Opp'] }: Props) {
  if (!standings.length) return null;
  const leaderLabel = (leader: PlayerId | null) => {
    if (leader === null) return 'Tie';
    return names[leader] ?? (leader === 0 ? 'You' : 'Opp');
  };
  return <aside className='endgame-awards' aria-label='End-game awards'>
    <header className='endgame-awards-head'>
      <b>End-game</b>
    </header>
    <ol className='endgame-awards-list'>
      {standings.map(row => {
        const leading = row.leader !== null;
        const accent = leading ? colors[row.leader!].accent : undefined;
        return <li key={row.id} className={leading ? 'is-lead' : 'is-tie'}>
          <span className='endgame-awards-label' title={`${row.label} · +${row.vp} VP`}>
            <span>{row.label}</span>
            <small>+{row.vp}</small>
          </span>
          <span className='endgame-awards-leader' style={accent ? { color: accent } : undefined}>
            {leaderLabel(row.leader)}
          </span>
          <span className='endgame-awards-score' aria-label={`${row.scores[0]} to ${row.scores[1]}`}>
            {row.scores[0]}–{row.scores[1]}
          </span>
        </li>;
      })}
    </ol>
  </aside>;
}
