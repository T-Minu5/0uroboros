import { useState } from 'react';
import { defaultMostCircuitsBonusVP, defaultServerVP, type Servers } from '@0uroboros/engine/game';
import type { DeckOption } from './contentPack/loadGameContent';
import { MOST_CIRCUITS_BONUS_VP_MAX, SERVER_VP_MAX, TURN_TIMER_CHOICES, type GameSetup } from './gameSetup';
import { faceNameFor } from './OpponentFacePicker';
import { StartingDeckPicker } from './StartingDeckPicker';

type Props = {
  setup: GameSetup; onChange: (setup: GameSetup) => void;
  decks: DeckOption[] | null; deckId: string | undefined; onDeck: (id: string) => void;
  /** Opponent id for the summary line only; selection lives on the landing face picker. */
  opponent: string;
  disabled?: boolean;
};

/** Setup-screen Configure button: game options without the opponent select. */
export function GameConfigure({ setup, onChange, decks, deckId, onDeck, opponent, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const deck = decks?.find(option => option.id === deckId);
  const { serverVP, turnSeconds, noLocations, middleNodesOnly, tenCardDraft, mostCircuitsBonusVP } = setup;
  const setVP = (slot: keyof Servers, value: string) =>
    onChange({ ...setup, serverVP: { ...serverVP, [slot]: Math.min(SERVER_VP_MAX, Math.max(0, Math.round(Number(value) || 0))) } });
  const summary = [
    `vs ${faceNameFor(opponent)}`, deck?.name || 'Default deck', turnSeconds ? `${turnSeconds}s turns` : 'No turn timer', `Server VP ${serverVP.primary} / ${serverVP.backup}`,
    mostCircuitsBonusVP > 0 ? `Most Circuits +${mostCircuitsBonusVP} VP` : 'No Circuits bonus',
    tenCardDraft ? '10-card Draft' : '8-card Draft',
    middleNodesOnly ? 'Short Circuit' : 'Extended runtime',
    ...(noLocations ? ['No location text'] : []),
  ].join(' · ');
  return <div className='game-configure'>
    <button type='button' className='game-configure-toggle' aria-expanded={open} aria-controls='game-configure-panel' onClick={() => setOpen(value => !value)}>
      <b>Configure</b><small>{summary}</small><span aria-hidden>{open ? '▴' : '▾'}</span>
    </button>
    {open && <div id='game-configure-panel' className='game-configure-panel'>
      <div className='game-configure-row' role='group' aria-labelledby='game-mode-label'>
        <span id='game-mode-label'>Game mode <small>How many Locations open each Cycle</small></span>
        <div className='game-mode-toggle' role='radiogroup' aria-label='Game mode'>
          <button type='button' role='radio' aria-checked={!middleNodesOnly} disabled={disabled} className={!middleNodesOnly ? 'selected' : undefined} onClick={() => onChange({ ...setup, middleNodesOnly: false })}>Extended runtime</button>
          <button type='button' role='radio' aria-checked={middleNodesOnly} disabled={disabled} className={middleNodesOnly ? 'selected' : undefined} onClick={() => onChange({ ...setup, middleNodesOnly: true })}>Short Circuit</button>
        </div>
      </div>
      <label className='game-configure-row game-configure-check'>
        <span>No location text <small>Every Node is No Man&apos;s Land for the whole game</small></span>
        <input aria-label='No location text' type='checkbox' disabled={disabled} checked={noLocations} onChange={event => onChange({ ...setup, noLocations: event.target.checked })} />
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
      <label className='game-configure-row'>
        <span>Most Circuits bonus VP <small>End of game; player with more Circuit wins (more Locations in a Cycle). 0 off</small></span>
        <div className='game-configure-vp'>
          <input aria-label='Most Circuits bonus VP' type='number' min={0} max={MOST_CIRCUITS_BONUS_VP_MAX} disabled={disabled || noLocations} value={mostCircuitsBonusVP} onChange={event => onChange({ ...setup, mostCircuitsBonusVP: Math.min(MOST_CIRCUITS_BONUS_VP_MAX, Math.max(0, Math.round(Number(event.target.value) || 0))) })} />
          <button type='button' title={`Back to ${defaultMostCircuitsBonusVP}`} disabled={disabled || noLocations || mostCircuitsBonusVP === defaultMostCircuitsBonusVP} onClick={() => onChange({ ...setup, mostCircuitsBonusVP: defaultMostCircuitsBonusVP })}>Reset</button>
        </div>
      </label>
      <label className='game-configure-row game-configure-check'>
        <span>10-card Draft <small>Default is 8 (Action/Utility ×2, Hacker/Crypto ×2, Attack, Horror, Solar Monk, VP). On adds two Chaos fills</small></span>
        <input aria-label='10-card Draft' type='checkbox' disabled={disabled} checked={tenCardDraft} onChange={event => onChange({ ...setup, tenCardDraft: event.target.checked })} />
      </label>
      <StartingDeckPicker decks={decks} value={deckId} onChange={onDeck} disabled={disabled} />
    </div>}
  </div>;
}
