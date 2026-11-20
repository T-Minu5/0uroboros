import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AgentAvatar, type AgentId } from './agentAvatars';
import { CHAT_KICKOFF_MESSAGE, chatWithStrat, formatChatReplyContent, type ChatAudience, type ChatHistoryTurn, type ChatReply } from './agentsApi';

const CHAT_AUDIENCES: { id: ChatAudience; label: string }[] = [
  { id: 'strat-g', label: 'Strat-G' },
  { id: 'eco-strat', label: 'Eco-Strat' },
  { id: 't-5', label: 'T-5' },
  { id: 'dv-8', label: 'DV-8' },
  { id: 'vp-dog', label: 'VP-Dog' },
  { id: 'last-2go', label: 'Last2Go' },
  { id: 'both', label: 'Strat-G and Eco-Strat' },
  { id: 'all', label: 'Everyone' },
];
const SPEAKER_LABEL: Record<ChatReply['speaker'], string> = {
  'strat-g': 'Strat-G', 'eco-strat': 'Eco-Strat', 't-5': 'T-5', 'dv-8': 'DV-8', 'vp-dog': 'VP-Dog', 'last-2go': 'Last2Go',
};
type ChatLogEntry = { kind: 'user'; content: string } | { kind: 'assistant'; reply: ChatReply };

/**
 * A temporary designer Q&A with the agents. They can complain, ask about mechanics and learn from the answers; guidance
 * is written into their notes or the Eco journal, and their strategy profiles stay unchanged.
 */
export function AgentChatPanel() {
  const [audience, setAudience] = useState<ChatAudience>('both');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<ChatHistoryTurn[]>([]);
  const [log, setLog] = useState<ChatLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logEnd = useRef<HTMLDivElement | null>(null);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'nearest' }); }, [log, busy]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true); setError('');
    setLog(prev => [...prev, { kind: 'user', content: trimmed }]);
    try {
      const result = await chatWithStrat(audience, trimmed, history);
      const assistantTurns = result.replies.map(reply => ({ role: 'assistant' as const, speaker: reply.speaker, content: formatChatReplyContent(reply) }));
      setHistory(prev => [...prev, { role: 'user', content: trimmed }, ...assistantTurns]);
      setLog(prev => [...prev, ...result.replies.map(reply => ({ kind: 'assistant' as const, reply }))]);
      setMessage('');
      if (result.error) setError(result.error);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chat failed.');
    } finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(message); };
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(message); }
  };

  return <section className='lc-panel agent-chat' aria-labelledby='agent-chat-title'>
    <header className='lc-panel-head'>
      <h2 id='agent-chat-title'>Agent chat</h2>
      <p>Answers are written into the agents’ notes and the Eco journal. Their strategy profiles stay unchanged. Clearing wipes this thread only.</p>
    </header>
    <div className='lc-segments agent-chat-audience' role='radiogroup' aria-label='Who you are talking to'>
      {CHAT_AUDIENCES.map(entry => <button key={entry.id} type='button' role='radio' aria-checked={audience === entry.id} disabled={busy} onClick={() => setAudience(entry.id)}>{entry.label}</button>)}
    </div>
    <div className='agent-chat-log' aria-live='polite'>
      {!log.length && <div className='agent-chat-empty'>
        <p>No messages yet.</p>
        <button type='button' className='lc-button lc-primary' disabled={busy} onClick={() => void send(CHAT_KICKOFF_MESSAGE)}>Open a session</button>
        <p className='lc-meta'>Each agent opens with its top 3 complaints and up to 2 questions for you.</p>
      </div>}
      {log.map((entry, index) => entry.kind === 'user'
        ? <article key={`u-${index}`} className='chat-turn chat-user'><p>{entry.content}</p></article>
        : <article key={`a-${entry.reply.speaker}-${index}`} className='chat-turn chat-reply'>
          <header><AgentAvatar agent={entry.reply.speaker as AgentId} size={32}/><b>{SPEAKER_LABEL[entry.reply.speaker]}</b><small>Confidence: {entry.reply.confidence}</small></header>
          <p className='chat-answer'>{entry.reply.answer}</p>
          {!!entry.reply.complaints.length && <div className='chat-block'><h3>Top complaints</h3><ol>{entry.reply.complaints.map((item, i) => <li key={i}>{item}</li>)}</ol></div>}
          {!!entry.reply.questionsForMel.length && <div className='chat-block chat-ask'><h3>Questions for you</h3><ol>{entry.reply.questionsForMel.map((item, i) => <li key={i}>{item}</li>)}</ol></div>}
          {!!entry.reply.learned.length && <div className='chat-block'><h3>Learned</h3><ul>{entry.reply.learned.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
          {!!entry.reply.sources.length && <p className='lc-meta'>Sources: {entry.reply.sources.map(source => source.id).join(', ')}</p>}
        </article>)}
      {busy && <p className='lc-meta chat-thinking'><i className='lc-spinner' aria-hidden='true'/>Thinking</p>}
      <div ref={logEnd}/>
    </div>
    <form className='agent-chat-form' onSubmit={submit}>
      <label className='lc-sr-only' htmlFor='agent-chat-input'>Message</label>
      <textarea id='agent-chat-input' value={message} disabled={busy} rows={3} placeholder='Answer their questions, give guidance or ask your own' onChange={event => setMessage(event.target.value)} onKeyDown={keys}/>
      <div className='lc-actions'>
        <button type='submit' className='lc-button lc-primary' disabled={busy || !message.trim()}>{busy ? 'Sending' : 'Send'}</button>
        {log.length > 0 && <button type='button' className='lc-button' disabled={busy} onClick={() => void send(CHAT_KICKOFF_MESSAGE)}>New session prompt</button>}
        <button type='button' className='lc-button lc-quiet' disabled={busy || !log.length} onClick={() => { setHistory([]); setLog([]); setError(''); }}>Clear</button>
        <small className='lc-meta'>Cmd+Enter sends</small>
      </div>
    </form>
    {error && <p className='lc-error'>{error}</p>}
  </section>;
}
