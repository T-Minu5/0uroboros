import { useState } from 'react';
import * as THREE from 'three';
import { neonGain } from './neonTubeShading';

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
