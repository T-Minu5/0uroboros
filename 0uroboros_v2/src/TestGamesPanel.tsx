import { useEffect, useState } from 'react';
import { AgentReader } from './AgentReader';
import { Fold, ReportControl } from './AgentsPanel';
import { AGENT_NAMES, AgentAvatar, type AgentId } from './agentAvatars';
import { cohortPhaseLabel, type AgentsApi, type ProfileChange } from './agentsApi';
import { loadGameSource } from './authoring/loadGameContent';

const COHORT_GAMES = [10, 20, 30, 50] as const;
const LEAGUE_ROUNDS = [1, 3, 5] as const;
const LEAGUE_SEEDS = [2, 4, 8] as const;
const MEMBERS = [
  { id: 'strat-g', key: 'stratG', style: 'Balanced' },
  { id: 't-5', key: 't5', style: 'Pure aggression' },
  { id: 'dv-8', key: 'dv8', style: 'Engine' },
  { id: 'vp-dog', key: 'vpDog', style: 'Pure economy' },
] as const;
const nameOf = (id: string) => AGENT_NAMES[id as AgentId] ?? id;
const FIELD_TEXT: Record<string, string> = { economyUntilCycle: 'economy through Cycle', chaosFromCycle: 'Chaos from Cycle', vpFromCycle: 'VP from Cycle', handCryptoTarget: 'Crypto target', minBuyScore: 'min buy score', dilution: 'dilution' };
function changeText(change: ProfileChange) {
  const parts = [
    ...Object.entries(FIELD_TEXT).filter(([field]) => change[field as keyof ProfileChange] !== undefined).map(([field, label]) => `${label} ${change[field as keyof ProfileChange] as number}`),
    ...Object.entries(change.weights ?? {}).map(([key, value]) => `${key} weight ${value}`),
    ...Object.entries(change.cardBias ?? {}).map(([id, value]) => `${id} bias ${value > 0 ? '+' : ''}${value}`),
  ];
  return parts.join(', ');
}
const RECIPIENTS = ['t-5', 'strat-g'] as const;
const pick = <T extends number>(values: readonly T[], value: number, fallback: T) => (values as readonly number[]).includes(value) ? value as T : fallback;

function Choice<T extends number>({ label, values, value, unit, disabled, onChange }: { label: string; values: readonly T[]; value: T; unit: (value: T) => string; disabled: boolean; onChange: (value: T) => void }) {
  return <div className='agents-cadence' role='radiogroup' aria-label={label}>
    <small>{label}</small>
    {values.map(entry => <button key={entry} type='button' role='radio' aria-checked={value === entry} disabled={disabled} onClick={() => onChange(entry)}>{unit(entry)}</button>)}
  </div>;
}

function Progress({ label, value, total }: { label: string; value: number; total: number }) {
  return <div className='agents-progress' aria-label={label}><span>{label}</span><i style={{ width: `${Math.min(100, (value / Math.max(1, total)) * 100)}%` }}/></div>;
}

/**
 * AI-vs-AI test games for the agents to learn from. Eco-Strat studies seeded cohorts in which both seats play Strat-G's
 * current best, frozen for the run; Strat-G, T-5, DV-8 and VP-Dog learn by playing each other in the league.
 */
export function TestGamesPanel({ agents }: { agents: AgentsApi }) {
  const { status, error, docs, update, act } = agents;
  const [deck, setDeck] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadGameSource().then(source => {
      const saved = source.decks.find(entry => entry.id === source.defaultDeckId);
      if (live && saved) setDeck(`${saved.name} (${saved.size} cards)`);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  if (!status) return <section className='test-games agents-panel'><p className='agents-note'>{error || 'Loading agents…'}</p></section>;
  const { settings, ecoStrat, cohort, league, mentoring, coaching } = status;
  const ecoOn = status.effective.ecoStrat;
  const leagueBusy = league.running;
  const baselineDone = ecoStrat.baseline.status === 'complete';
  const games = settings.ecoStrat.baselineGames;
  const players = MEMBERS.filter(member => status.effective[member.key]).length;
  const { rounds, seedsPerBlock, ecoObserves } = settings.league;
  const trials = players + (league.catchUp?.length ?? 0);
  const leagueGames = rounds * (players * (players - 1) / 2 * seedsPerBlock * 2 + trials * league.blocksPerTrial * seedsPerBlock * 4);
  const adopted = league.lastRun?.trials.filter(trial => /→ promising/.test(trial.result)).length ?? 0;
  const waitLeague = leagueBusy ? 'Wait for the league run to finish' : undefined;
  const journal = docs.find(doc => doc.id === 'eco-strat-journal');

  return <section className='test-games agents-panel' aria-label='Agent games'>
    <p className='test-games-meta'>AI vs AI on {deck ? <>the saved deck <b>{deck}</b></> : 'the saved deck'}</p>

    <article className='test-games-card' aria-label='Eco-Strat study'>
      <header><AgentAvatar agent='eco-strat' size={24}/><span><strong>Eco-Strat study</strong><small>{ecoOn ? `${ecoStrat.build?.label ?? 'this build'} · both seats play Strat-G's best` : 'switched off'}</small></span></header>
      <Choice label='Games per run' values={COHORT_GAMES} value={(COHORT_GAMES as readonly number[]).includes(games) ? games as typeof COHORT_GAMES[number] : 10} unit={count => `${count}`} disabled={!ecoOn || cohort.running} onChange={count => void update({ ecoStrat: { baselineGames: count } })}/>
      {cohort.running
        ? <Progress label={`${cohort.kind === 'evaluation' ? 'More games' : 'Baseline'} ${cohort.valid}/${cohort.target}${cohort.invalid ? ` · ${cohort.invalid} invalid` : ''} · ${cohortPhaseLabel(cohort.phase)} · seeds ${cohort.seedBase ?? 1001}+`} value={cohort.valid} total={cohort.target}/>
        : <Progress label={`Baseline ${ecoStrat.baseline.valid}/${ecoStrat.baseline.target}${baselineDone ? ' · complete' : ecoStrat.baseline.status === 'not-started' ? ' · not run' : ` · ${ecoStrat.baseline.status}`} · ${ecoStrat.gamesObserved.currentBuild} games this build`} value={ecoStrat.baseline.valid} total={ecoStrat.baseline.target}/>}
      <div className='agents-actions'>
        {cohort.running
          ? <button type='button' onClick={() => void act('eco-strat', 'stop')}>Stop</button>
          : <>
            <button type='button' className={baselineDone ? '' : 'primary'} disabled={!ecoOn || leagueBusy} title={waitLeague} onClick={() => void act('eco-strat', 'baseline')}>{baselineDone ? 'Re-run baseline' : 'Run baseline'}</button>
            <button type='button' className={baselineDone ? 'primary' : ''} disabled={!ecoOn || !baselineDone || leagueBusy} title={waitLeague ?? (baselineDone ? undefined : 'Run the baseline for this build first')} onClick={() => void act('eco-strat', 'evaluate')}>Play {games} more</button>
          </>}
        <button type='button' disabled={!journal} onClick={() => journal && setReading(journal.id)}>Journal</button>
      </div>
      <ReportControl status={status} act={act} onRead={setReading}/>
      <Fold title='How Eco-Strat test games work'>
        <p>The baseline replays seeds 1001 onward, so every build is measured on the same games. “More” games use fresh seeds and add evidence for the next report. Strat-G's strategy is frozen for the whole run and Strat-G does not learn from these games.</p>
        <p>The journal opens on a summary: Eco-Strat's top 3 recommendations, the best and worst market purchases, and how games end, split into close, mid and blowout finishes.</p>
      </Fold>
    </article>

    <article className='test-games-card' aria-label='AI league'>
      <header>
        <span className='league-faces'>{MEMBERS.map(member => <AgentAvatar key={member.id} agent={member.id} size={22}/>)}</span>
        <span><strong>AI league</strong><small>{leagueBusy
          ? `Round ${league.round || 1}/${league.rounds} · ${league.phase === 'trial' && league.learner ? `${league.learner} learning` : 'rating games'}`
          : `${players} playing · Elo · last ${league.window} snapshots · ${Math.round(league.latestRatio * 100)}% latest`}</small></span>
      </header>
      <table className='league-table'>
        <thead><tr><th>Agent</th><th>Elo</th><th>W–L–T</th><th>Experiment</th></tr></thead>
        <tbody>{MEMBERS.map(member => {
          const row = league.table.find(entry => entry.agent === member.id);
          const agent = status[member.key], on = status.effective[member.key];
          const learning = leagueBusy && league.phase === 'trial' && league.learner === nameOf(member.id);
          const stage = !on ? 'off' : learning ? 'learning' : agent.experiment ? agent.experiment.stage === 'lab' ? 'queued' : agent.experiment.stage : agent.state === 'online' ? 'idle' : agent.state;
          return <tr key={member.id} className={on ? '' : 'off'}>
            <td><AgentAvatar agent={member.id} size={18}/><span><b>{nameOf(member.id)}</b><small>{member.style}</small></span></td>
            <td>{row?.elo != null ? Math.round(row.elo) : '—'}</td>
            <td>{row?.games ? `${row.wins}–${row.losses}–${row.ties}` : '—'}</td>
            <td title={agent.experiment ? `${agent.experiment.id}: ${agent.experiment.change}` : undefined}>{stage}</td>
          </tr>;
        })}</tbody>
      </table>
      {league.headToHead.length > 0 && <p className='league-h2h' aria-label='Head to head'>{league.headToHead.map(record => <span key={`${record.a}|${record.b}`}>{nameOf(record.a)} <b>{record.aWins}–{record.bWins}{record.ties ? `–${record.ties}` : ''}</b> {nameOf(record.b)}</span>)}</p>}
      <Choice label='Rounds per run' values={LEAGUE_ROUNDS} value={pick(LEAGUE_ROUNDS, rounds, 3)} unit={count => `${count}`} disabled={leagueBusy} onChange={count => void update({ league: { rounds: count } })}/>
      <Choice label='Seeds per block' values={LEAGUE_SEEDS} value={pick(LEAGUE_SEEDS, seedsPerBlock, 4)} unit={count => `${count}`} disabled={leagueBusy} onChange={count => void update({ league: { seedsPerBlock: count } })}/>
      {leagueBusy
        ? <Progress label={`${league.games}/${league.total} games${league.stopping ? ' · stopping…' : ''}`} value={league.games} total={league.total}/>
        : league.lastRun ? <p className='test-games-result'>Last run: {league.lastRun.games} games over {league.lastRun.rounds} round{league.lastRun.rounds === 1 ? '' : 's'}{league.lastRun.stopped ? ' (stopped)' : ''} · {adopted} change{adopted === 1 ? '' : 's'} adopted of {league.lastRun.trials.length} tested.</p> : null}
      <div className='agents-actions'>
        {leagueBusy
          ? <button type='button' disabled={league.stopping} onClick={() => void act('league', 'stop')}>Stop league</button>
          : <button type='button' className='primary' disabled={!settings.agentsEnabled || players < 2 || cohort.running || mentoring.running || coaching.running} title={cohort.running ? 'Wait for the Eco-Strat run to finish' : mentoring.running || coaching.running ? 'Wait for the mentoring or coaching hand-off to finish' : players < 2 ? 'Switch on at least two agents' : undefined} onClick={() => void act('league', 'run')}>Run league · ~{leagueGames} games</button>}
        <button type='button' aria-pressed={ecoObserves} disabled={leagueBusy} onClick={() => void update({ league: { ecoObserves: !ecoObserves } })}>Eco-Strat watches: {ecoObserves ? 'On' : 'Off'}</button>
      </div>
      <Fold title='How the league works'>
        <p>Each round opens with rating games: every pair of agents plays the same seeds from both seats, and the results move their Elo (everyone starts at 1200; K is 32 for a snapshot's first 30 games, then 16).</p>
        <p>Then each agent takes a turn learning while the others stay frozen. Its experiment and its current best play the same opponents on the same seeds, so only the change differs. Opponents come from the last {league.window} snapshots of every agent, including its own older selves; {Math.round(league.latestRatio * 100)}% of the time it is another agent's latest. Each opponent stays for a block of seeds before swapping. A change that clearly beats the current best is adopted and saved as a new snapshot.</p>
        <p>Strat-G plays balanced, T-5 is pure aggression, DV-8 builds an engine and VP-Dog is pure economy; each is held to its style. They get only their own results back and never see each other's strategies. Eco-Strat watches one rating game per pairing each round.</p>
        <p>Catch-up learning: an agent {league.catchUpGap ?? 150}+ Elo below the leader takes a second trial each round{league.catchUp?.length ? ` (now ${league.catchUp.map(nameOf).join(', ')})` : ''}.</p>
      </Fold>
    </article>
    {(error || cohort.error) && <p className='agents-error'>{error || cohort.error}</p>}
    {reading && <AgentReader docs={docs} initial={reading} onClose={() => setReading(null)}/>}
  </section>;
}

/** VP-Dog and DV-8 hand engine and economy tips to T-5 and Strat-G. */
export function MentoringPanel({ agents }: { agents: AgentsApi }) {
  const { status, error, act } = agents;
  if (!status) return <section className='test-games agents-panel'><p className='agents-note'>{error || 'Loading agents…'}</p></section>;
  const { settings, cohort, league, mentoring, coaching } = status;
  const mentorsReady = status.effective.vpDog && status.effective.dv8 && status.effective.t5 && status.effective.stratG;
  const handOff = mentoring.running || coaching.running;
  const blocked = !settings.agentsEnabled ? 'AI agents are switched off' : !mentorsReady ? 'Switch on VP-Dog, DV-8, T-5 and Strat-G' : league.running ? 'Wait for the league run to finish' : cohort.running ? 'Wait for the Eco-Strat run to finish' : undefined;
  const { economyUntilCycle, endgameFromCycle } = coaching.phases;
  const share = Math.round((coaching.store?.share ?? 0.25) * 100);
  return <section className='test-games mentoring agents-panel' aria-label='Mentoring'>
    <article className='test-games-card'>
      <header>
        <span className='league-faces'>{(['vp-dog', 'dv-8'] as const).map(id => <AgentAvatar key={id} agent={id} size={22}/>)}</span>
        <span><strong>Mentoring</strong><small>{mentoring.running ? 'Asking VP-Dog and DV-8…' : mentoring.store ? `Tips handed over ${mentoring.store.askedAt.slice(0, 16).replace('T', ' ')}` : 'VP-Dog and DV-8 teach engines and economy'}</small></span>
      </header>
      <div className='agents-actions'>
        <button type='button' className={mentoring.store ? '' : 'primary'} disabled={handOff || !!blocked} title={blocked} onClick={() => void act('mentoring', 'ask')}>{mentoring.running ? 'Asking…' : mentoring.store ? 'Ask again' : 'Ask VP-Dog and DV-8 for tips'}</button>
      </div>
      {mentoring.error && <p className='agents-error'>{mentoring.error}</p>}
      <Fold title='How mentoring works'>
        <p>VP-Dog and DV-8 each name their top 3 tips from their own games, and each tip comes with the profile values behind it. T-5 takes all 6 and Strat-G takes each mentor's top 2. A tip moves the recipient only part of the way (at most 2 Cycles, 40% of a weight) and is clamped to the recipient's style, so T-5 stays an aggression deck and Strat-G stays balanced.</p>
        <p>The tips become part of the recipient's protected baseline and playbook, so the league starts playing them at once and the Elo shows whether they helped. Asking again builds on the current best.</p>
      </Fold>
    </article>
    {mentoring.store ? <div className='mentoring-recipients'>{RECIPIENTS.map(recipient => {
      const entry = mentoring.store!.recipients[recipient];
      if (!entry) return null;
      return <article key={recipient} className='test-games-card mentoring-recipient'>
        <p><AgentAvatar agent={recipient} size={18}/> <b>{nameOf(recipient)}</b> took {entry.tips.length} tips</p>
        <ol>{entry.tips.map(tip => <li key={`${tip.from}-${tip.rank}`}>
          <span>{tip.fromName} #{tip.rank}: {tip.text}</span>
          <small>{tip.limited ? 'Limited by style: no change to the profile' : changeText(tip.change)}</small>
        </li>)}</ol>
      </article>;
    })}</div> : <p className='agents-note'>No tips handed over yet.</p>}
    <article className='test-games-card'>
      <header>
        <AgentAvatar agent='strat-g' size={22}/>
        <span><strong>Strat-G coaching</strong><small>{coaching.running ? 'Coaching Strat-G…' : coaching.store ? `Applied ${coaching.store.appliedAt.slice(0, 16).replace('T', ' ')}` : `Three phases and a ${share}% mirror of its competitors`}</small></span>
      </header>
      <ol className='coaching-phases'>
        <li><b>Cycles 1-{economyUntilCycle}</b> Economy and deck engine.</li>
        <li><b>Cycles {economyUntilCycle + 1}-{endgameFromCycle - 1}</b> Midgame: a balance of attacks, deck engine, Server restores and VP.</li>
        <li><b>Cycles {endgameFromCycle}+</b> Attack Servers hard and buy mostly VP.</li>
      </ol>
      <div className='agents-actions'>
        <button type='button' className={coaching.store ? '' : 'primary'} disabled={handOff || !!blocked} title={blocked} onClick={() => void act('coaching', 'apply')}>{coaching.running ? 'Coaching…' : coaching.store ? `Re-apply ${share}% mirror` : `Mirror competitors ${share}%`}</button>
      </div>
      {coaching.error && <p className='agents-error'>{coaching.error}</p>}
      {coaching.store && <p className='agents-note'>Mirrors {coaching.store.competitors.map(entry => `${entry.name} ${entry.version}`).join(', ')}: {changeText(coaching.store.change) || 'no change'}</p>}
      <Fold title='How coaching works'>
        <p>Strat-G's weights, Crypto target, buy bar, dilution and card biases move {share}% of the way to the average current best of T-5, DV-8 and VP-Dog, clamped to its balanced style. The phase timing above is fixed by the designer and is never mirrored or changed by experiments.</p>
        <p>Re-applying takes the earlier coaching back out first, so the mirror tracks the competitors' latest play instead of compounding.</p>
      </Fold>
    </article>
  </section>;
}
