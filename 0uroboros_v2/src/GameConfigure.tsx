import { useEffect, useState } from 'react';
import { AGENT_FLAG_KEYS, opponentName, resolveOpponent, type OpponentId } from './ai/strategistClient';
import type { AuthoredOpponent } from '@0uroboros/engine/ai/opponents';
import { STUDIO_TOOLS } from './studioTools';
import type { DeckOption } from './contentPack/loadGameContent';
import { defaultServerVP, type Servers } from '@0uroboros/engine/game';
import { SERVER_VP_MAX, TURN_TIMER_CHOICES, type GameSetup } from './gameSetup';
import { StartingDeckPicker } from './StartingDeckPicker';

type Props = {
  setup: GameSetup; onChange: (setup: GameSetup) => void;
  decks: DeckOption[] | null; deckId: string | undefined; onDeck: (id: string) => void;
  opponents: readonly AuthoredOpponent[]; opponent: OpponentId; onOpponent: (id: OpponentId) => void; disabled?: boolean;
};

type AgentFlags = Partial<Record<string, boolean>>;

/** Which agents are switched on, from the local dev server (studio build only); null otherwise, so every choice stays open. */
function useAgentFlags(active: boolean) {
  const [flags, setFlags] = useState<AgentFlags | null>(null);
  useEffect(() => {
    if (!active || !STUDIO_TOOLS) return;
    let live = true;
    fetch('/api/agents/status', { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<{ effective?: AgentFlags }> : null)
      .then(status => { if (live) setFlags(status?.effective ?? null); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [active]);
  return flags;
}

/** Setup-screen Configure button: one summary line that opens the game options. */
export function GameConfigure({ setup, onChange, decks, deckId, onDeck, opponents, opponent, onOpponent, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const flags = useAgentFlags(open);
  const choice = resolveOpponent(opponents, opponent);
  const off = (id: string) => flags?.[AGENT_FLAG_KEYS[id]] === false;
  const deck = decks?.find(option => option.id === deckId);
  const { serverVP, turnSeconds, noLocations, noTrailingRewards } = setup;
  const setVP = (slot: keyof Servers, value: string) =>
    onChange({ ...setup, serverVP: { ...serverVP, [slot]: Math.min(SERVER_VP_MAX, Math.max(0, Math.round(Number(value) || 0))) } });
  const summary = [
    `vs ${opponentName(opponents, opponent)}`, deck?.name || 'Default deck', turnSeconds ? `${turnSeconds}s turns` : 'No turn timer', `Server VP ${serverVP.primary} / ${serverVP.backup}`,
    ...(noLocations ? ['No Locations'] : []), ...(noTrailingRewards ? ['No trailing rewards'] : []),
  ].join(' · ');
  return <div className='game-configure'>
    <button type='button' className='game-configure-toggle' aria-expanded={open} aria-controls='game-configure-panel' onClick={() => setOpen(value => !value)}>
      <b>Configure</b><small>{summary}</small><span aria-hidden>{open ? '▴' : '▾'}</span>
    </button>
    {open && <div id='game-configure-panel' className='game-configure-panel'>
      <label className='game-configure-row'>
        <span>Opponent <small>{choice ? `${choice.style}.${off(choice.id) ? ' Switched off: plays its published profile.' : ''}${flags?.ecoStrat ? ' Eco-Strat watches.' : ''}` : ''}</small></span>
        <select aria-label='Opponent' value={choice?.id ?? ''} disabled={disabled || !opponents.length} onChange={event => onOpponent(event.target.value)}>
          {opponents.map(entry => <option key={entry.id} value={entry.id} disabled={off(entry.id) && entry.id !== choice?.id}>{entry.name} · {entry.style}{off(entry.id) ? ' (off)' : ''}</option>)}
        </select>
      </label>
      <label className='game-configure-row'>
        <span>Turn timer <small>Each Runtime turn</small></span>
        <select aria-label='Turn timer' value={turnSeconds ?? ''} disabled={disabled} onChange={event => onChange({ ...setup, turnSeconds: event.target.value ? Number(event.target.value) : null })}>
          <option value=''>Off</option>
          {TURN_TIMER_CHOICES.map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
        </select>
      </label>
      <div className='game-configure-row game-configure-vp' role='group' aria-labelledby='game-configure-vp-label'>
        <span id='game-configure-vp-label'>Server VP <small>Scored for destroying an enemy Server</small></span>
        <div>
          <label>Primary <input aria-label='Primary Server VP' type='number' min={0} max={SERVER_VP_MAX} disabled={disabled} value={serverVP.primary} onChange={event => setVP('primary', event.target.value)} /></label>
          <label>Backup <input aria-label='Backup Server VP' type='number' min={0} max={SERVER_VP_MAX} disabled={disabled} value={serverVP.backup} onChange={event => setVP('backup', event.target.value)} /></label>
          <button type='button' title={`Back to ${defaultServerVP.primary} / ${defaultServerVP.backup}`} disabled={disabled || (serverVP.primary === defaultServerVP.primary && serverVP.backup === defaultServerVP.backup)} onClick={() => onChange({ ...setup, serverVP: { ...defaultServerVP } })}>Reset</button>
        </div>
      </div>
      <label className='game-configure-row game-configure-check'>
        <span>No Locations <small>Every Node is No Man's Land for the whole game</small></span>
        <input aria-label='No Locations' type='checkbox' disabled={disabled} checked={noLocations} onChange={event => onChange({ ...setup, noLocations: event.target.checked })} />
      </label>
      <label className='game-configure-row game-configure-check'>
        <span>No trailing rewards <small>Removes the Circuit Rewards that go to the player with the least VP</small></span>
        <input aria-label='No trailing rewards' type='checkbox' disabled={disabled} checked={noTrailingRewards} onChange={event => onChange({ ...setup, noTrailingRewards: event.target.checked })} />
      </label>
      <StartingDeckPicker decks={decks} value={deckId} onChange={onDeck} disabled={disabled} />
    </div>}
  </div>;
}
