import { CIRCUIT_MODES, type CircuitMode } from './gameSetup';

/** Landing-screen Circuit mode: Open, Closed (every Node No Man's Land) or Short (middle three Nodes). */
export function CircuitModePicker({ value, onChange, disabled }: { value: CircuitMode; onChange: (mode: CircuitMode) => void; disabled?: boolean }) {
  const hint = CIRCUIT_MODES.find(mode => mode.id === value)!.hint;
  return <section className='circuit-mode' aria-labelledby='circuit-mode-title'>
    <small id='circuit-mode-title'>CIRCUIT MODE</small>
    <div className='game-mode-toggle circuit-mode-tabs' role='radiogroup' aria-labelledby='circuit-mode-title'>
      {CIRCUIT_MODES.map(mode => <button key={mode.id} type='button' role='radio' aria-checked={value === mode.id} className={value === mode.id ? 'selected' : undefined} disabled={disabled} onClick={() => onChange(mode.id)}>{mode.label}</button>)}
    </div>
    <p className='circuit-mode-hint' aria-live='polite'>{hint}</p>
  </section>;
}
