import { controlledWeights, type PlayerId } from '@0uroboros/engine/game';

type Props = {
  weights: readonly number[];
  powers: readonly (readonly [number, number])[];
  winners: readonly (PlayerId | null)[];
  /** Weight-lottery Node revealed at Collapse; null while Runtime is still open. */
  particle: number | null;
  colors: readonly [{ accent: string }, { accent: string }];
};

/**
 * Far-left ControlledWeight tug-of-war. Opponent (seat 1) is the top end, you (seat 0) the bottom.
 * The dot slides toward whoever holds more weight; Collapse pins the particle Node label on the
 * side that won that Node.
 */
export function WeightTug({ weights, powers, winners, particle, colors }: Props) {
  const [mine, theirs] = controlledWeights(weights, powers);
  const total = mine + theirs;
  // 0 = all yours (bottom), 1 = all opponent (top). Empty board stays centered.
  const share = total > 0 ? theirs / total : 0.5;
  const particleWinner = particle !== null ? winners[particle] ?? null : null;
  const particleSide = particleWinner === 0 ? 'near' : particleWinner === 1 ? 'far' : particle !== null ? 'tie' : null;

  return <aside className='weight-tug' aria-label='Controlled weight' data-particle={particle ?? undefined}>
    <small className='weight-tug-end far' style={{ color: colors[1].accent }}>P2</small>
    <div className='weight-tug-track'>
      <i className='weight-tug-line' aria-hidden='true'/>
      <b
        className='weight-tug-dot'
        style={{
          top: `${share * 100}%`,
          background: share > 0.52 ? colors[1].accent : share < 0.48 ? colors[0].accent : '#d8d0e4',
          boxShadow: `0 0 10px ${share > 0.52 ? colors[1].accent : share < 0.48 ? colors[0].accent : '#d8d0e488'}`,
        }}
        title={`You ${Math.round(mine)} · Opponent ${Math.round(theirs)}`}
      />
      {particleSide && particle !== null && <span className={`weight-tug-particle ${particleSide}`} aria-label={`Particle on Node ${particle + 1}`}>
        N{particle + 1}
      </span>}
    </div>
    <small className='weight-tug-end near' style={{ color: colors[0].accent }}>P1</small>
  </aside>;
}
