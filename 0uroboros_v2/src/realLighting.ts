import { createContext, useContext } from 'react';

/**
 * Tuning for Real lighting (the bottom-left Lighting panel): lit, depth-mapped steel under the board. On the Neon
 * board the whole scene is then lit by its own neon tubes, with the studio rig reduced to a faint fill.
 */
export type RealLightingSettings = {
  /** Strength of the area lights laid along the neon rails and Server tubes. */
  neon: number;
  /** Faint fill in the dark spaces, as a fraction of the normal ambient and sky light. */
  ambient: number;
  /** The key light kept for shadows, as a fraction of its normal strength. */
  moonlight: number;
  /** Strength of the studio environment reflected in every surface. */
  reflections: number;
  /** Multiplier on the bloom that lets bright glass and tubes glow. */
  bloom: number;
  contactShadow: number;
  /** Strength of the player-coloured neon spill on the floor around the table. */
  glow: number;
  metalness: number;
  /** Multiplier on the steel's reflectance: lower reads as darker, gunmetal steel. */
  tone: number;
  roughness: number;
  /** 0 = bare steel, 1 = the floor art's full colour. */
  artMix: number;
  /** Parallax depth of the floor art's relief. */
  depth: number;
  /** Normal strength of the relief. */
  bump: number;
  brushing: number;
  /** Light carried inside the table glass that escapes at its edges, bevels and frost. */
  glassGlow: number;
  /** How much of that light scatters through the body of the glass rather than only its edges. */
  glassBody: number;
};

export type RealLightingKey = keyof RealLightingSettings;

/** The factory look, tuned on back-07; the other lit floors override their floor and reflections below. */
export const DEFAULT_REAL_LIGHTING: RealLightingSettings = {
  neon: .4,
  ambient: .05,
  moonlight: .15,
  reflections: .5,
  bloom: .2,
  contactShadow: .15,
  glow: .8,
  metalness: .65,
  tone: .75,
  roughness: .4,
  artMix: .75,
  depth: .26,
  bump: 4.5,
  brushing: .2,
  glassGlow: 7.5,
  glassBody: .3,
};

/** `rig` sliders drive the Neon light rig and glass, so they only act on the Neon board. */
export type RealLightingSlider = { key: RealLightingKey; label: string; min: number; max: number; step: number; rig?: true };

export const REAL_LIGHTING_SLIDERS: { group: 'Lighting' | 'Floor' | 'Glass'; sliders: RealLightingSlider[] }[] = [
  {
    group: 'Lighting',
    sliders: [
      { key: 'neon', label: 'Neon light', min: 0, max: 3, step: .05, rig: true },
      { key: 'ambient', label: 'Ambient', min: 0, max: 1, step: .01, rig: true },
      { key: 'moonlight', label: 'Moonlight', min: 0, max: 1, step: .01, rig: true },
      { key: 'reflections', label: 'Reflections', min: 0, max: 2, step: .05 },
      { key: 'bloom', label: 'Bloom', min: 0, max: 3, step: .05, rig: true },
      { key: 'contactShadow', label: 'Contact shadow', min: 0, max: 1, step: .01, rig: true },
      { key: 'glow', label: 'Glow spill', min: 0, max: 2, step: .05, rig: true },
    ],
  },
  {
    group: 'Floor',
    sliders: [
      { key: 'metalness', label: 'Metalness', min: 0, max: 1, step: .01 },
      { key: 'tone', label: 'Steel tone', min: .05, max: 1.5, step: .01 },
      { key: 'roughness', label: 'Roughness', min: .03, max: 1, step: .01 },
      { key: 'artMix', label: 'Texture', min: 0, max: 1, step: .01 },
      { key: 'depth', label: 'Depth', min: 0, max: 1, step: .01 },
      { key: 'bump', label: 'Relief', min: 0, max: 10, step: .1 },
      { key: 'brushing', label: 'Brushing', min: 0, max: 1, step: .01 },
    ],
  },
  {
    group: 'Glass',
    sliders: [
      { key: 'glassGlow', label: 'Glass glow', min: 3, max: 12, step: .1, rig: true },
      { key: 'glassBody', label: 'Glass body', min: 0, max: 1, step: .01, rig: true },
    ],
  },
];

/** Per-floor factory looks. */
const FLOOR_DEFAULTS: Record<string, Partial<RealLightingSettings>> = {
  '/assets/board/backgrounds/back-01.png': { reflections: 1.55, metalness: .82, tone: .59, roughness: .53, artMix: .96, depth: .81, bump: 1.9, brushing: .86 },
  '/assets/board/backgrounds/back-02.png': { reflections: 1.65, metalness: 1, tone: 1.29, roughness: .84, artMix: .95, depth: .51, bump: 2.2, brushing: 0 },
};

export function realLightingDefaults(floor: string): RealLightingSettings {
  return { ...DEFAULT_REAL_LIGHTING, ...FLOOR_DEFAULTS[floor] };
}

/** `value`'s known settings clamped to their sliders over `fallback`; anything missing or invalid keeps the fallback. */
function clampSettings(value: unknown, fallback: RealLightingSettings): RealLightingSettings {
  const settings = { ...fallback }, saved = (value ?? {}) as Partial<Record<RealLightingKey, unknown>>;
  for (const { sliders } of REAL_LIGHTING_SLIDERS) for (const { key, min, max } of sliders) {
    const v = saved[key];
    if (typeof v === 'number' && Number.isFinite(v)) settings[key] = Math.min(max, Math.max(min, v));
  }
  return settings;
}

/** Live sliders per floor, plus the look last saved with Save. */
export type FloorLighting = { current: RealLightingSettings; saved?: RealLightingSettings };
export type RealLightingStore = Record<string, FloorLighting>;

const STORAGE_KEY = 'ouroboros.realLighting.v2';
const LEGACY_KEY = 'ouroboros.realLighting';
/** The single pre-v2 look belonged to the only lit floor then, back-07. */
const LEGACY_FLOOR = '/assets/board/backgrounds/back-07.png';

export function loadRealLightingStore(): RealLightingStore {
  const store: RealLightingStore = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy !== null) store[LEGACY_FLOOR] = { current: clampSettings(JSON.parse(legacy), realLightingDefaults(LEGACY_FLOOR)) };
      return store;
    }
    const saved = JSON.parse(raw) as Record<string, { current?: unknown; saved?: unknown } | null>;
    for (const [floor, entry] of Object.entries(saved ?? {})) {
      if (!entry || typeof entry !== 'object') continue;
      const defaults = realLightingDefaults(floor);
      store[floor] = { current: clampSettings(entry.current, defaults) };
      if (entry.saved) store[floor].saved = clampSettings(entry.saved, defaults);
    }
  } catch { /* storage unavailable or corrupt */ }
  return store;
}

export function saveRealLightingStore(store: RealLightingStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
}

/** The live look for `floor`: its sliders, else its saved look, else its factory look. */
export function floorLighting(store: RealLightingStore, floor: string): RealLightingSettings {
  return store[floor]?.current ?? store[floor]?.saved ?? realLightingDefaults(floor);
}

export type RealLightingAction = { type: 'set'; update: (value: RealLightingSettings) => RealLightingSettings } | { type: 'save' } | { type: 'reset' } | { type: 'factory' };

/** Applies a slider change, Save, Reset (back to the saved look) or Factory reset to `floor`'s entry. */
export function updateFloorLighting(store: RealLightingStore, floor: string, action: RealLightingAction): RealLightingStore {
  const current = floorLighting(store, floor), saved = store[floor]?.saved;
  const entry: FloorLighting =
    action.type === 'set' ? { current: action.update(current), saved }
    : action.type === 'save' ? { current, saved: current }
    : action.type === 'reset' ? { current: saved ?? realLightingDefaults(floor), saved }
    : { current: realLightingDefaults(floor), saved };
  if (!entry.saved) delete entry.saved;
  return { ...store, [floor]: entry };
}

/** Set while the Neon board is lit by its own neon (Real lighting on Neon); null otherwise. */
export const NeonRigContext = createContext<RealLightingSettings | null>(null);
export const useNeonRig = () => useContext(NeonRigContext);
