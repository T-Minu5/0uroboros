import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AgentsApi, AgentsStatus } from './agentsApi';

/** An on/off switch; the label names what it turns on, the state is read from the track. */
export function Switch({ label, hint, on, disabled, onChange }: { label: string; hint?: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return <button type='button' role='switch' aria-checked={on} className='lc-switch' disabled={disabled} onClick={() => onChange(!on)}>
    <span className='lc-switch-text'><b>{label}</b>{hint && <small>{hint}</small>}</span>
    <span className='lc-switch-track' aria-hidden='true'><i/></span>
  </button>;
}

/** Explanations fold away so the controls stay in view. */
export function Fold({ title, children }: { title: string; children: ReactNode }) {
  return <details className='lc-fold'><summary>{title}</summary><div className='lc-fold-body'>{children}</div></details>;
}

export function Progress({ label, value, total }: { label: string; value: number; total: number }) {
  return <div className='lc-progress' role='progressbar' aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={value}>
    <span>{label}</span><i style={{ width: `${Math.min(100, (value / Math.max(1, total)) * 100)}%` }}/>
  </div>;
}

export function Choice<T extends number>({ label, values, value, unit, disabled, onChange }: { label: string; values: readonly T[]; value: T; unit: (value: T) => string; disabled: boolean; onChange: (value: T) => void }) {
  return <div className='lc-choice' role='radiogroup' aria-label={label}>
    <small>{label}</small>
    <span>{values.map(entry => <button key={entry} type='button' role='radio' aria-checked={value === entry} disabled={disabled} onClick={() => onChange(entry)}>{unit(entry)}</button>)}</span>
  </div>;
}

export const pick = <T extends number>(values: readonly T[], value: number, fallback: T) => (values as readonly number[]).includes(value) ? value as T : fallback;
export const reportStamp = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Write report now", with a running clock while a report is queued or written, then when the last report landed. */
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
  return <div className='lc-report'>
    <button type='button' className={`lc-button${writing ? ' busy' : ''}`} aria-busy={writing} disabled={writing || !status.effective.ecoStrat || !eco.gamesObserved.currentBuild} onClick={() => void write()}>
      {writing ? <><i className='lc-spinner' aria-hidden='true'/>Writing report {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</> : 'Write report now'}
    </button>
    <p className='lc-meta' aria-live='polite'>
      {writing ? eco.busy === 'reporting' ? 'Eco-Strat is reading the games and writing. This can take a few minutes.' : 'Queued. Eco-Strat starts once it finishes the game it is reading.'
        : last ? <>Last report {reportStamp(last.at)}, {last.kind}{last.games ? `, ${last.games} games` : ''}{onRead && <> <button type='button' className='lc-link' onClick={() => onRead(`eco-strat-report-${last.id}`)}>Read it</button></>}</>
        : 'No report yet.'}
      {!!eco.leagueBacklog && <> {eco.leagueBacklog} league game{eco.leagueBacklog === 1 ? '' : 's'} still to read (about {Math.ceil(eco.leagueBacklog * 40 / 60)} min).</>}
    </p>
    {!writing && failedLast && <p className='lc-error'>Report failed at {reportStamp(failure.at)}: {failure.message}</p>}
  </div>;
}
