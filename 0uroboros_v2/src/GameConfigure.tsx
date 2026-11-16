import { useState } from 'react';
import { defaultMostCircuitsBonusVP, defaultNodeWinVP, defaultServerVP, type Servers } from '@0uroboros/engine/game';
import { Icon } from './BoardScene';
import type { DeckOption } from './contentPack/loadGameContent';
import {
  DRAFT_TIMER_CHOICES, END_GAME_AWARD_LABELS, END_GAME_AWARD_VP_MAX, MOST_CIRCUITS_BONUS_VP_MAX, NODE_WIN_VP_MAX,
  SERVER_VP_MAX, TURN_TIMER_CHOICES, type EndGameAwardId, type GameSetup,
} from './gameSetup';
import { faceNameFor } from './OpponentFacePicker';
import { StartingDeckPicker } from './StartingDeckPicker';

type Props = {
  setup: GameSetup; onChange: (setup: GameSetup) => void;
  decks: DeckOption[] | null; deckId: string | undefined; onDeck: (id: string) => void;
  /** Opponent id for the summary line only; selection lives on the landing face picker. */
  opponent: string;
  disabled?: boolean;
};

/** Landing header Configure control: sliders icon opens the game options popover. */
export function GameConfigure({ setup, onChange, decks, deckId, onDeck, opponent, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const deck = decks?.find(option => option.id === deckId);
  const { serverVP, turnSeconds, draftSeconds, noLocations, middleNodesOnly, trailingRewards, mostCircuitsBonusVP, nodeWinVP, endGameAwards } = setup;
  const setAward = (id: EndGameAwardId, patch: Partial<{ enabled: boolean; vp: number }>) =>
    onChange({ ...setup, endGameAwards: { ...endGameAwards, [id]: { ...endGameAwards[id], ...patch } } });
  const setVP = (slot: keyof Servers, value: string) =>
    onChange({ ...setup, serverVP: { ...serverVP, [slot]: Math.min(SERVER_VP_MAX, Math.max(0, Math.round(Number(value) || 0))) } });
  const summary = [
    `vs ${faceNameFor(opponent)}`, deck?.name || 'Default deck',
    middleNodesOnly ? 'Short Circuit' : 'Extended',
    turnSeconds ? `${turnSeconds}s turns` : 'No turn timer',
    draftSeconds ? `${draftSeconds}s Draft` : 'No Draft timer',
    trailingRewards ? 'Trailing rewards' : 'No trailing rewards',
    `Servers ${serverVP.primary}/${serverVP.backup}`,
    nodeWinVP > 0 ? `Node +${nodeWinVP}` : 'No Node VP',
    mostCircuitsBonusVP > 0 ? `Circuits +${mostCircuitsBonusVP}` : 'No Circuits bonus',
    ...(noLocations ? ['No locations'] : []),
  ].join(' · ');
  return <div className='game-configure settings-cluster'>
    <button
      type='button'
      className='settings-toggle game-configure-icon'
      aria-label='Configure game'
      title={`Configure · ${summary}`}
      aria-haspopup='dialog'
      aria-expanded={open}
      aria-controls='game-configure-panel'
      disabled={disabled}
      onClick={() => setOpen(value => !value)}
    >
      <Icon name='sliders'/>
    </button>
    {open && <>
      <span className='settings-scrim' onClick={() => setOpen(false)}/>
      <div id='game-configure-panel' className='settings-popover game-configure-popover' role='dialog' aria-label='Configure game'>
        <header className='game-configure-head'>
          <b>Configure</b>
          <small>{summary}</small>
        </header>
        <div className='game-configure-panel'>
          <div className='game-configure-row' role='group' aria-labelledby='game-mode-label'>
            <span id='game-mode-label'>Mode <small>Locations open each Cycle</small></span>
            <div className='game-mode-toggle' role='radiogroup' aria-label='Game mode'>
              <button type='button' role='radio' aria-checked={!middleNodesOnly} disabled={disabled} className={!middleNodesOnly ? 'selected' : undefined} onClick={() => onChange({ ...setup, middleNodesOnly: false })}>Extended</button>
              <button type='button' role='radio' aria-checked={middleNodesOnly} disabled={disabled} className={middleNodesOnly ? 'selected' : undefined} onClick={() => onChange({ ...setup, middleNodesOnly: true })}>Short Circuit</button>
            </div>
          </div>
          <label className='game-configure-row game-configure-check'>
            <span>No location text <small>All Nodes are No Man&apos;s Land</small></span>
            <input aria-label='No location text' type='checkbox' disabled={disabled} checked={noLocations} onChange={event => onChange({ ...setup, noLocations: event.target.checked })} />
          </label>
          <label className='game-configure-row game-configure-check'>
            <span>Trailing rewards <small>Catch-up Circuit rewards stay in the pool</small></span>
            <input aria-label='Trailing rewards' type='checkbox' disabled={disabled} checked={trailingRewards} onChange={event => onChange({ ...setup, trailingRewards: event.target.checked })} />
          </label>
          <label className='game-configure-row'>
            <span>Turn timer <small>Each Runtime turn</small></span>
            <select aria-label='Turn timer' value={turnSeconds ?? ''} disabled={disabled} onChange={event => onChange({ ...setup, turnSeconds: event.target.value ? Number(event.target.value) : null })}>
              <option value=''>Off</option>
              {TURN_TIMER_CHOICES.map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
            </select>
          </label>
          <label className='game-configure-row'>
            <span>Draft timer <small>Draft phase only</small></span>
            <select aria-label='Draft timer' value={draftSeconds ?? ''} disabled={disabled} onChange={event => onChange({ ...setup, draftSeconds: event.target.value ? Number(event.target.value) : null })}>
              <option value=''>Off</option>
              {DRAFT_TIMER_CHOICES.map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
            </select>
          </label>
          <div className='game-configure-row game-configure-vp' role='group' aria-labelledby='game-configure-vp-label'>
            <span id='game-configure-vp-label'>Server VP <small>For destroying an enemy Server</small></span>
            <div>
              <label>Primary <input aria-label='Primary Server VP' type='number' min={0} max={SERVER_VP_MAX} disabled={disabled} value={serverVP.primary} onChange={event => setVP('primary', event.target.value)} /></label>
              <label>Backup <input aria-label='Backup Server VP' type='number' min={0} max={SERVER_VP_MAX} disabled={disabled} value={serverVP.backup} onChange={event => setVP('backup', event.target.value)} /></label>
              <button type='button' title={`Back to ${defaultServerVP.primary} / ${defaultServerVP.backup}`} disabled={disabled || (serverVP.primary === defaultServerVP.primary && serverVP.backup === defaultServerVP.backup)} onClick={() => onChange({ ...setup, serverVP: { ...defaultServerVP } })}>Reset</button>
            </div>
          </div>
          <label className='game-configure-row'>
            <span>Node win VP <small>On Collapse; ties give 0. 0 off</small></span>
            <div className='game-configure-vp'>
              <input aria-label='Node win VP' type='number' min={0} max={NODE_WIN_VP_MAX} disabled={disabled} value={nodeWinVP} onChange={event => onChange({ ...setup, nodeWinVP: Math.min(NODE_WIN_VP_MAX, Math.max(0, Math.round(Number(event.target.value) || 0))) })} />
              <button type='button' title={`Back to ${defaultNodeWinVP}`} disabled={disabled || nodeWinVP === defaultNodeWinVP} onClick={() => onChange({ ...setup, nodeWinVP: defaultNodeWinVP })}>Reset</button>
            </div>
          </label>
          <label className='game-configure-row'>
            <span>Most Circuits VP <small>End of game. 0 off. Ties give 0</small></span>
            <div className='game-configure-vp'>
              <input aria-label='Most Circuits bonus VP' type='number' min={0} max={MOST_CIRCUITS_BONUS_VP_MAX} disabled={disabled} value={mostCircuitsBonusVP} onChange={event => onChange({ ...setup, mostCircuitsBonusVP: Math.min(MOST_CIRCUITS_BONUS_VP_MAX, Math.max(0, Math.round(Number(event.target.value) || 0))) })} />
              <button type='button' title={`Back to ${defaultMostCircuitsBonusVP}`} disabled={disabled || mostCircuitsBonusVP === defaultMostCircuitsBonusVP} onClick={() => onChange({ ...setup, mostCircuitsBonusVP: defaultMostCircuitsBonusVP })}>Reset</button>
            </div>
          </label>
          <div className='game-configure-row game-configure-awards' role='group' aria-labelledby='end-game-awards-label'>
            <span id='end-game-awards-label'>End-game awards <small>Ties grant both players the VP</small></span>
            <ul className='game-configure-award-list'>
              {(Object.keys(endGameAwards) as EndGameAwardId[]).map(id => {
                const award = endGameAwards[id];
                return <li key={id}>
                  <label className='game-configure-check'>
                    <input aria-label={`Enable ${END_GAME_AWARD_LABELS[id]}`} type='checkbox' disabled={disabled} checked={award.enabled} onChange={event => setAward(id, { enabled: event.target.checked })} />
                    <span>{END_GAME_AWARD_LABELS[id]}</span>
                  </label>
                  <input aria-label={`${END_GAME_AWARD_LABELS[id]} VP`} type='number' min={0} max={END_GAME_AWARD_VP_MAX} disabled={disabled || !award.enabled} value={award.vp} onChange={event => setAward(id, { vp: Math.min(END_GAME_AWARD_VP_MAX, Math.max(0, Math.round(Number(event.target.value) || 0))) })} />
                </li>;
              })}
            </ul>
          </div>
          <StartingDeckPicker decks={decks} value={deckId} onChange={onDeck} disabled={disabled} />
        </div>
      </div>
    </>}
  </div>;
}
