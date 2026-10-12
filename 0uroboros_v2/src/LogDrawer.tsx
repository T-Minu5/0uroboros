import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { serverMaximums, type PlayerId } from '@0uroboros/engine/game';
import type { CycleRecord, RuntimeEvent, SessionPhase } from '@0uroboros/engine/runtime';
import { summarizeEvents, type SeatNames } from './logSummary';
import './log-drawer.css';

type SectionId = 'turn-1'|'turn-2'|'turn-3'|'collapse'|'draft'|'end';
const STEPS: { id: SectionId; label: string }[] = [
 { id: 'turn-1', label: 'Turn 1' }, { id: 'turn-2', label: 'Turn 2' }, { id: 'turn-3', label: 'Turn 3' },
 { id: 'collapse', label: 'Collapse' }, { id: 'draft', label: 'Draft' },
];
const SECTION_LABEL: Record<SectionId, string> = { 'turn-1': 'Turn 1', 'turn-2': 'Turn 2', 'turn-3': 'Turn 3', collapse: 'Collapse', draft: 'Draft', end: 'Session end' };
const ORDER: SectionId[] = ['turn-1', 'turn-2', 'turn-3', 'collapse', 'draft', 'end'];

const sectionOf = (phase: SessionPhase|undefined, turn: number|undefined): SectionId =>
 phase === 'collapse' ? 'collapse' : phase === 'draft' ? 'draft' : phase === 'gameover' ? 'end' : `turn-${Math.min(3, Math.max(1, turn ?? 1))}` as SectionId;

type Live = { cycle: number; turn: number; phase: SessionPhase };
type Props = { events: RuntimeEvent[]; cycles: CycleRecord[]; live: Live|null; colors: [string, string]; names: SeatNames; close: () => void };

const pad = (n: number) => String(n).padStart(2, '0');
const signed = (n: number) => n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0';
const winnerLabel = (winner: PlayerId|null, names: SeatNames) => winner === null ? 'Tie' : names[winner];

export function LogDrawer({ events, cycles, live, colors, names, close }: Props) {
 const grouped = useMemo(() => {
  const byCycle = new Map<number, Map<SectionId, RuntimeEvent[]>>();
  let cycle = 1;
  for (const event of events) {
   cycle = event.cycle ?? cycle;
   const sections = byCycle.get(cycle) ?? new Map<SectionId, RuntimeEvent[]>();
   const id = sectionOf(event.phase, event.turn);
   sections.set(id, [...(sections.get(id) ?? []), event]);
   byCycle.set(cycle, sections);
  }
  return byCycle;
 }, [events]);
 const cycleNumbers = useMemo(() => {
  const last = Math.max(live?.cycle ?? 0, ...grouped.keys(), ...cycles.map(record => record.cycle));
  return Array.from({ length: Math.max(0, last) }, (_, index) => index + 1);
 }, [grouped, cycles, live]);
 const [selected, setSelected] = useState(() => cycleNumbers[cycleNumbers.length - 1] ?? 1);
 const [inView, setInView] = useState<SectionId>('turn-1');
 const body = useRef<HTMLDivElement>(null);
 const sectionRefs = useRef(new Map<SectionId, HTMLElement>());
 const tabRefs = useRef(new Map<number, HTMLButtonElement>());

 const sections = grouped.get(selected) ?? new Map<SectionId, RuntimeEvent[]>();
 const record = cycles.find(item => item.cycle === selected) ?? null;
 const previous = cycles.find(item => item.cycle === selected - 1) ?? null;
 const isLive = live !== null && live.phase !== 'gameover' && live.cycle === selected;
 const liveStep = isLive ? sectionOf(live.phase, live.turn) : null;
 const shown = ORDER.filter(id => sections.has(id) || (id === 'collapse' && record));

 const crumbState = (id: SectionId) => {
  if (id === liveStep) return 'current';
  if (isLive && ORDER.indexOf(id) > ORDER.indexOf(liveStep!)) return '';
  return shown.includes(id) ? 'complete' : '';
 };

 useLayoutEffect(() => {
  const el = body.current;
  if (!el) return;
  el.scrollTop = isLive ? el.scrollHeight : 0;
  updateInView();
 }, [selected]);

 useEffect(() => { tabRefs.current.get(selected)?.scrollIntoView({ block: 'nearest' }); }, [selected]);

 function updateInView() {
  const el = body.current;
  if (!el || !shown.length) return;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  let current = shown[0];
  for (const id of shown) {
   const section = sectionRefs.current.get(id);
   if (section && section.offsetTop - el.scrollTop <= 12) current = id;
  }
  setInView(atBottom && el.scrollTop > 0 ? shown[shown.length - 1] : current);
 }

 function jump(id: SectionId) {
  const el = body.current, section = sectionRefs.current.get(id);
  if (!el || !section) return;
  el.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
  setInView(id);
 }

 function tabKeys(event: KeyboardEvent<HTMLDivElement>) {
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = Math.min(cycleNumbers.length, Math.max(1, selected + step));
  setSelected(next);
  tabRefs.current.get(next)?.focus();
 }

 return <aside className='log-drawer' aria-label='Circuit log' onClick={event => event.stopPropagation()}
  style={{ '--log-p0': colors[0], '--log-p1': colors[1] } as CSSProperties}>
  <nav className='log-cycles'>
   <small>Cycle</small>
   <div className='log-cycle-tabs' role='tablist' aria-orientation='vertical' aria-label='Cycles' onKeyDown={tabKeys}>
    {cycleNumbers.map(cycle => <button key={cycle} ref={el => { if (el) tabRefs.current.set(cycle, el); else tabRefs.current.delete(cycle); }}
     type='button' role='tab' aria-selected={cycle === selected} tabIndex={cycle === selected ? 0 : -1}
     className={live && live.phase !== 'gameover' && live.cycle === cycle ? 'live' : ''} data-cycle={cycle}
     onClick={() => setSelected(cycle)}>{pad(cycle)}</button>)}
   </div>
  </nav>
  <section className='log-main' role='tabpanel' aria-label={`Cycle ${selected}`}>
   <header className='log-head'>
    <button className='close' aria-label='Close panel' onClick={close}>×</button>
    <small>0UROBOROS / CIRCUIT LOG</small>
    <h2>Cycle {pad(selected)}{isLive && <span className='log-live-tag'>Live</span>}</h2>
    <div className='log-crumbs' aria-label='Jump to'>
     {STEPS.map(step => {
      const reached = shown.includes(step.id);
      const state = crumbState(step.id);
      return <button key={step.id} type='button' disabled={!reached} data-section={step.id}
       className={`${state}${inView === step.id && reached ? ' in-view' : ''}`}
       aria-current={inView === step.id && reached ? 'location' : undefined}
       onClick={() => jump(step.id)}><i/>{step.label}</button>;
     })}
    </div>
   </header>
   <div className='log-body' ref={body} onScroll={updateInView}>
    {!shown.length && <p className='log-empty'>{events.length ? 'Nothing recorded for this Cycle yet.' : 'Your first deployment starts the record.'}</p>}
    {shown.map(id => {
     const list = sections.get(id) ?? [];
     const players = id === 'end' ? [] : summarizeEvents(list, names);
     const count = players.reduce((sum, group) => sum + group.lines.length, 0);
     return <section key={id} className={`log-section log-section--${id}`} data-section={id}
      ref={el => { if (el) sectionRefs.current.set(id, el); else sectionRefs.current.delete(id); }}>
      <h3 className='log-section-head'>{SECTION_LABEL[id]}{id !== 'end' && <span>{count} {count === 1 ? 'entry' : 'entries'}</span>}</h3>
      {id === 'collapse' && <CollapseSummary record={record} previous={previous} names={names}/>}
      {id === 'collapse' && record && count > 0 && <h4 className='log-subhead'>Resolution</h4>}
      {id === 'end'
       ? <ol className='log-events'>{list.map(e => <li key={e.id} data-event-kind={e.kind} data-event-id={e.id}>{e.text}</li>)}</ol>
       : players.map(group => <div key={group.owner} className='log-player' data-owner={group.owner}>
        <h4>{names[group.owner]}</h4>
        <ul>{group.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
       </div>)}
      {id.startsWith('turn-') && !count && <p className='log-empty-turn'>No cards revealed yet.</p>}
     </section>;
    })}
   </div>
  </section>
 </aside>;
}

function CollapseSummary({ record, previous, names }: { record: CycleRecord|null; previous: CycleRecord|null; names: SeatNames }) {
 if (!record) return <p className='log-collapse-pending'>The summary appears once every Node has resolved.</p>;
 const startVP = previous?.vp ?? [0, 0];
 const fullIntegrity = serverMaximums.primary + serverMaximums.backup;
 const startIntegrity = previous?.servers ?? [fullIntegrity, fullIntegrity];
 const rows: { label: string; values: [string, string]; deltas?: [string, string] }[] = [
  { label: 'Locations won', values: [String(record.locationsWon[0]), String(record.locationsWon[1])] },
  { label: 'VP', values: [String(record.vp[0]), String(record.vp[1])], deltas: [signed(record.vp[0] - startVP[0]), signed(record.vp[1] - startVP[1])] },
  { label: 'Integrity', values: [String(record.servers[0]), String(record.servers[1])], deltas: [signed(record.servers[0] - startIntegrity[0]), signed(record.servers[1] - startIntegrity[1])] },
  { label: 'Crypto for Draft', values: [String(record.wallet[0]), String(record.wallet[1])] },
 ];
 const circuit = record.circuit;
 const eligible = circuit ? circuit.eligible.length === 2 ? 'Both players' : circuit.eligible[0] === 0 || circuit.eligible[0] === 1 ? names[circuit.eligible[0]] : 'No one' : null;
 return <div className='log-collapse-summary' data-cycle={record.cycle}>
  <ul className='log-locations'>
   {record.locations.map((location, index) => <li key={`${location.id}-${index}`} data-winner={location.winner ?? 'tie'}>
    <span>{location.name}</span><b>{winnerLabel(location.winner, names)}</b>
   </li>)}
  </ul>
  <table className='log-score'>
   <thead><tr><th/><th>{names[0]}</th><th>{names[1]}</th></tr></thead>
   <tbody>{rows.map(row => <tr key={row.label}>
    <th scope='row'>{row.label}</th>
    {row.values.map((value, owner) => <td key={owner}>{value}{row.deltas && <em>{row.deltas[owner]}</em>}</td>)}
   </tr>)}</tbody>
  </table>
  {circuit && <p className='log-circuit'><small>Circuit Reward</small>{circuit.name} · {eligible} earned it{circuit.claimed.length ? ` · claimed by ${circuit.claimed.map(owner => names[owner]).join(' and ')}` : ''}</p>}
 </div>;
}
