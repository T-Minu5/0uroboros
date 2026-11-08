import { useEffect, useState } from 'react';
import { AgentsPanel } from './AgentsPanel';
import { AgentAvatar } from './agentAvatars';
import { useAgents } from './agentsApi';
import { ContentAbPanel, MentoringPanel, TestGamesPanel } from './TestGamesPanel';
import './agents-page.css';

const KEY = 'ouroboros.agentsPage';
const TABS = [
  { id: 'games', label: 'Agent games' },
  { id: 'ab', label: 'Content A/B' },
  { id: 'agents', label: 'Agents' },
  { id: 'mentoring', label: 'Mentoring' },
] as const;
type Tab = typeof TABS[number]['id'];
function readTab(): Tab {
  try { return TABS.find(tab => tab.id === JSON.parse(localStorage.getItem(KEY) ?? '{}').tab)?.id ?? 'games'; } catch { return 'games'; }
}

/**
 * The local Agents page (`/agents`, studio build only): agent games (Eco study + league), Content A/B,
 * agent switches/publishing, and mentoring. Talks to `/api/agents` and `/api/ai`; nothing here ships
 * in a client build, which plays opponents published in the content pack instead.
 */
export function AgentsPage() {
  const [tab, setTab] = useState<Tab>(readTab);
  const agents = useAgents(true);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify({ tab })); }, [tab]);

  return <main className='agents-page'>
    <header>
      <span className='setup-agents-faces' aria-hidden='true'><AgentAvatar agent='eco-strat' size={22}/><AgentAvatar agent='strat-g' size={22}/><AgentAvatar agent='t-5' size={22}/><AgentAvatar agent='dv-8' size={22}/><AgentAvatar agent='vp-dog' size={22}/><AgentAvatar agent='last-2go' size={22}/></span>
      <span className='setup-agents-title'><small>AI AGENTS</small><span>Agent games, Content A/B, agents and mentoring. Publish an agent to the content pack to ship it.</span></span>
      <nav aria-label='Studio pages'><a href='/'>Game</a><a href='/author'>Content Studio</a></nav>
    </header>
    <section className='setup-agents' aria-label='AI agents'>
      <div className='setup-agents-tabs' role='tablist' aria-label='AI agents sections'>
        {TABS.map(entry => <button key={entry.id} type='button' role='tab' id={`setup-agents-tab-${entry.id}`} aria-selected={tab === entry.id} aria-controls='setup-agents-body' onClick={() => setTab(entry.id)}>{entry.label}</button>)}
      </div>
      <div id='setup-agents-body' className={`setup-agents-body ${tab}`} role='tabpanel' aria-labelledby={`setup-agents-tab-${tab}`}>
        {tab === 'games' ? <TestGamesPanel agents={agents}/>
          : tab === 'ab' ? <ContentAbPanel agents={agents}/>
          : tab === 'agents' ? <section className='setup-agents-settings' aria-label='Agent settings'><p className='test-games-meta'>Changes apply to the next game.</p><AgentsPanel settingsOnly agents={agents}/></section>
          : <MentoringPanel agents={agents}/>}
      </div>
    </section>
  </main>;
}
