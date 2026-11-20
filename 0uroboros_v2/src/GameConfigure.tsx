import { useState } from 'react';
import { Icon } from './BoardScene';
import { circuitModeLabel, circuitModeOf, DRAFT_TIMER_CHOICES, TURN_TIMER_CHOICES, type GameSetup } from './gameSetup';
import { faceNameFor } from './OpponentFacePicker';

type Props = {
  setup: GameSetup; onChange: (setup: GameSetup) => void;
  /** Opponent id for the summary line only; selection lives on the landing face picker. */
  opponent: string;
  disabled?: boolean;
};

/** Landing header Configure control: sliders icon opens the timer popover. VP rules come from the applied League epoch. */
export function GameConfigure({ setup, onChange, opponent, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const { turnSeconds, draftSeconds } = setup;
  const summary = [
    `vs ${faceNameFor(opponent)}`,
    `${circuitModeLabel(circuitModeOf(setup))} Circuit`,
    turnSeconds ? `${turnSeconds}s turns` : 'No turn timer',
    draftSeconds ? `${draftSeconds}s Draft` : 'No Draft timer',
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
        </div>
      </div>
    </>}
  </div>;
}
