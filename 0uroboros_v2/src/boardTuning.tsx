import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { DEFAULT_GLASS_SCRATCH, GLASS_SCRATCH_TEXTURES, glassScratch, setGlassScratch, type GlassScratchSettings } from './neonGlassScratch';
import { CAR_PAINT_COLORS, CAR_PAINT_SLIDERS, DEFAULT_CAR_PAINT, carPaint, carPaintDefaults, sameCarPaint, saveCarPaintDefaults, setCarPaint, type CarPaintSettings } from './neonCarPaint';
import { neonGain } from './neonTubeShading';
import { REAL_LIGHTING_SLIDERS, realLightingDefaults, type RealLightingAction, type RealLightingSettings } from './realLighting';

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

function Slider({ label, name }: { label: string; name: keyof typeof boardTuning }) {
  const [value, setValue] = useState(boardTuning[name]);
  const change = (next: number) => {
    setTuning(name, next);
    setValue(next);
  };
  return <label style={{ display: 'grid', gridTemplateColumns: '44px 120px 34px', alignItems: 'center', gap: 6 }}>
    <span>{label}</span>
    <input type='range' min={0} max={3} step={.05} value={value} onChange={e => change(Number(e.target.value))} onDoubleClick={() => change(DEFAULT_TUNING[name])} />
    <b style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value.toFixed(2)}</b>
  </label>;
}

/** The sliders are hidden; saved values still apply. The panel shows the viewport size instead. */
const SHOW_SLIDERS = false;

function useViewportSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

const SCRATCH_SLIDERS: { name: Exclude<keyof GlassScratchSettings, 'texture'>; label: string; min: number; max: number; step: number; digits: number }[] = [
  { name: 'strength', label: 'Strength', min: 0, max: 3, step: .05, digits: 2 },
  { name: 'cutoff', label: 'Black cut', min: 0, max: .9, step: .01, digits: 2 },
  { name: 'scale', label: 'Scale', min: 3, max: 40, step: .5, digits: 1 },
  { name: 'rotation', label: 'Rotate', min: 0, max: 180, step: 1, digits: 0 },
];

const panelStyle = { padding: '8px 10px', font: '600 10px Inter, sans-serif', color: '#cfd8e3', background: '#0b0b17e6', border: '1px solid #ffffff24', borderRadius: 6 } as const;
const chipStyle = (on: boolean) => ({ font: '600 10px Inter, sans-serif', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', color: on ? '#0b0b17' : '#cfd8e3', background: on ? '#9fe8ff' : '#ffffff10', border: '1px solid #ffffff30' });

/** Picks and tunes the scratched-glass photo laid over the Neon glass; changes apply live and persist. */
function GlassScratchMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<GlassScratchSettings>({ ...glassScratch });
  const update = (next: Partial<GlassScratchSettings>) => {
    setGlassScratch(next);
    setSettings({ ...glassScratch });
  };
  return <div style={{ ...panelStyle, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <button type='button' aria-expanded={open} aria-controls='glass-scratch-menu' onClick={() => setOpen(o => !o)} style={{ ...chipStyle(open), padding: '4px 9px' }}>
      Glass texture {open ? '‹' : '›'}
    </button>
    {open && <div id='glass-scratch-menu' role='group' aria-label='Glass texture' style={{ display: 'grid', gap: 6 }}>
      <div role='radiogroup' aria-label='Glass texture image' style={{ display: 'flex', gap: 4 }}>
        {GLASS_SCRATCH_TEXTURES.map(t => <button key={t.id} type='button' role='radio' aria-checked={settings.texture === t.id} onClick={() => update({ texture: t.id })} style={chipStyle(settings.texture === t.id)}>{t.label}</button>)}
        <button type='button' title='Restore default adjustments' onClick={() => update({ ...DEFAULT_GLASS_SCRATCH, texture: settings.texture })} style={{ ...chipStyle(false), marginLeft: 'auto' }}>Reset</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', columnGap: 14, rowGap: 4, opacity: settings.texture === 'none' ? .45 : 1 }}>
        {SCRATCH_SLIDERS.map(s => <label key={s.name} style={{ display: 'grid', gridTemplateColumns: '54px 100px 30px', alignItems: 'center', gap: 6 }}>
          <span>{s.label}</span>
          <input type='range' min={s.min} max={s.max} step={s.step} value={settings[s.name]} disabled={settings.texture === 'none'}
            onChange={e => update({ [s.name]: Number(e.target.value) })} onDoubleClick={() => update({ [s.name]: DEFAULT_GLASS_SCRATCH[s.name] })} />
          <b style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{settings[s.name].toFixed(s.digits)}</b>
        </label>)}
      </div>
    </div>}
  </div>;
}

/** `active` is false while the Neon frame uses another finish; `enable` switches it to car paint. */
export type CarPaintPanelProps = { active: boolean; enable: () => void };

/** Colour and finish of the Neon frame's car paint; changes apply live and persist. Save keeps them as the look Reset returns to. */
function CarPaintMenu({ active, enable }: CarPaintPanelProps) {
  const [open, setOpen] = useState(false);
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
  return <div style={{ ...panelStyle, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <button type='button' aria-expanded={open} aria-controls='car-paint-menu' onClick={() => setOpen(o => !o)} style={{ ...chipStyle(open), padding: '4px 9px' }}>
      Car paint {open ? '‹' : '›'}
    </button>
    {open && <div id='car-paint-menu' role='group' aria-label='Car paint' title='Double-click a slider to reset it to the saved look' style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {CAR_PAINT_COLORS.map(c => <label key={c.key} title={settings[c.key]} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{c.label}</span>
          <input type='color' aria-label={`${c.label} colour`} value={settings[c.key]} onChange={e => update({ [c.key]: e.target.value })}
            style={{ width: 34, height: 20, padding: 0, border: '1px solid #ffffff30', borderRadius: 3, background: 'none', cursor: 'pointer' }} />
        </label>)}
        {!active && <button type='button' title='Switch the Neon frame to the car paint finish' onClick={enable} style={chipStyle(false)}>Use car paint</button>}
        <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button type='button' disabled={isSaved} title='Keep these colours and settings as the car paint look' onClick={save} style={chipStyle(false)}>{isSaved ? 'Saved' : 'Save'}</button>
          <button type='button' title='Back to the saved look' onClick={() => update({ ...carPaintDefaults })} style={chipStyle(false)}>Reset</button>
          <button type='button' disabled={sameCarPaint(settings, DEFAULT_CAR_PAINT)} title='Back to the factory paint; the saved look is kept' onClick={() => update({ ...DEFAULT_CAR_PAINT })} style={chipStyle(false)}>Factory</button>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', columnGap: 14, rowGap: 4, opacity: active ? 1 : .45 }}>
        {CAR_PAINT_SLIDERS.map(s => <label key={s.key} style={{ display: 'grid', gridTemplateColumns: '74px 100px 30px', alignItems: 'center', gap: 6 }}>
          <span>{s.label}</span>
          <input type='range' min={s.min} max={s.max} step={s.step} value={settings[s.key]}
            onChange={e => update({ [s.key]: Number(e.target.value) })} onDoubleClick={() => update({ [s.key]: carPaintDefaults[s.key] })} />
          <b style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{settings[s.key].toFixed(2)}</b>
        </label>)}
      </div>
    </div>}
  </div>;
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

/** What the Lighting panel edits: the selected Real lighting floor's live sliders and its saved look. */
/** `neon` false hides the sliders that only act through the Neon light rig. */
export type LightingPanelProps = { floor: string; value: RealLightingSettings; saved?: RealLightingSettings; change: (action: RealLightingAction) => void; neon: boolean };

const sameLook = (a: RealLightingSettings, b?: RealLightingSettings) => !!b && (Object.keys(a) as (keyof RealLightingSettings)[]).every(k => a[k] === b[k]);

/** Real lighting sliders for the selected floor, with Save, Reset (to the saved look) and Factory reset. */
function RealLightingMenu({ floor, value, saved, change, neon }: LightingPanelProps) {
  const [open, setOpen] = useState(false);
  const factory = realLightingDefaults(floor), isSaved = sameLook(value, saved);
  return <div style={{ ...panelStyle, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <button type='button' aria-expanded={open} aria-controls='real-lighting-menu' onClick={() => setOpen(o => !o)} style={{ ...chipStyle(open), padding: '4px 9px' }}>
      Lighting {open ? '‹' : '›'}
    </button>
    {open && <div id='real-lighting-menu' className='real-lighting-controls' role='group' aria-label='Real lighting' title='Double-click a slider to reset it to the saved look'>
      <div className='real-lighting-head'>
        <small>{floor}</small>
        <span>
          <button type='button' disabled={isSaved} title='Keep these sliders as this floor’s look' onClick={() => change({ type: 'save' })} style={chipStyle(false)}>{isSaved ? 'Saved' : 'Save'}</button>
          <button type='button' title={saved ? 'Back to the saved look' : 'Back to the factory look'} onClick={() => change({ type: 'reset' })} style={chipStyle(false)}>Reset</button>
          <button type='button' disabled={sameLook(value, factory)} title='Back to this floor’s factory look; the saved look is kept' onClick={() => change({ type: 'factory' })} style={chipStyle(false)}>Factory</button>
        </span>
      </div>
      {REAL_LIGHTING_SLIDERS.map(({ group, sliders }) => ({ group, sliders: sliders.filter(s => neon || !s.rig) })).filter(g => g.sliders.length).map(({ group, sliders }) => <fieldset key={group}><legend>{group}</legend>{sliders.map(slider => <label key={slider.key}>
        <span>{slider.label}</span>
        <input type='range' min={slider.min} max={slider.max} step={slider.step} value={value[slider.key]}
          onChange={event => { const next = Number(event.target.value); change({ type: 'set', update: current => ({ ...current, [slider.key]: next }) }); }}
          onDoubleClick={() => change({ type: 'set', update: current => ({ ...current, [slider.key]: (saved ?? factory)[slider.key] }) })} />
        <output>{value[slider.key].toFixed(slider.step >= 1 ? 0 : slider.step >= .1 ? 1 : 2)}</output>
      </label>)}</fieldset>)}
    </div>}
  </div>;
}

/** Bottom-left dev panel. `lighting` shows the Real lighting floor menu; `paint` shows the Car paint menu. */
export function BoardTuningPanel({ lighting, paint }: { lighting?: LightingPanelProps; paint?: CarPaintPanelProps }) {
  const { width, height } = useViewportSize();
  return <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 60, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
    <div title={SHOW_SLIDERS ? 'Double-click a slider to reset it' : 'Viewport size'} style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {SHOW_SLIDERS ? <>
        <Slider label='Bloom' name='bloom' />
        <Slider label='Lights' name='light' />
      </> : <b style={{ font: '400 16px Inter, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{width} × {height}</b>}
    </div>
    <GlassScratchMenu />
    {paint && <CarPaintMenu {...paint} />}
    {lighting && <RealLightingMenu {...lighting} />}
  </div>;
}
