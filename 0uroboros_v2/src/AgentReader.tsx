import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AGENT_NAMES, AgentAvatar, type AgentId } from './agentAvatars';
import { Markdown, splitTabs } from './miniMarkdown';
import './agent-reader.css';

export type AgentDocument = { id: string; agent: AgentId; title: string; path: string; updatedAt: string };

/** A plain reader for an agent's notebook, journal or reports. Portalled so a transformed drawer cannot trap it. */
export function AgentReader({ docs, initial, onClose }: { docs: AgentDocument[]; initial: string; onClose: () => void }) {
  const [selected, setSelected] = useState(initial);
  const [content, setContent] = useState<{ id: string; markdown: string } | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const close = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const doc = docs.find(entry => entry.id === selected) ?? docs[0];
  const agent = doc?.agent ?? 'eco-strat';
  const siblings = docs.filter(entry => entry.agent === agent);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('keydown', escape, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    setError('');
    fetch(`/api/agents/documents/${encodeURIComponent(doc.id)}`, { cache: 'no-store' })
      .then(async response => { const value = await response.json() as { markdown?: string; error?: string }; if (!response.ok) throw new Error(value.error ?? `Unavailable (${response.status}).`); return value.markdown ?? ''; })
      .then(markdown => { if (!cancelled) { setContent({ id: doc.id, markdown }); setTab(0); body.current?.scrollTo({ top: 0 }); } })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unavailable.'); });
    return () => { cancelled = true; };
  }, [doc?.id]);
  const ready = !error && content?.id === doc?.id;
  const parts = ready ? splitTabs(content!.markdown) : null;
  const tabs = parts?.tabs ?? [];
  const current = tabs[Math.min(tab, tabs.length - 1)];
  const pick = (index: number) => { setTab(index); body.current?.scrollTo({ top: 0 }); };

  return createPortal(<div className='agent-reader-backdrop' onClick={onClose}>
    <section className='agent-reader' role='dialog' aria-modal='true' aria-label={`${AGENT_NAMES[agent]} · ${doc?.title ?? 'Document'}`} onClick={event => event.stopPropagation()}>
      <header>
        <AgentAvatar agent={agent} size={36}/>
        <div className='agent-reader-title'>
          <small>{AGENT_NAMES[agent]}</small>
          {siblings.length > 1
            ? <select aria-label='Document' value={doc?.id} onChange={event => setSelected(event.target.value)}>{siblings.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select>
            : <h2>{doc?.title ?? 'No documents yet'}</h2>}
        </div>
        <button ref={close} type='button' className='agent-reader-close' aria-label='Close reader' onClick={onClose}>×</button>
      </header>
      {doc && <p className='agent-reader-meta'><code>{doc.path}</code> · updated {new Date(doc.updatedAt).toLocaleString()}</p>}
      {tabs.length > 1 && <div className='agent-reader-tabs' role='tablist' aria-label='Report sections'>
        {tabs.map((entry, index) => <button key={entry.title} type='button' role='tab' aria-selected={entry === current} className={entry === current ? 'active' : ''} onClick={() => pick(index)}>{entry.title}</button>)}
      </div>}
      <div ref={body} className='agent-reader-body' role={tabs.length > 1 ? 'tabpanel' : undefined}>
        {error ? <p className='agent-reader-error'>{error}</p> : !parts ? <p className='agent-reader-loading'>Opening…</p>
          : tabs.length ? <><div className='agent-reader-preamble'><Markdown text={parts.preamble}/></div><Markdown text={current.text}/></>
          : <Markdown text={parts.preamble}/>}
      </div>
    </section>
  </div>, document.body);
}
