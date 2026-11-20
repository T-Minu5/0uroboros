import { useState, type ReactNode } from 'react';
import { versionLabel } from '@0uroboros/engine/ai/strategy';
import { AGENT_NAMES, AGENT_STYLES, AgentAvatar, type AgentId } from './agentAvatars';
import { AgentReader } from './AgentReader';
import { publishOpponent, type AgentsApi, type AgentsStatus, type LearnerStatus } from './agentsApi';
import { Choice, Fold, Switch } from './leagueControls';

const REPORT_CADENCE = [5, 10, 20] as const;
const LEARNERS = {
  'strat-g': { key: 'stratG', about: 'Plays you from the designer’s baseline and plays T-5, DV-8, VP-Dog and Last2Go in the league. It changes its play only through measured experiments and never sees the other agents’ strategies.' },
  't-5': { key: 't5', about: 'Almost no economy, Chaos and Drain from Cycle 3, aiming to destroy both enemy Servers by Cycles 10–13.' },
  'vp-dog': { key: 'vpDog', about: 'Big Crypto and draw first, then VP every Draft from the midgame, aiming to buy 25+ VP by Cycles 11–14.' },
  'last-2go': { key: 'last2go', about: 'Mirrors opponent Draft buys with a mild destruction bias, skips Runtime turn 1, then contests turns 2–3 for Location majority.' },
  'dv-8': { key: 'dv8', about: 'A long, thin, draw-heavy economy, Restore for defense, then late heavy VP. Plays you as the Novice opponent and mentors the others; it is not Elo-rated.' },
} as const;
type LearnerId = keyof typeof LEARNERS;
const ORDER: AgentId[] = ['eco-strat', 'strat-g', 't-5', 'vp-dog', 'last-2go', 'dv-8'];

const learnerState = (on: boolean, agent: LearnerStatus) => !on ? 'Off' : agent.state === 'online' ? `${versionLabel(agent.version)}, ${agent.mode === 'llm' ? 'model' : 'heuristic'}` : agent.state;
const leagueLine = (status: AgentsStatus, agent: string) => {
  const row = status.league.table.find(entry => entry.agent === agent);
  return row?.elo != null ? `Elo ${Math.round(row.elo)}, ${row.wins}–${row.losses}–${row.ties}` : 'Not rated yet';
};

/** Writes the agent's current best into the content pack; players get it once the pack is committed and deployed. */
function PublishControl({ agent }: { agent: AgentId }) {
  const name = AGENT_NAMES[agent];
  const [state, setState] = useState({ busy: false, message: '', failed: false });
  const publish = async () => {
    setState({ busy: true, message: '', failed: false });
    try {
      const done = await publishOpponent(agent);
      setState({ busy: false, failed: false, message: `${name} ${done.label} is in the content pack (revision ${done.revision}, pack ${done.hash}). Commit and deploy the server to ship it.` });
    } catch (reason) { setState({ busy: false, failed: true, message: reason instanceof Error ? reason.message : 'Publishing failed.' }); }
  };
  return <div className='lc-publish'>
    <button type='button' className='lc-button' disabled={state.busy} aria-busy={state.busy} onClick={() => void publish()}>{state.busy ? 'Publishing' : 'Publish to the pack'}</button>
    {state.message && <p className={state.failed ? 'lc-error' : 'lc-meta'} aria-live='polite'>{state.message}</p>}
  </div>;
}

function AgentCard({ agent, state, on, master, onToggle, children, extra, about }: {
  agent: AgentId; state: string; on: boolean; master: boolean; onToggle: (on: boolean) => void; children?: ReactNode; extra?: ReactNode; about: string;
}) {
  return <article className={`lc-panel agent-card${on ? '' : ' is-off'}`} aria-labelledby={`agent-${agent}-name`}>
    <header className='agent-card-head'>
      <AgentAvatar agent={agent} size={64}/>
      <span className='agent-card-who'>
        <h2 id={`agent-${agent}-name`}>{AGENT_NAMES[agent]}</h2>
        <small>{AGENT_STYLES[agent]}</small>
        <small className='agent-card-state'>{state}</small>
      </span>
      <Switch label={on ? 'On' : 'Off'} on={on} disabled={!master} onChange={onToggle}/>
    </header>
    {children && <div className='agent-card-switches'>{children}</div>}
    {extra}
    <Fold title={`About ${AGENT_NAMES[agent]}`}><p>{about}</p></Fold>
  </article>;
}

/**
 * League settings: one card per agent with its switches, outputs and publish control, under a master switch. Changes
 * apply to the next game.
 */
export function LeagueSettingsPanel({ agents }: { agents: AgentsApi }) {
  const { status, error, docs, update } = agents;
  const [reading, setReading] = useState<string | null>(null);
  if (!status) return <p className='lc-meta lc-loading'>{error || 'Loading agents'}</p>;
  const { settings, ecoStrat } = status;
  const master = settings.agentsEnabled;

  const reader = (agent: AgentId) => {
    const own = docs.filter(doc => doc.agent === agent);
    const latest = own.find(doc => doc.id.startsWith('eco-strat-report-'));
    const main = own.find(doc => !doc.id.startsWith('eco-strat-report-'));
    return <div className='lc-actions' role='group' aria-label={`${AGENT_NAMES[agent]} outputs`}>
      <button type='button' className='lc-button' disabled={!main} onClick={() => main && setReading(main.id)}>{agent === 'eco-strat' ? 'Read journal' : 'Read notebook'}</button>
      {agent === 'eco-strat' && <button type='button' className='lc-button' disabled={!latest} onClick={() => latest && setReading(latest.id)}>Read latest report</button>}
      {agent !== 'eco-strat' && <PublishControl agent={agent}/>}
    </div>;
  };

  const card = (agent: AgentId) => {
    if (agent === 'eco-strat') return <AgentCard key={agent} agent={agent} master={master} on={settings.ecoStrat.enabled}
      state={status.effective.ecoStrat ? `${ecoStrat.state}, ${ecoStrat.gamesObserved.currentBuild} games on this build` : 'Off'}
      onToggle={enabled => void update({ ecoStrat: { enabled } })}
      about='Evaluates the economy and the league ruleset from finished games. Read-only: it never plays or advises the other agents.'
      extra={<>
        {settings.ecoStrat.continuous && <Choice label='Report every' values={REPORT_CADENCE} value={(REPORT_CADENCE as readonly number[]).includes(settings.ecoStrat.reportEvery) ? settings.ecoStrat.reportEvery as typeof REPORT_CADENCE[number] : 10} unit={count => `${count} games`} disabled={!master} onChange={reportEvery => void update({ ecoStrat: { reportEvery } })}/>}
        {reader(agent)}
        {ecoStrat.lastError && <p className='lc-error'>{ecoStrat.lastError}</p>}
      </>}>
      <Switch label='Observe my games' on={settings.ecoStrat.observeHumanGames} disabled={!master} onChange={observeHumanGames => void update({ ecoStrat: { observeHumanGames } })}/>
      <Switch label='Continuous reports' on={settings.ecoStrat.continuous} disabled={!master} onChange={continuous => void update({ ecoStrat: { continuous } })}/>
    </AgentCard>;

    const { key, about } = LEARNERS[agent as LearnerId];
    const learner = status[key];
    return <AgentCard key={agent} agent={agent} master={master} on={settings[key].enabled}
      state={`${learnerState(status.effective[key], learner)}${agent === 'dv-8' ? '' : `. ${leagueLine(status, agent)}`}`}
      onToggle={enabled => void update({ [key]: { enabled } })} about={about}
      extra={<>
        {learner.experiment && <p className='lc-meta'>Testing {learner.experiment.id} ({learner.experiment.stage}): {learner.experiment.change}</p>}
        {agent === 'strat-g' && status.humanTempo?.planBlurb && <p className='lc-meta'>{status.humanTempo.planBlurb}</p>}
        {reader(agent)}
        {learner.error && <p className='lc-error'>{learner.error}</p>}
      </>}>
      {agent === 'strat-g' && <Switch label='Decision log' hint='Records each choice Strat-G makes against you' on={settings.stratG.recordDecisions} disabled={!master} onChange={recordDecisions => void update({ stratG: { recordDecisions } })}/>}
    </AgentCard>;
  };

  return <div className='league-settings'>
    <section className='lc-panel league-master' aria-label='All agents'>
      <Switch label='AI agents' hint={master ? 'Changes apply to the next game.' : 'Every agent is off. Opponents fall back to the profiles in the content pack.'} on={master} onChange={agentsEnabled => void update({ agentsEnabled })}/>
      <p className='lc-meta'>Settings file <code>{status.settingsFile}</code>. API keys stay in <code>.env</code> on the server.</p>
    </section>
    <div className='agent-grid'>{ORDER.map(card)}</div>
    {error && <p className='lc-error'>{error}</p>}
    {reading && <AgentReader docs={docs} initial={reading} onClose={() => setReading(null)}/>}
  </div>;
}
