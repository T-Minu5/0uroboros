import { useState, type ReactNode } from 'react';
import { DEFAULT_SELF_PLAY_RULES, diffSelfPlayRules, type SelfPlayRules } from '@0uroboros/engine/ai/selfPlay';
import { CIRCUIT_MODES, circuitModeFlags, circuitModeOf, END_GAME_AWARD_LABELS, END_GAME_AWARD_VP_MAX, MOST_CIRCUITS_BONUS_VP_MAX, NODE_WIN_VP_MAX, SERVER_VP_MAX, type EndGameAwardId } from './gameSetup';
import { Switch } from './leagueControls';

const clamp = (value: string, max: number) => Math.min(max, Math.max(0, Math.round(Number(value) || 0)));

function NumberRow({ label, hint, value, max, base, disabled, onChange }: { label: string; hint?: string; value: number; max: number; base: number; disabled: boolean; onChange: (value: number) => void }) {
  const changed = value !== base;
  return <label className={`lr-row lr-number${changed ? ' is-changed' : ''}`}>
    <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    {changed && <s title={`Current epoch: ${base}`}>{base}</s>}
    <input type='number' inputMode='numeric' min={0} max={max} value={value} disabled={disabled} onChange={event => onChange(clamp(event.target.value, max))}/>
  </label>;
}

const appliedLabel = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className='lr-group'><legend>{title}</legend>{children}</fieldset>;
}

/**
 * The league ruleset: the Configure options that change the game itself (no timers or opponent). Edits stay a
 * draft until applied, which starts a new epoch so Eco-Strat can compare before and after.
 */
export function LeagueRulesPanel({ current, epochId, draft, onDraft, onApply, busy, blocked, clientApplied, onApplyClient }: {
  current: SelfPlayRules; epochId: number | null; draft: SelfPlayRules; onDraft: (rules: SelfPlayRules) => void;
  onApply: (options: { wipeElo: boolean; note: string }) => Promise<boolean>; busy: boolean; blocked?: string;
  /** Last Apply Epoch VP, which sets the game client's VP and Circuit reward defaults. */
  clientApplied: { appliedAt: string | null; epochId: number | null }; onApplyClient: () => Promise<void>;
}) {
  const [wipeElo, setWipeElo] = useState(true);
  const [note, setNote] = useState('');
  const [applying, setApplying] = useState(false);
  const [clientBusy, setClientBusy] = useState(false);
  const applyClient = async () => {
    setClientBusy(true);
    try { await onApplyClient(); } finally { setClientBusy(false); }
  };
  const changes = diffSelfPlayRules(current, draft);
  const changedKeys = new Set(changes.map(change => change.key));
  const locked = busy || applying;
  const set = (patch: Partial<SelfPlayRules>) => onDraft({ ...draft, ...patch });
  const setAward = (id: EndGameAwardId, patch: Partial<{ enabled: boolean; vp: number }>) => set({ endGameAwards: { ...draft.endGameAwards, [id]: { ...draft.endGameAwards[id], ...patch } } });
  const flag = (key: string) => changedKeys.has(key) ? ' is-changed' : '';
  const apply = async () => {
    setApplying(true);
    try { if (await onApply({ wipeElo, note: note.trim() })) setNote(''); } finally { setApplying(false); }
  };
  const isDefault = !diffSelfPlayRules(DEFAULT_SELF_PLAY_RULES, draft).length;

  return <section className='lc-panel lr-panel' aria-labelledby='league-rules-title'>
    <header className='lc-panel-head lr-head'>
      <span>
        <h2 id='league-rules-title'>Ruleset</h2>
        <p>{epochId === null ? 'Loading epoch' : `Epoch ${epochId}`}. Every league game, Eco-Strat study and Strat-G trial plays under these rules.</p>
      </span>
      <span className='lr-client'>
        <button type='button' className='lc-button lc-primary' disabled={locked || clientBusy || epochId === null || changes.length > 0}
          title={changes.length ? 'Apply or discard the draft changes first' : 'Use this epoch’s VP and Circuit reward rules as the game client defaults'}
          onClick={() => void applyClient()}>{clientBusy ? 'Applying' : 'Apply Epoch VP'}</button>
        <small aria-live='polite'>{clientApplied.appliedAt ? `Applied epoch ${clientApplied.epochId ?? '?'} · ${appliedLabel(clientApplied.appliedAt)}` : 'Not applied yet'}</small>
      </span>
    </header>

    <Group title='Board'>
      <div className={`lr-row lr-segment${changedKeys.has('middleNodesOnly') || changedKeys.has('locations') ? ' is-changed' : ''}`} role='radiogroup' aria-label='Circuit mode'>
        <span><b>Circuit mode</b><small>{CIRCUIT_MODES.find(mode => mode.id === circuitModeOf(draft))!.hint}</small></span>
        <span className='lc-segments'>
          {CIRCUIT_MODES.map(mode => <button key={mode.id} type='button' role='radio' aria-checked={circuitModeOf(draft) === mode.id} disabled={locked} onClick={() => set(circuitModeFlags(mode.id))}>{mode.label}</button>)}
        </span>
      </div>
    </Group>

    <Group title='Circuits'>
      <div className={`lr-row${flag('circuitRewards')}`}><Switch label='Circuit rewards' hint='Random Draft privilege after Collapse' on={!draft.noCircuitRewards} disabled={locked} onChange={on => set({ noCircuitRewards: !on, ...(on ? {} : { noTrailingRewards: true }) })}/></div>
      <div className={`lr-row${flag('trailingRewards')}`}><Switch label='Trailing rewards' hint={draft.noCircuitRewards ? 'Needs Circuit rewards' : 'Catch-up rewards from Cycle 8'} on={!draft.noTrailingRewards} disabled={locked || draft.noCircuitRewards} onChange={on => set({ noTrailingRewards: !on })}/></div>
    </Group>

    <Group title='Victory points'>
      <NumberRow label='Primary Server' hint='For destroying it' value={draft.serverVP.primary} base={current.serverVP.primary} max={SERVER_VP_MAX} disabled={locked} onChange={primary => set({ serverVP: { ...draft.serverVP, primary } })}/>
      <NumberRow label='Backup Server' hint='For destroying it' value={draft.serverVP.backup} base={current.serverVP.backup} max={SERVER_VP_MAX} disabled={locked} onChange={backup => set({ serverVP: { ...draft.serverVP, backup } })}/>
      <NumberRow label='Node win' hint='Each Collapse; ties give 0' value={draft.nodeWinVP} base={current.nodeWinVP} max={NODE_WIN_VP_MAX} disabled={locked} onChange={nodeWinVP => set({ nodeWinVP })}/>
      <NumberRow label='Most Circuits' hint='End of game; ties give 0' value={draft.mostCircuitsBonusVP} base={current.mostCircuitsBonusVP} max={MOST_CIRCUITS_BONUS_VP_MAX} disabled={locked} onChange={mostCircuitsBonusVP => set({ mostCircuitsBonusVP })}/>
    </Group>

    <Group title='End-game awards'>
      <ul className='lr-awards'>{(Object.keys(draft.endGameAwards) as EndGameAwardId[]).map(id => {
        const award = draft.endGameAwards[id];
        const changed = changedKeys.has(`award.${id}.enabled`) || changedKeys.has(`award.${id}.vp`);
        return <li key={id} className={changed ? 'is-changed' : undefined}>
          <Switch label={END_GAME_AWARD_LABELS[id]} on={award.enabled} disabled={locked} onChange={enabled => setAward(id, { enabled })}/>
          <input type='number' inputMode='numeric' aria-label={`${END_GAME_AWARD_LABELS[id]} VP`} min={0} max={END_GAME_AWARD_VP_MAX} value={award.vp} disabled={locked || !award.enabled} onChange={event => setAward(id, { vp: clamp(event.target.value, END_GAME_AWARD_VP_MAX) })}/>
        </li>;
      })}</ul>
    </Group>

    <footer className='lr-apply'>
      <p className={changes.length ? 'lr-pending' : 'lc-meta'} aria-live='polite'>
        {changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} from epoch ${epochId ?? ''}: ${changes.map(change => change.label).join(', ')}` : 'No changes from the current epoch.'}
      </p>
      {changes.length > 0 && <label className='lr-note'>
        <span>What are you testing?</span>
        <input type='text' maxLength={280} placeholder='e.g. Does removing Circuit rewards stop the snowball?' value={note} disabled={locked} onChange={event => setNote(event.target.value)}/>
      </label>}
      <Switch label='Wipe Elo' hint='Start every agent at 1200 under the new rules' on={wipeElo} disabled={locked} onChange={setWipeElo}/>
      <div className='lc-actions'>
        <button type='button' className='lc-button lc-primary' disabled={locked || !!blocked || (!changes.length && !wipeElo)} title={blocked} onClick={() => void apply()}>
          {applying ? 'Applying' : changes.length ? (wipeElo ? 'Apply rules and wipe Elo' : 'Apply rules') : 'Wipe Elo and start a new epoch'}
        </button>
        <button type='button' className='lc-button' disabled={locked || !changes.length} onClick={() => onDraft(structuredClone(current))}>Discard changes</button>
        <button type='button' className='lc-button lc-quiet' disabled={locked || isDefault} onClick={() => onDraft(structuredClone(DEFAULT_SELF_PLAY_RULES))}>Load defaults</button>
      </div>
    </footer>
  </section>;
}
