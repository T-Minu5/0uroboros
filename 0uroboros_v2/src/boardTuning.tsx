import { useEffect, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { DEFAULT_GLASS_SCRATCH, GLASS_SCRATCH_TEXTURES, glassScratch, setGlassScratch, type GlassScratchSettings } from './neonGlassScratch';
import { CAR_PAINT_COLORS, CAR_PAINT_SLIDERS, DEFAULT_CAR_PAINT, carPaint, carPaintDefaults, sameCarPaint, saveCarPaintDefaults, setCarPaint, type CarPaintSettings } from './neonCarPaint';
import { CORE_HUDS, setCoreHud, useHudTuning } from './hudTuning';
import { AgentsPanel } from './AgentsPanel';
import { neonGain } from './neonTubeShading';
import { REAL_LIGHTING_SLIDERS, realLightingDefaults, type RealLightingAction, type RealLightingSettings } from './realLighting';
import './board-tuning.css';

/** Live multipliers for board bloom and scene light intensity, read every frame by BoardFinish, and neon tube glow. */
const DEFAULT_TUNING = { bloom: 1.39, light: 1, neon: 2.5 };
export const boardTuning = { ...DEFAULT_TUNING };
const STORAGE_KEY = 'ouroboros.boardTuning.v3';
try { Object.assign(boardTuning, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')); } catch { /* storage unavailable */ }
neonGain.value = boardTuning.neon;

function setTuning(name: keyof typeof boardTuning, value: number) {
  boardTuning[name] = value;
  if (name === 'neon') neonGain.value = value;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(boardTuning)); } catch { /* storage unavailable */ }
}

type LightScale = { base: number; set: number };
/**
 * Scales every light by `boardTuning.light`. A light whose intensity no longer matches the value set last frame was
 * changed by its owner, so that becomes its new base; static lights keep their base and never compound.
 */
export function applyLightTuning(scene: THREE.Object3D) {
  const k = boardTuning.light;
  scene.traverse(object => {
    if (!(object as THREE.Light).isLight) return;
    const light = object as THREE.Light, data = light.userData as { lightScale?: LightScale };
    const s = data.lightScale;
    const base = s && light.intensity === s.set ? s.base : light.intensity;
    light.intensity = base * k;
    data.lightScale = { base, set: light.intensity };
  });
}

function useViewportSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

/** One labelled range with its value; double-click resets it. */
function TuneSlider({ label, min, max, step, value, digits = 2, disabled, onChange, onReset }: {
  label: string; min: number; max: number; step: number; value: number; digits?: number; disabled?: boolean;
  onChange: (value: number) => void; onReset: () => void;
}) {
  return <label className='tuning-slider'>
    <span>{label}</span>
    <input type='range' min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} onDoubleClick={onReset} />
    <output>{value.toFixed(digits)}</output>
  </label>;
}

/** A row of mutually exclusive choices. */
function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return <div className='tuning-segmented' role='radiogroup' aria-label={label}>
    {options.map(o => <button key={o.id} type='button' role='radio' aria-checked={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
  </div>;
}

/** A drawer section that folds open in place. */
function Disclosure({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <section className={`tuning-disclosure ${open ? 'open' : ''}`}>
    <button type='button' className='tuning-disclosure-head' aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
      <span>{title}</span>{note && <small>{note}</small>}<i aria-hidden='true'>›</i>
    </button>
    {open && <div id={id} className='tuning-disclosure-body'>{children}</div>}
  </section>;
}

const SCRATCH_SLIDERS: { name: Exclude<keyof GlassScratchSettings, 'texture'>; label: string; min: number; max: number; step: number; digits: number }[] = [
  { name: 'strength', label: 'Strength', min: 0, max: 3, step: .05, digits: 2 },
  { name: 'cutoff', label: 'Black cut', min: 0, max: .9, step: .01, digits: 2 },
  { name: 'scale', label: 'Scale', min: 3, max: 40, step: .5, digits: 1 },
  { name: 'rotation', label: 'Rotate', min: 0, max: 180, step: 1, digits: 0 },
];

/** Picks and tunes the scratched-glass photo laid over the Neon glass; changes apply live and persist. */
function GlassScratchControls() {
  const [settings, setSettings] = useState<GlassScratchSettings>({ ...glassScratch });
  const update = (next: Partial<GlassScratchSettings>) => {
    setGlassScratch(next);
    setSettings({ ...glassScratch });
  };
  const off = settings.texture === 'none';
  return <>
    <div className='tuning-row'>
      <Segmented label='Glass texture image' options={GLASS_SCRATCH_TEXTURES} value={settings.texture} onChange={texture => update({ texture })} />
      <button type='button' className='tuning-chip' title='Restore default adjustments' onClick={() => update({ ...DEFAULT_GLASS_SCRATCH, texture: settings.texture })}>Reset</button>
    </div>
    <div className={`tuning-sliders ${off ? 'inactive' : ''}`}>
      {SCRATCH_SLIDERS.map(s => <TuneSlider key={s.name} label={s.label} min={s.min} max={s.max} step={s.step} digits={s.digits} value={settings[s.name]} disabled={off}
        onChange={value => update({ [s.name]: value })} onReset={() => update({ [s.name]: DEFAULT_GLASS_SCRATCH[s.name] })} />)}
    </div>
  </>;
}

/** `active` is false while the Neon frame uses another finish; `enable` switches it to car paint. */
export type CarPaintPanelProps = { active: boolean; enable: () => void };

/** Colour and finish of the Neon frame's car paint; changes apply live and persist. Save keeps them as the look Reset returns to. */
function CarPaintControls({ active, enable }: CarPaintPanelProps) {
  const [settings, setSettings] = useState<CarPaintSettings>({ ...carPaint });
  const [, setSavedVersion] = useState(0);
  const update = (next: Partial<CarPaintSettings>) => {
    setCarPaint(next);
    setSettings({ ...carPaint });
  };
  const save = () => {
    saveCarPaintDefaults();
    setSavedVersion(v => v + 1);
  };
  const isSaved = sameCarPaint(settings, carPaintDefaults);
  return <>
    {!active && <button type='button' className='tuning-chip wide' title='Switch the Neon frame to the car paint finish' onClick={enable}>Use car paint on the frame</button>}
    <div className='tuning-row'>
      {CAR_PAINT_COLORS.map(c => <label key={c.key} className='tuning-color' title={settings[c.key]}>
        <input type='color' aria-label={`${c.label} colour`} value={settings[c.key]} onChange={e => update({ [c.key]: e.target.value })} />
        <span>{c.label}</span>
      </label>)}
    </div>
    <div className={`tuning-sliders ${active ? '' : 'inactive'}`} title='Double-click a slider to reset it to the saved look'>
      {CAR_PAINT_SLIDERS.map(s => <TuneSlider key={s.key} label={s.label} min={s.min} max={s.max} step={s.step} value={settings[s.key]}
        onChange={value => update({ [s.key]: value })} onReset={() => update({ [s.key]: carPaintDefaults[s.key] })} />)}
    </div>
    <div className='tuning-actions'>
      <button type='button' className='tuning-chip' disabled={isSaved} title='Keep these colours and settings as the car paint look' onClick={save}>{isSaved ? 'Saved' : 'Save'}</button>
      <button type='button' className='tuning-chip' title='Back to the saved look' onClick={() => update({ ...carPaintDefaults })}>Reset</button>
      <button type='button' className='tuning-chip' disabled={sameCarPaint(settings, DEFAULT_CAR_PAINT)} title='Back to the factory paint; the saved look is kept' onClick={() => update({ ...DEFAULT_CAR_PAINT })}>Factory</button>
    </div>
  </>;
}

/** Each slider reaches twice its default. */
const NEON_SLIDERS: { name: 'neon' | 'bloom'; label: string; max: number }[] = [
  { name: 'neon', label: 'Neon', max: DEFAULT_TUNING.neon * 2 },
  { name: 'bloom', label: 'Bloom', max: DEFAULT_TUNING.bloom * 2 },
];

/** Neon tube glow and board bloom for Settings › Board, in either lighting mode; changes apply live and persist. */
export function BoardLightSliders() {
  const [values, setValues] = useState(() => ({ neon: boardTuning.neon, bloom: boardTuning.bloom }));
  const update = (name: 'neon' | 'bloom', value: number) => {
    setTuning(name, value);
    setValues(v => ({ ...v, [name]: value }));
  };
  return <div className='lighting-sliders' role='group' aria-label='Lighting' title='Double-click a slider to reset it'>
    <small>Lighting</small>
    {NEON_SLIDERS.map(s => <label key={s.name}>
      <span>{s.label}</span>
      <input type='range' min={0} max={s.max} step={.01} value={values[s.name]}
        onChange={e => update(s.name, Number(e.target.value))} onDoubleClick={() => update(s.name, DEFAULT_TUNING[s.name])} />
      <output>{values[s.name].toFixed(2)}</output>
    </label>)}
  </div>;
}

/** What the Lighting section edits: the selected Real lighting floor's live sliders and its saved look. */
/** `neon` false hides the sliders that only act through the Neon light rig. */
export type LightingPanelProps = { floor: string; value: RealLightingSettings; saved?: RealLightingSettings; change: (action: RealLightingAction) => void; neon: boolean };

const sameLook = (a: RealLightingSettings, b?: RealLightingSettings) => !!b && (Object.keys(a) as (keyof RealLightingSettings)[]).every(k => a[k] === b[k]);

/** Real lighting sliders for the selected floor, with Save, Reset (to the saved look) and Factory reset. */
function RealLightingControls({ floor, value, saved, change, neon }: LightingPanelProps) {
  const factory = realLightingDefaults(floor), isSaved = sameLook(value, saved);
  const groups = REAL_LIGHTING_SLIDERS.map(({ group, sliders }) => ({ group, sliders: sliders.filter(s => neon || !s.rig) })).filter(g => g.sliders.length);
  return <div role='group' aria-label='Real lighting' title='Double-click a slider to reset it to the saved look'>
    {groups.map(({ group, sliders }) => <fieldset key={group} className='tuning-sliders'>
      <legend>{group}</legend>
      {sliders.map(slider => <TuneSlider key={slider.key} label={slider.label} min={slider.min} max={slider.max} step={slider.step} value={value[slider.key]}
        digits={slider.step >= 1 ? 0 : slider.step >= .1 ? 1 : 2}
        onChange={next => change({ type: 'set', update: current => ({ ...current, [slider.key]: next }) })}
        onReset={() => change({ type: 'set', update: current => ({ ...current, [slider.key]: (saved ?? factory)[slider.key] }) })} />)}
    </fieldset>)}
    <div className='tuning-actions'>
      <button type='button' className='tuning-chip' disabled={isSaved} title='Keep these sliders as this floor’s look' onClick={() => change({ type: 'save' })}>{isSaved ? 'Saved' : 'Save'}</button>
      <button type='button' className='tuning-chip' title={saved ? 'Back to the saved look' : 'Back to the factory look'} onClick={() => change({ type: 'reset' })}>Reset</button>
      <button type='button' className='tuning-chip' disabled={sameLook(value, factory)} title='Back to this floor’s factory look; the saved look is kept' onClick={() => change({ type: 'factory' })}>Factory</button>
    </div>
  </div>;
}

/** Ends the running session at once, scored as it stands, to reach the endgame without playing it out. */
export type EndGameProps = { run: () => void; disabled: boolean };

/**
 * Bottom-left dev drawer: the black hole HUD switch, End game, the board's glass, car paint and lighting looks, and the
 * AI agents.
 * `lighting` shows the Real lighting floor section; `paint` the Car paint section; `endGame` the End game button.
 */
export function BoardTuningPanel({ lighting, paint, endGame }: { lighting?: LightingPanelProps; paint?: CarPaintPanelProps; endGame?: EndGameProps }) {
  const [open, setOpen] = useState(false);
  const { width, height } = useViewportSize();
  const { coreHud } = useHudTuning();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return <>
    <button type='button' className='tuning-toggle' aria-expanded={open} aria-controls='tuning-drawer' onClick={() => setOpen(o => !o)}>
      <svg viewBox='0 0 16 16' aria-hidden='true'><path d='M2 4h7.4M12.6 4H14M2 8h2.4M7.6 8H14M2 12h8.4M13.6 12H14' /><circle cx='11' cy='4' r='1.6' /><circle cx='6' cy='8' r='1.6' /><circle cx='12' cy='12' r='1.6' /></svg>
      Tuning
    </button>
    <aside id='tuning-drawer' className={`tuning-drawer ${open ? 'open' : ''}`} aria-label='Tuning' inert={!open}>
      <header>
        <h2>Tuning</h2>
        <small title='Viewport size'>{width} × {height}</small>
      </header>
      <section className='tuning-section'>
        <h3>Black hole HUD</h3>
        <Segmented label='Black hole HUD' options={CORE_HUDS} value={coreHud} onChange={setCoreHud} />
      </section>
      {endGame && <section className='tuning-section'>
        <h3>Session</h3>
        <button type='button' className='tuning-end' disabled={endGame.disabled} title={endGame.disabled ? 'Wait for the current resolution to finish' : undefined} onClick={() => { endGame.run(); setOpen(false); }}>End game</button>
        <p>Scores the session as it stands and plays the endgame.</p>
      </section>}
      <section className='tuning-section flush'>
        <h3>Board</h3>
        <Disclosure id='tuning-glass' title='Glass texture'><GlassScratchControls /></Disclosure>
        {paint && <Disclosure id='tuning-paint' title='Car paint' note={paint.active ? undefined : 'Not in use'}><CarPaintControls {...paint} /></Disclosure>}
        {lighting && <Disclosure id='tuning-lighting' title='Lighting' note={lighting.floor}><RealLightingControls {...lighting} /></Disclosure>}
      </section>
      <section className='tuning-section flush'>
        <h3>Agents</h3>
        <Disclosure id='tuning-agents' title='Strat-G and Eco-Strat'><AgentsPanel /></Disclosure>
      </section>
    </aside>
  </>;
}
