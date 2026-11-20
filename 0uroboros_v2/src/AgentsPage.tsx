import { useEffect, useState, type KeyboardEvent } from 'react';
import { AgentChatPanel } from './AgentChatPanel';
import { LeagueSettingsPanel } from './AgentsPanel';
import { useAgents } from './agentsApi';
import { LeagueGamesPanel, MentoringPanel } from './TestGamesPanel';
import './agents-page.css';

const KEY = 'ouroboros.agentsPage';
const TABS = [
  { id: 'games', label: 'League games' },
  { id: 'settings', label: 'League settings' },
  { id: 'chat', label: 'Agent chat' },
  { id: 'mentoring', label: 'Mentoring' },
] as const;
type Tab = typeof TABS[number]['id'];
/** Tabs saved before the league overhaul: Agents became League settings, and Content A/B is gone. */
const MOVED: Record<string, Tab> = { agents: 'settings', ab: 'games' };
function readTab(): Tab {
  try {
    const saved = String(JSON.parse(localStorage.getItem(KEY) ?? '{}').tab ?? '');
    return TABS.find(tab => tab.id === saved)?.id ?? MOVED[saved] ?? 'games';
  } catch { return 'games'; }
}

/**
 * The local league console (`/agents`, studio build only): the league ruleset, games and epoch log, agent settings,
 * agent chat and mentoring. Talks to `/api/agents` and `/api/ai`; nothing here ships in a client build, which plays
 * opponents published in the content pack instead.
 */
export function AgentsPage() {
  const [tab, setTab] = useState<Tab>(readTab);
  const agents = useAgents(true);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify({ tab })); }, [tab]);
  const running = agents.status?.league.running;
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`league-tab-${next.id}`)?.focus();
  };

  return <main className='league-console'>
    <header className='lc-top'>
      <span className='lc-brand'>
        <h1>League console</h1>
        <small>{agents.status ? `Ruleset ${agents.status.rules.hash}${running ? ', league running' : ''}` : 'Connecting'}</small>
      </span>
      <nav aria-label='Studio pages'><a href='/'>Game</a><a href='/author'>Content Studio</a></nav>
    </header>
    <div className='lc-tabs' role='tablist' aria-label='League console sections'>
      {TABS.map((entry, index) => <button key={entry.id} type='button' role='tab' id={`league-tab-${entry.id}`} aria-selected={tab === entry.id} aria-controls='league-tabpanel' tabIndex={tab === entry.id ? 0 : -1}
        onClick={() => setTab(entry.id)} onKeyDown={event => move(event, index)}>{entry.label}</button>)}
    </div>
    <div id='league-tabpanel' className={`lc-body lc-body-${tab}`} role='tabpanel' aria-labelledby={`league-tab-${tab}`}>
      {tab === 'games' ? <LeagueGamesPanel agents={agents}/>
        : tab === 'settings' ? <LeagueSettingsPanel agents={agents}/>
        : tab === 'chat' ? <AgentChatPanel/>
        : <MentoringPanel agents={agents}/>}
    </div>
  </main>;
}
