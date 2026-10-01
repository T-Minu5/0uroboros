import { useEffect, useState } from 'react';
import * as THREE from 'three';

/** Temporary live multipliers for board bloom and scene light intensity, read every frame by BoardFinish. */
const DEFAULT_TUNING = { bloom: .35, light: 1 };
export const boardTuning = { ...DEFAULT_TUNING };
const STORAGE_KEY = 'ouroboros.boardTuning.v3';
try { Object.assign(boardTuning, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')); } catch { /* storage unavailable */ }

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
    boardTuning[name] = next;
    setValue(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(boardTuning)); } catch { /* storage unavailable */ }
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

export function BoardTuningPanel() {
  const { width, height } = useViewportSize();
  return <div title={SHOW_SLIDERS ? 'Double-click a slider to reset it' : 'Viewport size'} style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', font: '600 10px Inter, sans-serif', color: '#cfd8e3', background: '#0b0b17e6', border: '1px solid #ffffff24', borderRadius: 6 }}>
    {SHOW_SLIDERS ? <>
      <Slider label='Bloom' name='bloom' />
      <Slider label='Lights' name='light' />
    </> : <b style={{ font: '400 16px Inter, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{width} × {height}</b>}
  </div>;
}
