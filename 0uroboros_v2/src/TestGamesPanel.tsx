import { useEffect, useState } from 'react';
import { sanitizeSelfPlayRules, type SelfPlayRules } from '@0uroboros/engine/ai/selfPlay';
import { AgentReader } from './AgentReader';
import { AGENT_NAMES, AGENT_STYLES, AgentAvatar, type AgentId } from './agentAvatars';
import { cohortPhaseLabel, type AgentsApi, type AgentsStatus, type LeagueEpoch, type MetricRow, type ProfileChange } from './agentsApi';
import { loadGameSource } from './contentPack/loadGameContent';
import { Choice, Fold, pick, Progress, ReportControl, reportStamp, Switch } from './leagueControls';
import { LeagueRulesPanel } from './LeagueRulesPanel';

const COHORT_GAMES = [10, 20, 30, 50] as const;
const LEAGUE_ROUNDS = [1, 3, 5] as const;
const LEAGUE_SEEDS = [2, 4, 8] as const;
const ELO_START = 1200;
const MEMBERS = [
  { id: 'strat-g', key: 'stratG' },
  { id: 't-5', key: 't5' },
  { id: 'vp-dog', key: 'vpDog' },
  { id: 'last-2go', key: 'last2go' },
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
const DRAFT_KEY = 'ouroboros.leagueRulesDraft';
const ruleValue = (value: number | boolean) => typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value);
const metricValue = (row: MetricRow, value: number | null) => value === null ? 'n/a' : row.unit === 'rate' ? `${Math.round(value * 100)}%` : value.toFixed(1);
const VERDICT: Record<MetricRow['verdict'], string> = { closer: 'Closer', further: 'Further', same: 'Steady', 'n/a': 'Too few games' };

function useRulesDraft(current: SelfPlayRules | undefined, hash: string | undefined) {
  const [draft, setDraft] = useState<{ base: string; rules: SelfPlayRules } | null>(() => {
    try { const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as { base?: string; rules?: unknown } | null; return saved?.base ? { base: saved.base, rules: sanitizeSelfPlayRules(saved.rules) } : null; } catch { return null; }
  });
  // A draft made against older rules is dropped once the rules it was based on are replaced.
  const live = draft && hash && draft.base === hash ? draft.rules : current;
  const update = (rules: SelfPlayRules) => {
    if (!hash) return;
    const next = { base: hash, rules };
    setDraft(next);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  };
  return [live, update] as const;
}

/** The memorable part: portraits ranked by Elo, each with its rating drawn as a circuit trace. */
function StandingsLadder({ status, epoch }: { status: AgentsStatus; epoch: LeagueEpoch | null }) {
  const { league } = status;
  const rows = MEMBERS.map(member => {
    const row = league.table.find(entry => entry.agent === member.id);
    const agent = status[member.key], on = status.effective[member.key];
    const learning = league.running && league.phase === 'trial' && league.learner === nameOf(member.id);
    const stage = !on ? 'Off' : learning ? 'Learning now' : agent.experiment ? agent.experiment.stage === 'lab' ? 'Experiment queued' : `Experiment ${agent.experiment.stage}` : agent.state === 'online' ? 'Ready' : agent.state;
    const before = epoch?.standings?.find(entry => entry.agent === member.id)?.elo ?? (epoch?.eloWiped ? ELO_START : null);
    return { ...member, row, on, stage, learning, delta: row?.elo != null && before != null ? Math.round(row.elo - before) : null, experiment: agent.experiment };
  }).sort((a, b) => (b.row?.elo ?? -1) - (a.row?.elo ?? -1) || Number(b.on) - Number(a.on));
  const rated = rows.map(entry => entry.row?.elo).filter((elo): elo is number => elo != null);
  const low = Math.min(ELO_START - 100, ...rated) - 20, high = Math.max(ELO_START + 100, ...rated) + 20;
  const at = (elo: number) => ((elo - low) / (high - low)) * 100;
  const deltaLabel = epoch?.standings ? 'since last run' : 'since the wipe';

  return <ol className='ladder' aria-label='League standings'>
    {rows.map((entry, index) => {
      const elo = entry.row?.elo ?? null;
      return <li key={entry.id} className={`ladder-row${entry.on ? '' : ' is-off'}${entry.learning ? ' is-learning' : ''}`}>
        <span className='ladder-rank' aria-label={`Rank ${index + 1}`}>{index + 1}</span>
        <AgentAvatar agent={entry.id} size={56}/>
        <span className='ladder-who'>
          <b>{nameOf(entry.id)}</b>
          <small>{AGENT_STYLES[entry.id]}</small>
          <small className='ladder-stage' title={entry.experiment ? `${entry.experiment.id}: ${entry.experiment.change}` : undefined}>{entry.stage}</small>
        </span>
        <span className='ladder-trace' aria-hidden='true'>
          <svg viewBox='0 0 100 12' preserveAspectRatio='none'>
            <path className='ladder-trace-base' d='M0 6 H100'/>
            <path className='ladder-trace-start' d={`M${at(ELO_START)} 2 V10`}/>
            {elo !== null && <path className='ladder-trace-fill' d={`M0 6 H${at(elo) - 2} L${at(elo)} 6`}/>}
          </svg>
          {elo !== null && <i style={{ left: `${at(elo)}%` }}/>}
        </span>
        <span className='ladder-elo'>
          <b className={elo === null ? 'is-unrated' : undefined}>{elo !== null ? Math.round(elo) : '—'}</b>
          <small>{entry.row?.games ? `${entry.row.wins}–${entry.row.losses}–${entry.row.ties}` : 'Not rated'}</small>
          {entry.delta !== null && entry.delta !== 0 && <small className={entry.delta > 0 ? 'is-up' : 'is-down'} title={deltaLabel}>{entry.delta > 0 ? '+' : ''}{entry.delta} {deltaLabel}</small>}
        </span>
      </li>;
    })}
  </ol>;
}

function EpochEntry({ epoch, open, onRead, hasReport, onLoad, loadBlocked }: { epoch: LeagueEpoch; open: boolean; onRead: (id: string) => void; hasReport: boolean; onLoad: () => void; loadBlocked?: string }) {
  const judged = epoch.metrics.filter(row => row.verdict === 'closer' || row.verdict === 'further');
  return <li className='epoch'>
    <details open={open}>
      <summary>
        <span className='epoch-id'>Epoch {epoch.id}</span>
        <span className='epoch-when'>{reportStamp(epoch.startedAt)}</span>
        <span className='epoch-games'>{epoch.tally.games} game{epoch.tally.games === 1 ? '' : 's'}{epoch.runs ? `, ${epoch.runs} run${epoch.runs === 1 ? '' : 's'}` : ''}</span>
        {judged.length > 0 && <span className='epoch-score'>{judged.filter(row => row.verdict === 'closer').length} closer, {judged.filter(row => row.verdict === 'further').length} further</span>}
      </summary>
      <div className='epoch-body'>
        <ul className='epoch-changes'>
          {epoch.changes.length
            ? epoch.changes.map(change => <li key={change.key}><b>{change.label}</b> {ruleValue(change.from)} to <em>{ruleValue(change.to)}</em></li>)
            : <li className='lc-meta'>{epoch.id === 1 ? 'Starting rules.' : 'Same rules; Elo wiped.'}</li>}
          {epoch.eloWiped && epoch.changes.length > 0 && <li className='lc-meta'>Elo wiped.</li>}
        </ul>
        {epoch.note && <p className='epoch-note'>{epoch.note}</p>}
        {epoch.comparedWith !== null && epoch.tally.games > 0
          ? <table className='epoch-metrics'>
            <caption>Compared with epoch {epoch.comparedWith}</caption>
            <thead><tr><th scope='col'>Metric</th><th scope='col'>Target</th><th scope='col'>Before</th><th scope='col'>After</th><th scope='col'>Verdict</th></tr></thead>
            <tbody>{epoch.metrics.map(row => <tr key={row.id}>
              <th scope='row'>{row.label}</th><td>{row.targetLabel}</td><td>{metricValue(row, row.before)}</td><td>{metricValue(row, row.after)}</td>
              <td className={`verdict-${row.verdict}`}>{VERDICT[row.verdict]}</td>
            </tr>)}</tbody>
          </table>
          : <p className='lc-meta'>{epoch.tally.games ? 'No earlier epoch with games to compare against.' : 'Run the league to collect games under these rules.'}</p>}
        <div className='epoch-actions'>
          <button type='button' className='lc-button' disabled={!!loadBlocked} title={loadBlocked ?? 'Copy these rules into the Ruleset draft; press Apply there to use them'} onClick={onLoad}>Load the Epoch</button>
          {hasReport && <button type='button' className='lc-link' onClick={() => onRead(`eco-strat-report-${epoch.reportId}`)}>Read Eco-Strat’s report</button>}
        </div>
      </div>
    </details>
  </li>;
}

/**
 * League games: the ruleset, the Elo ladder with run controls, Eco-Strat's change log across rulesets, and the Eco study.
 * Strat-G, T-5, VP-Dog and Last2Go play each other; DV-8 is a Novice opponent and is not Elo-rated.
 */
export function LeagueGamesPanel({ agents }: { agents: AgentsApi }) {
  const { status, error, docs, epochs, update, act, applyRules, applyClientRules } = agents;
  const [deck, setDeck] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  /** Epoch change log: show the newest 4, then load 5 more each time. */
  const [epochVisible, setEpochVisible] = useState(4);
  const [draft, setDraft] = useRulesDraft(status?.rules.current, status?.rules.hash);
  useEffect(() => {
    let live = true;
    loadGameSource().then(source => {
      const saved = source.decks.find(entry => entry.id === source.defaultDeckId);
      if (live && saved) setDeck(`${saved.name} (${saved.size} cards)`);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  if (!status || !draft) return <p className='lc-meta lc-loading'>{error || 'Loading the league'}</p>;
  const { settings, ecoStrat, cohort, league, mentoring, coaching } = status;
  const epoch = epochs[0] ?? null;
  const ecoOn = status.effective.ecoStrat;
  const leagueBusy = league.running;
  const baselineDone = ecoStrat.baseline.status === 'complete';
  const games = settings.ecoStrat.baselineGames;
  const players = MEMBERS.filter(member => status.effective[member.key]).length;
  const { rounds, seedsPerBlock, ecoObserves } = settings.league;
  const trials = players + (league.catchUp?.length ?? 0);
  const leagueGames = rounds * (players * (players - 1) / 2 * seedsPerBlock * 2 + trials * league.blocksPerTrial * seedsPerBlock * 4);
  const adopted = league.lastRun?.trials.filter(trial => /→ promising/.test(trial.result)).length ?? 0;
  const runBlocked = !settings.agentsEnabled ? 'AI agents are switched off' : players < 2 ? 'Switch on at least two agents in League settings' : cohort.running ? 'Wait for the Eco-Strat study to finish' : mentoring.running || coaching.running ? 'Wait for the mentoring or coaching hand-off to finish' : undefined;
  const rulesBlocked = leagueBusy ? 'Stop the league run first' : cohort.running ? 'Wait for the Eco-Strat study to finish' : undefined;
  const journal = docs.find(doc => doc.id === 'eco-strat-journal');
  const reportIds = new Set(docs.map(doc => doc.id));

  return <div className='league-games'>
    <LeagueRulesPanel current={status.rules.current} epochId={epoch?.id ?? null} draft={draft} onDraft={setDraft} busy={leagueBusy} blocked={rulesBlocked}
      onApply={options => applyRules(draft, options)} clientApplied={status.clientRules ?? { appliedAt: null, epochId: null }} onApplyClient={applyClientRules}/>

    <div className='league-main'>
      <section className='lc-panel league-standings' aria-labelledby='standings-title'>
        <header className='lc-panel-head'>
          <h2 id='standings-title'>Standings</h2>
          <p>{leagueBusy
            ? `${league.resuming ? 'Resuming. ' : ''}Round ${league.round || 1} of ${league.rounds}, ${league.phase === 'trial' && league.learner ? `${league.learner} is learning` : 'rating games'}.`
            : `${epoch ? `Epoch ${epoch.id}. ` : ''}AI vs AI on ${deck ?? 'the saved deck'}.`}</p>
        </header>
        <StandingsLadder status={status} epoch={epoch}/>
        {league.headToHead.length > 0 && <p className='league-h2h' aria-label='Head to head'>{league.headToHead.map(record => <span key={`${record.a}|${record.b}`}>{nameOf(record.a)} <b>{record.aWins}–{record.bWins}{record.ties ? `–${record.ties}` : ''}</b> {nameOf(record.b)}</span>)}</p>}
        {leagueBusy
          ? <Progress label={`${league.games} of ${league.total} games${(league.trialsSkipped ?? 0) > 0 ? `, ${league.trialsSkipped} trials skipped` : ''}${league.stopping ? ', stopping' : ''}`} value={league.games} total={Math.max(league.total, 1)}/>
          : league.lastRun && <p className='lc-meta'>Last run: {league.lastRun.games} games over {league.lastRun.rounds} round{league.lastRun.rounds === 1 ? '' : 's'}{league.lastRun.interrupted ? ' (interrupted)' : league.lastRun.stopped ? ' (stopped)' : ''}. {adopted} of {league.lastRun.trials.length} tested strategy changes adopted.</p>}
        <div className='league-run'>
          <Choice label='Rounds per run' values={LEAGUE_ROUNDS} value={pick(LEAGUE_ROUNDS, rounds, 3)} unit={count => `${count}`} disabled={leagueBusy} onChange={count => void update({ league: { rounds: count } })}/>
          <Choice label='Seeds per block' values={LEAGUE_SEEDS} value={pick(LEAGUE_SEEDS, seedsPerBlock, 4)} unit={count => `${count}`} disabled={leagueBusy} onChange={count => void update({ league: { seedsPerBlock: count } })}/>
          <Switch label='Eco-Strat watches' hint='Reads one rating game per pairing' on={ecoObserves} disabled={leagueBusy} onChange={on => void update({ league: { ecoObserves: on } })}/>
        </div>
        <div className='lc-actions'>
          {leagueBusy
            ? <button type='button' className='lc-button' disabled={league.stopping} onClick={() => void act('league', 'stop')}>{league.stopping ? 'Stopping' : 'Stop league'}</button>
            : <button type='button' className='lc-button lc-primary' disabled={!!runBlocked} title={runBlocked} onClick={() => void act('league', 'run')}>Run league, about {leagueGames} games</button>}
          {confirmWipe
            ? <>
              <button type='button' className='lc-button lc-danger' disabled={leagueBusy} onClick={() => { setConfirmWipe(false); void act('league', 'reset'); }}>Wipe all Elo</button>
              <button type='button' className='lc-button' onClick={() => setConfirmWipe(false)}>Cancel</button>
            </>
            : <button type='button' className='lc-button' disabled={leagueBusy} title={leagueBusy ? 'Stop the league run first' : 'Start everyone at 1200 under the same rules. Opens a new epoch.'} onClick={() => setConfirmWipe(true)}>Wipe Elo</button>}
        </div>
        <Fold title='How the league works'>
          <p>Each round opens with rating games: every pair of agents plays the same seeds from both seats, and the results move their Elo (everyone starts at 1200; K is 32 for a snapshot’s first 30 games, then 16).</p>
          <p>Then each agent takes a turn learning while the others stay frozen. Its experiment and its current best play the same opponents on the same seeds, so only the change differs. Opponents come from the last {league.window} snapshots of every agent; {Math.round(league.latestRatio * 100)}% of the time it is another agent’s latest. A change that clearly beats the current best is adopted.</p>
          <p>An agent {league.catchUpGap ?? 150}+ Elo below the leader takes a second trial each round{league.catchUp?.length ? ` (now ${league.catchUp.map(nameOf).join(', ')})` : ''}.</p>
          <p>Changing the ruleset or wiping Elo opens a new epoch. Every valid game in an epoch counts toward its metrics, and Eco-Strat compares each epoch with the one before it.</p>
        </Fold>
      </section>

      <section className='lc-panel league-study' aria-labelledby='study-title'>
        <header className='lc-panel-head lc-panel-head-face'>
          <AgentAvatar agent='eco-strat' size={40}/>
          <span><h2 id='study-title'>Eco-Strat study</h2>
            <p>{ecoOn ? `${ecoStrat.build?.label ?? 'This build'}. Both seats play Strat-G’s current best.` : 'Eco-Strat is off. Switch it on in League settings.'}</p></span>
        </header>
        <div className='league-study-grid'>
          <div className='league-study-col'>
            <Choice label='Games per run' values={COHORT_GAMES} value={pick(COHORT_GAMES, games, 10)} unit={count => `${count}`} disabled={!ecoOn || cohort.running} onChange={count => void update({ ecoStrat: { baselineGames: count } })}/>
            {cohort.running
              ? <Progress label={`${cohort.kind === 'evaluation' ? 'More games' : 'Baseline'} ${cohort.valid} of ${cohort.target}${cohort.invalid ? `, ${cohort.invalid} invalid` : ''}, ${cohortPhaseLabel(cohort.phase)}`} value={cohort.valid} total={cohort.target}/>
              : <Progress label={`Baseline ${ecoStrat.baseline.valid} of ${ecoStrat.baseline.target}${baselineDone ? ', complete' : ecoStrat.baseline.status === 'not-started' ? ', not run' : `, ${ecoStrat.baseline.status}`}. ${ecoStrat.gamesObserved.currentBuild} games on this build.`} value={ecoStrat.baseline.valid} total={ecoStrat.baseline.target}/>}
          </div>
          <div className='league-study-col'>
            <div className='lc-actions'>
              {cohort.running
                ? <button type='button' className='lc-button' onClick={() => void act('eco-strat', 'stop')}>Stop study</button>
                : <>
                  <button type='button' className={`lc-button${baselineDone ? '' : ' lc-primary'}`} disabled={!ecoOn || leagueBusy} title={leagueBusy ? 'Wait for the league run to finish' : undefined} onClick={() => void act('eco-strat', 'baseline')}>{baselineDone ? 'Re-run baseline' : 'Run baseline'}</button>
                  <button type='button' className={`lc-button${baselineDone ? ' lc-primary' : ''}`} disabled={!ecoOn || !baselineDone || leagueBusy} title={leagueBusy ? 'Wait for the league run to finish' : baselineDone ? undefined : 'Run the baseline for this build first'} onClick={() => void act('eco-strat', 'evaluate')}>Play {games} more</button>
                </>}
              <button type='button' className='lc-button' disabled={!journal} onClick={() => journal && setReading(journal.id)}>Read journal</button>
            </div>
          </div>
          <div className='league-study-col league-study-report'>
            <ReportControl status={status} act={act} onRead={setReading}/>
          </div>
        </div>
        <Fold title='How the study works'>
          <p>The baseline replays seeds 1001 onward, so every build is measured on the same games. A new ruleset is a new build, so run the baseline again after changing rules. Strat-G’s strategy is frozen for the run and it does not learn from these games.</p>
        </Fold>
      </section>

      <section className='lc-panel league-log' aria-labelledby='log-title'>
        <header className='lc-panel-head'>
          <h2 id='log-title'>Epoch log</h2>
          <p>What each ruleset did to the metrics you are balancing toward, measured by Eco-Strat over league games.</p>
        </header>
        {epochs.length
          ? <>
            <ol className='epochs'>{epochs.slice(0, epochVisible).map((entry, index) => <EpochEntry key={entry.id} epoch={entry} open={index === 0} onRead={setReading} hasReport={!!entry.reportId && reportIds.has(`eco-strat-report-${entry.reportId}`)} onLoad={() => setDraft(sanitizeSelfPlayRules(entry.rules))} loadBlocked={rulesBlocked}/>)}</ol>
            {epochVisible < epochs.length && <button type='button' className='lc-link epoch-more' onClick={() => setEpochVisible(count => Math.min(count + 5, epochs.length))}>View more ({Math.min(5, epochs.length - epochVisible)} of {epochs.length - epochVisible} older)</button>}
          </>
          : <p className='lc-meta'>No epochs yet. The first league run records the starting rules.</p>}
      </section>
    </div>
    {(error || cohort.error || league.error) && <p className='lc-error league-error'>{error || cohort.error || league.error}</p>}
    {reading && <AgentReader docs={docs} initial={reading} onClose={() => setReading(null)}/>}
  </div>;
}

/** VP-Dog and DV-8 hand engine and economy tips to T-5 and Strat-G; coaching mirrors Strat-G toward its competitors. */
export function MentoringPanel({ agents }: { agents: AgentsApi }) {
  const { status, error, act } = agents;
  if (!status) return <p className='lc-meta lc-loading'>{error || 'Loading agents'}</p>;
  const { settings, cohort, league, mentoring, coaching } = status;
  const mentorsReady = status.effective.vpDog && status.effective.dv8 && status.effective.t5 && status.effective.stratG;
  const handOff = mentoring.running || coaching.running;
  const blocked = !settings.agentsEnabled ? 'AI agents are switched off' : !mentorsReady ? 'Switch on VP-Dog, DV-8, T-5 and Strat-G' : league.running ? 'Wait for the league run to finish' : cohort.running ? 'Wait for the Eco-Strat run to finish' : undefined;
  const { economyUntilCycle, endgameFromCycle } = coaching.phases;
  const share = Math.round((coaching.store?.share ?? 0.25) * 100);
  return <div className='mentoring'>
    <section className='lc-panel' aria-labelledby='mentoring-title'>
      <header className='lc-panel-head lc-panel-head-face'>
        <span className='lc-faces'>{(['vp-dog', 'dv-8'] as const).map(id => <AgentAvatar key={id} agent={id} size={40}/>)}</span>
        <span><h2 id='mentoring-title'>Mentoring</h2>
          <p>{mentoring.running ? 'Asking VP-Dog and DV-8.' : mentoring.store ? `Tips handed over ${reportStamp(mentoring.store.askedAt)}.` : 'VP-Dog and DV-8 teach engines and economy to T-5 and Strat-G.'}</p></span>
      </header>
      <div className='lc-actions'>
        <button type='button' className={`lc-button${mentoring.store ? '' : ' lc-primary'}`} disabled={handOff || !!blocked} title={blocked} onClick={() => void act('mentoring', 'ask')}>{mentoring.running ? 'Asking' : mentoring.store ? 'Ask again' : 'Ask VP-Dog and DV-8 for tips'}</button>
      </div>
      {mentoring.error && <p className='lc-error'>{mentoring.error}</p>}
      <Fold title='How mentoring works'>
        <p>VP-Dog and DV-8 each name their top 3 tips from their own games, with the profile values behind them. T-5 takes all 6 and Strat-G takes each mentor’s top 2. A tip moves the recipient only part of the way and is clamped to its style, so T-5 stays an aggression deck and Strat-G stays balanced.</p>
        <p>The tips become part of the recipient’s protected baseline, so the league plays them at once and the Elo shows whether they helped.</p>
      </Fold>
    </section>
    {mentoring.store ? <div className='mentoring-recipients'>{RECIPIENTS.map(recipient => {
      const entry = mentoring.store!.recipients[recipient];
      if (!entry) return null;
      return <section key={recipient} className='lc-panel' aria-label={`${nameOf(recipient)} tips`}>
        <header className='lc-panel-head lc-panel-head-face'><AgentAvatar agent={recipient} size={40}/><span><h2>{nameOf(recipient)}</h2><p>Took {entry.tips.length} tips</p></span></header>
        <ol className='mentoring-tips'>{entry.tips.map(tip => <li key={`${tip.from}-${tip.rank}`}>
          <span>{tip.fromName}, tip {tip.rank}: {tip.text}</span>
          <small>{tip.limited ? 'Limited by style: no change to the profile' : changeText(tip.change)}</small>
        </li>)}</ol>
      </section>;
    })}</div> : <p className='lc-meta'>No tips handed over yet.</p>}
    <section className='lc-panel' aria-labelledby='coaching-title'>
      <header className='lc-panel-head lc-panel-head-face'>
        <AgentAvatar agent='strat-g' size={40}/>
        <span><h2 id='coaching-title'>Strat-G coaching</h2>
          <p>{coaching.running ? 'Coaching Strat-G.' : coaching.store ? `Applied ${reportStamp(coaching.store.appliedAt)}.` : `Three phases and a ${share}% mirror of its competitors.`}</p></span>
      </header>
      <ol className='coaching-phases'>
        <li><b>Cycles 1–{economyUntilCycle}</b> Economy and deck engine.</li>
        <li><b>Cycles {economyUntilCycle + 1}–{endgameFromCycle - 1}</b> Midgame: attacks, deck engine, Server restores and VP.</li>
        <li><b>Cycles {endgameFromCycle}+</b> Attack Servers hard and buy mostly VP.</li>
      </ol>
      <div className='lc-actions'>
        <button type='button' className={`lc-button${coaching.store ? '' : ' lc-primary'}`} disabled={handOff || !!blocked} title={blocked} onClick={() => void act('coaching', 'apply')}>{coaching.running ? 'Coaching' : coaching.store ? `Re-apply ${share}% mirror` : `Mirror competitors ${share}%`}</button>
      </div>
      {coaching.error && <p className='lc-error'>{coaching.error}</p>}
      {coaching.store && <p className='lc-meta'>Mirrors {coaching.store.competitors.map(entry => `${entry.name} ${entry.version}`).join(', ')}: {changeText(coaching.store.change) || 'no change'}</p>}
      <Fold title='How coaching works'>
        <p>Strat-G’s weights, Crypto target, buy bar, dilution and card biases move {share}% of the way to the average current best of T-5, DV-8 and VP-Dog, clamped to its balanced style. Re-applying takes the earlier coaching out first, so the mirror never compounds.</p>
      </Fold>
    </section>
  </div>;
}
