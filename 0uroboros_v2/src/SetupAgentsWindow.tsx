import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AgentsPanel } from './AgentsPanel';
import { AgentAvatar } from './agentAvatars';
import { useAgents } from './agentsApi';
import { MentoringPanel, TestGamesPanel } from './TestGamesPanel';

const KEY = 'ouroboros.agentsWindow';
const TABS = [{ id: 'games', label: 'Agent games' }, { id: 'agents', label: 'Agents' }, { id: 'mentoring', label: 'Mentoring' }] as const;
type Tab = typeof TABS[number]['id'];
type Placement = { x: number; y: number; collapsed: boolean; tab: Tab };
function readPlacement(): Placement {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Placement>;
    return { x: Number(value.x) || 0, y: Number(value.y) || 0, collapsed: value.collapsed === true, tab: TABS.find(tab => tab.id === value.tab)?.id ?? 'games' };
  } catch { return { x: 0, y: 0, collapsed: false, tab: 'games' }; }
}

/**
 * The setup screen's AI agents window, in three tabs: agent games (Eco-Strat's study and the AI league), the agents' switches, and mentoring.
 * Drag it by its header bar, roll it up to just that bar.
 * It moves by an offset from its place beside the setup card, kept inside the setup screen so the bar is always reachable.
 */
export function SetupAgentsWindow() {
  const [placement, setPlacement] = useState(readPlacement);
  const agents = useAgents(!placement.collapsed);
  const root = useRef<HTMLElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; base: Placement; rect: DOMRect; bounds: DOMRect } | null>(null);
  const [dragging, setDragging] = useState(false);
  // Shift that keeps the saved spot on screen in the current layout; never saved, so a small browser or a loading layout can't overwrite the spot.
  const [nudge, setNudge] = useState({ x: 0, y: 0 });
  const nudgeRef = useRef(nudge);
  nudgeRef.current = nudge;
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(placement)); }, [placement]);

  const clamp = (base: Placement, dx: number, dy: number, rect: DOMRect, bounds: DOMRect) => {
    const left = Math.min(Math.max(rect.left + dx, bounds.left + 8), Math.max(bounds.left + 8, bounds.right - rect.width - 8));
    const top = Math.min(Math.max(rect.top + dy, bounds.top + 8), Math.max(bounds.top + 8, bounds.bottom - rect.height - 8));
    return { ...base, x: base.x + left - rect.left, y: base.y + top - rect.top };
  };
  const fit = () => {
    const element = root.current, bounds = element?.parentElement?.getBoundingClientRect();
    if (!element || !bounds) return;
    const shown = element.getBoundingClientRect(), current = nudgeRef.current;
    const saved = new DOMRect(shown.x - current.x, shown.y - current.y, shown.width, shown.height);
    const next = clamp({ x: 0, y: 0, collapsed: false, tab: 'games' }, 0, 0, saved, bounds);
    if (Math.abs(next.x - current.x) + Math.abs(next.y - current.y) > .5) setNudge({ x: next.x, y: next.y });
  };
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (!drag.current) fit(); });
    if (root.current) observer.observe(root.current);
    window.addEventListener('resize', fit);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, []);

  const begin = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const element = root.current, bounds = element?.parentElement?.getBoundingClientRect();
    if (!element || !bounds) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const base = { ...placement, x: placement.x + nudge.x, y: placement.y + nudge.y };
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, base, rect: element.getBoundingClientRect(), bounds };
    setPlacement(base); setNudge({ x: 0, y: 0 });
    setDragging(true);
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    setPlacement(clamp(current.base, event.clientX - current.x, event.clientY - current.y, current.rect, current.bounds));
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null; setDragging(false);
  };
  const toggle = () => setPlacement(current => ({ ...current, collapsed: !current.collapsed }));

  return <aside ref={root} className={`setup-agents ${placement.collapsed ? 'collapsed' : ''} ${dragging ? 'dragging' : ''}`} aria-label='AI agents' style={{ translate: `${placement.x + nudge.x}px ${placement.y + nudge.y}px` }}>
    <header onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onDoubleClick={event => { if (!(event.target as HTMLElement).closest('button')) toggle(); }}>
      <span className='setup-agents-grip' aria-hidden='true'/>
      <span className='setup-agents-faces' aria-hidden='true'><AgentAvatar agent='eco-strat' size={22}/><AgentAvatar agent='strat-g' size={22}/><AgentAvatar agent='t-5' size={22}/><AgentAvatar agent='dv-8' size={22}/><AgentAvatar agent='vp-dog' size={22}/></span>
      <span className='setup-agents-title'><small>AI AGENTS</small><span>Agent games, agents and mentoring</span></span>
      <button type='button' className='setup-agents-roll' aria-expanded={!placement.collapsed} aria-controls='setup-agents-body' aria-label={placement.collapsed ? 'Expand AI agents' : 'Collapse AI agents'} onClick={toggle}>
        <svg viewBox='0 0 12 12' width='12' height='12' aria-hidden='true'><path d='M2.5 7.5 L6 4 L9.5 7.5' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'/></svg>
      </button>
    </header>
    {!placement.collapsed && <>
      <div className='setup-agents-tabs' role='tablist' aria-label='AI agents sections'>
        {TABS.map(tab => <button key={tab.id} type='button' role='tab' id={`setup-agents-tab-${tab.id}`} aria-selected={placement.tab === tab.id} aria-controls='setup-agents-body' onClick={() => setPlacement(current => ({ ...current, tab: tab.id }))}>{tab.label}</button>)}
      </div>
      <div id='setup-agents-body' className={`setup-agents-body ${placement.tab}`} role='tabpanel' aria-labelledby={`setup-agents-tab-${placement.tab}`}>
        {placement.tab === 'games' ? <TestGamesPanel agents={agents}/>
          : placement.tab === 'agents' ? <section className='setup-agents-settings' aria-label='Agent settings'><p className='test-games-meta'>Changes apply to the next game.</p><AgentsPanel settingsOnly agents={agents}/></section>
          : <MentoringPanel agents={agents}/>}
      </div>
    </>}
  </aside>;
}
