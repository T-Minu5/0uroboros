import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AGENT_NAMES, AgentAvatar, type AgentId } from './agentAvatars';
import { AgentReader } from './AgentReader';
import { cohortPhaseLabel, publishOpponent, useAgents, type AgentsApi, type AgentsStatus, type LearnerStatus } from './agentsApi';
import { versionLabel } from '@0uroboros/engine/ai/strategy';

const REPORT_CADENCE = [5, 10, 20] as const;
const ADVERSARIES = {
  't-5': { key: 't5', about: 'Pure aggression: almost no economy, Chaos and Drain from Cycle 3, aiming to destroy both enemy Servers by Cycles 10-13.' },
  'dv-8': { key: 'dv8', about: 'An engine and control deviant: a long, thin, draw-heavy economy, Restore for defense, then late heavy VP.' },
  'vp-dog': { key: 'vpDog', about: 'Pure economy: big Crypto and draw first, then VP every Draft from the midgame, aiming to buy 25+ VP by Cycles 11-14.' },
} as const;
const isAdversary = (tab: AgentId): tab is keyof typeof ADVERSARIES => tab in ADVERSARIES;

const learnerState = (on: boolean, agent: LearnerStatus) => !on ? 'off' : agent.state === 'online' ? `${versionLabel(agent.version)} · ${agent.mode === 'llm' ? 'model' : 'heuristic'}` : agent.state;
const leagueLine = (status: AgentsStatus, agent: string) => {
  const row = status.league.table.find(entry => entry.agent === agent);
  return row?.elo != null ? `Elo ${Math.round(row.elo)} · ${row.wins}–${row.losses}–${row.ties}${row.label ? ` · ${row.label}` : ''}` : 'not rated yet';
};

/** Text-only parts of a tab fold away so the switches stay in view. */
export function Fold({ title, children }: { title: string; children: ReactNode }) {
  return <details className='agents-fold'><summary>{title}</summary><div className='agents-fold-body'>{children}</div></details>;
}

export const reportStamp = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Write report now", busy with a running clock while a report is queued or written, then when the last report landed. */
export function ReportControl({ status, act, onRead }: { status: AgentsStatus; act: AgentsApi['act']; onRead?: (id: string) => void }) {
  const eco = status.ecoStrat;
  const [requested, setRequested] = useState(false);
  const writing = requested || !!eco.reporting;
  const since = useRef<number | null>(null);
  const [, tick] = useState(0);
  if (writing && since.current === null) since.current = Date.now();
  if (!writing) since.current = null;
  useEffect(() => {
    if (!writing) return;
    const timer = window.setInterval(() => tick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [writing]);
  const elapsed = since.current === null ? 0 : Math.floor((Date.now() - since.current) / 1000);
  const last = eco.lastReport, failure = eco.reportFailure;
  const failedLast = failure && (!last || failure.at > last.at);
  const write = async () => { setRequested(true); try { await act('eco-strat', 'report'); } finally { setRequested(false); } };
  return <div className='report-control'>
    <button type='button' className={writing ? 'busy' : ''} aria-busy={writing} disabled={writing || !status.effective.ecoStrat || !eco.gamesObserved.currentBuild} onClick={() => void write()}>
      {writing ? <><i className='report-spinner' aria-hidden='true'/>Writing report… {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</> : 'Write report now'}
    </button>
    <p className='report-stamp' aria-live='polite'>
      {writing ? eco.busy === 'reporting' ? 'Eco-Strat is reading the games and writing; this can take a few minutes.' : 'Queued: Eco-Strat starts once it finishes the game it is reading.'
        : last ? <>Last report <b>{reportStamp(last.at)}</b> · {last.kind}{last.games ? ` · ${last.games} games` : ''}{onRead && <> · <button type='button' className='report-read' onClick={() => onRead(`eco-strat-report-${last.id}`)}>Read</button></>}</>
        : 'No report yet.'}
      {!!eco.leagueBacklog && <> · {eco.leagueBacklog} league game{eco.leagueBacklog === 1 ? '' : 's'} still to read (~{Math.ceil(eco.leagueBacklog * 40 / 60)} min)</>}
    </p>
    {!writing && failedLast && <p className='agents-error'>Report failed at {reportStamp(failure.at)}: {failure.message}</p>}
  </div>;
}

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
  return <div className='agents-publish'>
    <button type='button' disabled={state.busy} aria-busy={state.busy} onClick={() => void publish()}>{state.busy ? 'Publishing…' : `Publish ${name} to the pack`}</button>
    {state.message && <p className={state.failed ? 'agents-error' : 'agents-note'} aria-live='polite'>{state.message}</p>}
  </div>;
}

/**
 * Switches and status for Eco-Strat, Strat-G and the league adversaries T-5, DV-8 and VP-Dog, one agent per tab, with a reader for
 * each agent's notebook, journal and reports. `settingsOnly` (the setup screen, where test games have their own column) keeps just the switches; Tuning ›
 * Agents adds status, baseline actions and file paths. Pass `agents` to share one status poll with a sibling panel.
 */
export function AgentsPanel({ settingsOnly = false, agents }: { settingsOnly?: boolean; agents?: AgentsApi }) {
  const polled = useAgents(!agents);
  const { status, error, docs, update, act: post } = agents ?? polled;
  const act = (action: string) => post('eco-strat', action);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [tab, setTab] = useState<AgentId>('eco-strat');
  const [reading, setReading] = useState<string | null>(null);

  if (!status) return <p className='agents-note'>{error || 'Loading agents…'}</p>;
  const { settings, stratG, ecoStrat, cohort } = status;
  const master = settings.agentsEnabled;
  const toggle = (label: string, on: boolean, change: () => void, disabled = false) => <button type='button' aria-pressed={on} disabled={disabled} onClick={change}>{label}: {on ? 'On' : 'Off'}</button>;
  const baseline = cohort.running ? { valid: cohort.valid, target: cohort.target, invalid: cohort.invalid } : ecoStrat.baseline;
  const ecoState = status.effective.ecoStrat ? ecoStrat.state : 'off';
  const tabs: { id: AgentId; state: string }[] = [
    { id: 'eco-strat', state: ecoState }, { id: 'strat-g', state: learnerState(status.effective.stratG, stratG) },
    { id: 't-5', state: learnerState(status.effective.t5, status.t5) }, { id: 'dv-8', state: learnerState(status.effective.dv8, status.dv8) },
    { id: 'vp-dog', state: learnerState(status.effective.vpDog, status.vpDog) },
  ];
  const details = !settingsOnly;
  const reader = (agent: AgentId) => {
    const own = docs.filter(doc => doc.agent === agent);
    const latest = own.find(doc => doc.id.startsWith('eco-strat-report-'));
    const main = own.find(doc => !doc.id.startsWith('eco-strat-report-'));
    const reports = own.filter(doc => doc.id.startsWith('eco-strat-report-')).length;
    return <div className='agents-reading' role='group' aria-label={`${AGENT_NAMES[agent]} outputs`}>
      <button type='button' disabled={!main} onClick={() => main && setReading(main.id)}>{agent === 'eco-strat' ? 'Read journal' : 'Read notebook'}</button>
      {agent === 'eco-strat' && <button type='button' disabled={!latest} title={reports ? `${reports} report${reports === 1 ? '' : 's'}` : 'No reports yet'} onClick={() => latest && setReading(latest.id)}>Read latest report</button>}
    </div>;
  };

  return <div className={`agents-panel ${settingsOnly ? 'settings-only' : ''}`}>
    {toggle('AI agents', master, () => update({ agentsEnabled: !master }))}
    <div className='agents-tabs' role='tablist' aria-label='AI agent'>{tabs.map(entry => <button key={entry.id} type='button' role='tab' id={`agents-tab-${entry.id}`} aria-selected={tab === entry.id} aria-controls={`agents-panel-${entry.id}`} onClick={() => setTab(entry.id)}>
      <AgentAvatar agent={entry.id}/><span><strong>{AGENT_NAMES[entry.id]}</strong><small>{entry.state}</small></span>
    </button>)}</div>
    {tab === 'strat-g' ? <section className='agent-card' role='tabpanel' id='agents-panel-strat-g' aria-labelledby='agents-tab-strat-g'>
      {toggle('Strat-G', settings.stratG.enabled, () => update({ stratG: { enabled: !settings.stratG.enabled } }), !master)}
      {toggle('Decision log', settings.stratG.recordDecisions, () => update({ stratG: { recordDecisions: !settings.stratG.recordDecisions } }), !master)}
      {reader('strat-g')}
      <PublishControl agent='strat-g'/>
      <Fold title='About Strat-G'><p>Balanced: plays you from the designer's baseline, and plays T-5, DV-8 and VP-Dog in the league. It changes its play only through measured experiments, and never sees the adversaries' strategies.</p></Fold>
      {details&&<Fold title='Status'><dl>
        <dt>Record</dt><dd>{stratG.record.aiWins}–{stratG.record.humanWins}–{stratG.record.ties} over {stratG.record.games}</dd>
        <dt>League</dt><dd>{leagueLine(status, 'strat-g')}</dd>
        <dt>Theories</dt><dd>{stratG.activeTheories} active</dd>
        <dt>Experiment</dt><dd>{stratG.experiment ? `${stratG.experiment.id} (${stratG.experiment.stage}): ${stratG.experiment.change}` : 'none running'}</dd>
        <dt>Learned</dt><dd>{stratG.adoptedChanges ?? 0} adopted of {stratG.experimentsConcluded ?? 0} tested{stratG.ignoredGames ? ` · ${stratG.ignoredGames} non-games ignored` : ''}</dd>
        <dt>Model</dt><dd>{stratG.modelConfigured ? stratG.model : 'not configured'}</dd>
        <dt>Notebook</dt><dd><code>{stratG.paths.notebook}</code></dd>
      </dl></Fold>}
      {stratG.error&&<p className='agents-error'>{stratG.error}</p>}
    </section>
    : isAdversary(tab) ? (() => {
      const { key, about } = ADVERSARIES[tab];
      const agent = status[key], name = AGENT_NAMES[tab];
      return <section className='agent-card' role='tabpanel' id={`agents-panel-${tab}`} aria-labelledby={`agents-tab-${tab}`}>
        {toggle(name, settings[key].enabled, () => update({ [key]: { enabled: !settings[key].enabled } }), !master)}
        <p className='agents-note'>{leagueLine(status, tab)}</p>
        {reader(tab)}
        <PublishControl key={tab} agent={tab}/>
        <Fold title={`About ${name}`}><p>{about} Plays in the AI league and against you when you pick it as your opponent, and learns only from its own results: it never sees the other agents' strategies.</p></Fold>
        {details&&<Fold title='Status'><dl>
          <dt>Experiment</dt><dd>{agent.experiment ? `${agent.experiment.id} (${agent.experiment.stage}): ${agent.experiment.change}` : 'none running'}</dd>
          <dt>Learned</dt><dd>{agent.adoptedChanges ?? 0} adopted of {agent.experimentsConcluded ?? 0} tested</dd>
          <dt>Model</dt><dd>{agent.modelConfigured ? agent.model : 'not configured'}</dd>
          <dt>Notebook</dt><dd><code>{agent.paths.notebook}</code></dd>
        </dl></Fold>}
        {agent.error&&<p className='agents-error'>{agent.error}</p>}
      </section>;
    })()
    : <section className='agent-card' role='tabpanel' id='agents-panel-eco-strat' aria-labelledby='agents-tab-eco-strat'>
      {toggle('Evaluation', settings.ecoStrat.enabled, () => update({ ecoStrat: { enabled: !settings.ecoStrat.enabled } }), !master)}
      {toggle('Observe my games', settings.ecoStrat.observeHumanGames, () => update({ ecoStrat: { observeHumanGames: !settings.ecoStrat.observeHumanGames } }), !master)}
      {toggle('Continuous reports', settings.ecoStrat.continuous, () => update({ ecoStrat: { continuous: !settings.ecoStrat.continuous } }), !master)}
      {settings.ecoStrat.continuous&&<div className='agents-cadence' role='radiogroup' aria-label='Report every'>
        <small>Report every</small>
        {REPORT_CADENCE.map(count => <button key={count} type='button' role='radio' aria-checked={settings.ecoStrat.reportEvery === count} disabled={!master} onClick={() => update({ ecoStrat: { reportEvery: count } })}>{count} games</button>)}
      </div>}
      {details&&<>
        <div className='agents-progress' aria-label='Baseline progress'>
          <span>Baseline {baseline.valid}/{baseline.target}{baseline.invalid ? ` · ${baseline.invalid} invalid` : ''}{cohort.running ? ` · ${cohortPhaseLabel(cohort.phase)}` : ecoStrat.baseline.status === 'complete' ? ' · complete' : ''}</span>
          <i style={{ width: `${Math.min(100, (baseline.valid / Math.max(1, baseline.target)) * 100)}%` }}/>
        </div>
        <div className='agents-actions'>
          {cohort.running
            ? <button type='button' onClick={() => act('stop')}>Stop baseline</button>
            : <button type='button' disabled={!status.effective.ecoStrat} onClick={() => act('baseline')}>{ecoStrat.baseline.status === 'complete' ? 'Re-run baseline' : 'Run baseline'} ({settings.ecoStrat.baselineGames} AI games)</button>}
        </div>
        <ReportControl status={status} act={post} onRead={setReading}/>
      </>}
      {reader('eco-strat')}
      <Fold title='About Eco-Strat'><p>Evaluates the economy from finished games. Read-only: it never plays or advises Strat-G.</p></Fold>
      {details&&<>
        <Fold title='Status'><dl>
          <dt>Build</dt><dd>{ecoStrat.build?.label ?? '—'}</dd>
          <dt>Games</dt><dd>{ecoStrat.gamesObserved.currentBuild} this build · {ecoStrat.gamesObserved.allBuilds} total</dd>
          <dt>Journal</dt><dd>{ecoStrat.hypotheses} hypotheses · {ecoStrat.observations} observations · {ecoStrat.recommendations} recommendations</dd>
          <dt>Model</dt><dd>{ecoStrat.modelConfigured ? ecoStrat.model ?? `${ecoStrat.preferredModels[0]} (not yet used)` : 'not configured'}</dd>
          <dt>Next report</dt><dd>{ecoStrat.nextReportIn === null ? 'after baseline' : `in ${ecoStrat.nextReportIn} games`}</dd>
          <dt>Last report</dt><dd>{ecoStrat.lastReport ? <code>{ecoStrat.lastReport.markdown}</code> : 'none yet'}</dd>
          <dt>Journal file</dt><dd><code>{ecoStrat.paths.journal}</code></dd>
          {ecoStrat.errors > 0&&<><dt>Errors</dt><dd>{ecoStrat.errors} (gameplay unaffected)</dd></>}
        </dl></Fold>
        {confirmArchive
          ? <div className='agents-actions'><button type='button' onClick={() => { setConfirmArchive(false); void act('archive'); }}>Archive and start fresh</button><button type='button' onClick={() => setConfirmArchive(false)}>Cancel</button></div>
          : <button type='button' disabled={!status.effective.ecoStrat || cohort.running} onClick={() => setConfirmArchive(true)}>Archive journal…</button>}
      </>}
      {ecoStrat.lastError&&<p className='agents-error'>{ecoStrat.lastError}</p>}
    </section>}
    {details&&<Fold title='Files'><p className='agents-note'>Settings: <code>{status.settingsFile}</code>. API keys stay in <code>.env</code> on the server.</p></Fold>}
    {(error || cohort.error)&&<p className='agents-error'>{error || cohort.error}</p>}
    {reading&&<AgentReader docs={docs} initial={reading} onClose={() => setReading(null)}/>}
  </div>;
}
