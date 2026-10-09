import { useEffect, useState } from 'react';
import { OPPONENTS, opponentName, type OpponentId } from './ai/strategistClient';
import type { DeckOption } from './authoring/loadGameContent';
import { defaultServerVP, type Servers } from '@0uroboros/engine/game';
import { SERVER_VP_MAX, TURN_TIMER_CHOICES, type GameSetup } from './gameSetup';
import { StartingDeckPicker } from './StartingDeckPicker';

type Props = {
  setup: GameSetup; onChange: (setup: GameSetup) => void;
  decks: DeckOption[] | null; deckId: string | undefined; onDeck: (id: string) => void;
  opponent: OpponentId; onOpponent: (id: OpponentId) => void; disabled?: boolean;
};

type AgentFlags = Partial<Record<(typeof OPPONENTS)[number]['key'] | 'ecoStrat', boolean>>;

/** Which agents are switched on, from the local dev server; null when it is not running (every choice stays open). */
function useAgentFlags(active: boolean) {
  const [flags, setFlags] = useState<AgentFlags | null>(null);
  useEffect(() => {
    if (!active) return;
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
export function GameConfigure({ setup, onChange, decks, deckId, onDeck, opponent, onOpponent, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const flags = useAgentFlags(open);
  const choice = OPPONENTS.find(entry => entry.id === opponent);
  const deck = decks?.find(option => option.id === deckId);
  const { serverVP, turnSeconds } = setup;
  const setVP = (slot: keyof Servers, value: string) =>
    onChange({ ...setup, serverVP: { ...serverVP, [slot]: Math.min(SERVER_VP_MAX, Math.max(0, Math.round(Number(value) || 0))) } });
  const summary = [
    `vs ${opponentName(opponent)}`, deck?.name || 'Default deck', turnSeconds ? `${turnSeconds}s turns` : 'No turn timer', `Server VP ${serverVP.primary} / ${serverVP.backup}`,
  ].join(' · ');
  return <div className='game-configure'>
    <button type='button' className='game-configure-toggle' aria-expanded={open} aria-controls='game-configure-panel' onClick={() => setOpen(value => !value)}>
      <b>Configure</b><small>{summary}</small><span aria-hidden>{open ? '▴' : '▾'}</span>
    </button>
    {open && <div id='game-configure-panel' className='game-configure-panel'>
      <label className='game-configure-row'>
        <span>Opponent <small>{choice ? `${choice.style}.${flags?.[choice.key] === false ? ' Switched off: plays the default profile.' : ''}${flags?.ecoStrat ? ' Eco-Strat watches.' : ''}` : ''}</small></span>
        <select aria-label='Opponent' value={opponent} disabled={disabled} onChange={event => onOpponent(event.target.value as OpponentId)}>
          {OPPONENTS.map(entry => <option key={entry.id} value={entry.id} disabled={flags?.[entry.key] === false && entry.id !== opponent}>{entry.name} · {entry.style}{flags?.[entry.key] === false ? ' (off)' : ''}</option>)}
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
      <StartingDeckPicker decks={decks} value={deckId} onChange={onDeck} disabled={disabled} />
    </div>}
  </div>;
}
