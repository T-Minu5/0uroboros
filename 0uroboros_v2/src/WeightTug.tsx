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
 * The dot leans toward whoever is more likely to control the Circuit particle Node: aggregate
 * ControlledWeight during Runtime; once the particle is known, that Node's Power race.
 */
export function WeightTug({ weights, powers, winners, particle, colors }: Props) {
  const [mine, theirs] = controlledWeights(weights, powers);
  const total = mine + theirs;
  let share: number;
  if (particle !== null && powers[particle]) {
    const [ownPower, enemyPower] = powers[particle];
    const race = ownPower + enemyPower;
    // Opponent share along the track; 0.5 when empty or tied Power.
    share = race > 0 ? enemyPower / race : 0.5;
  } else {
    share = total > 0 ? theirs / total : 0.5;
  }
  // CSS top:0 is P2 (far); top:100% is P1 (near). Invert so opponent-heavy share goes up.
  const top = (1 - share) * 100;
  const particleWinner = particle !== null ? winners[particle] ?? null : null;
  const particleSide = particleWinner === 0 ? 'near' : particleWinner === 1 ? 'far' : particle !== null ? 'tie' : null;
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const maxWeight = Math.max(0, ...weights);
  const minWeight = weights.length ? Math.min(...weights) : 0;
  const weightSpan = maxWeight - minWeight;
  // Highest % at 60%; lower weights ease down to the established 25% baseline.
  const NODE_OPACITY_MAX = 0.6;
  const NODE_OPACITY_BASELINE = 0.25;
  const nodeOpacity = (weight: number) => {
    if (weightSpan <= 0) return NODE_OPACITY_MAX;
    return NODE_OPACITY_BASELINE + (NODE_OPACITY_MAX - NODE_OPACITY_BASELINE) * ((weight - minWeight) / weightSpan);
  };

  return <aside className='weight-tug' aria-label='Controlled weight' data-particle={particle ?? undefined}>
    <small className='weight-tug-end far' style={{ color: colors[1].accent }}>P2</small>
    <div className='weight-tug-body'>
      <ol className='weight-tug-nodes' aria-label='Node weights'>
        {weights.map((weight, index) => {
          const pct = weightTotal > 0 ? Math.round((100 * weight) / weightTotal) : 0;
          return <li key={index} className={particle === index ? 'active' : undefined} style={{ opacity: nodeOpacity(weight) }}>
            <span>N{index + 1}</span>
            <small>{pct}%</small>
          </li>;
        })}
      </ol>
      <div className='weight-tug-track'>
        <i className='weight-tug-line' aria-hidden='true'/>
        <b
          className='weight-tug-dot'
          style={{
            top: `${top}%`,
            background: share > 0.52 ? colors[1].accent : share < 0.48 ? colors[0].accent : '#d8d0e4',
            boxShadow: `0 0 10px ${share > 0.52 ? colors[1].accent : share < 0.48 ? colors[0].accent : '#d8d0e488'}`,
          }}
          title={particle !== null
            ? `Particle N${particle + 1}: You ${powers[particle]?.[0] ?? 0} · Opponent ${powers[particle]?.[1] ?? 0}`
            : `You ${Math.round(mine)} · Opponent ${Math.round(theirs)}`}
        />
        {particleSide && particle !== null && <span className={`weight-tug-particle ${particleSide}`} aria-label={`Particle on Node ${particle + 1}`}>
          N{particle + 1}
        </span>}
      </div>
    </div>
    <small className='weight-tug-end near' style={{ color: colors[0].accent }}>P1</small>
  </aside>;
}
