import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_BACKGROUNDS, NO_BOARD_BACKGROUND, REAL_LIGHTING_FLOORS, backgroundsFor, loadBackgroundChoice, saveBackgroundChoice, stepBackground } from '../src/boardBackgrounds';
import { DEFAULT_REAL_LIGHTING, REAL_LIGHTING_SLIDERS, floorLighting, loadRealLightingStore, realLightingDefaults, saveRealLightingStore, updateFloorLighting } from '../src/realLighting';

const floor = (n: string) => `/assets/board/backgrounds/back-${n}.png`;
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('lighting mode and floors', () => {
  it('Real lighting offers back-01, 02 and 07; Studio keeps the full list ending in None', () => {
    expect(REAL_LIGHTING_FLOORS).toEqual([floor('01'), floor('02'), floor('07')]);
    expect(backgroundsFor('real')).toBe(REAL_LIGHTING_FLOORS);
    expect(backgroundsFor('studio')).toBe(BOARD_BACKGROUNDS);
    expect(BOARD_BACKGROUNDS.at(-1)).toBe(NO_BOARD_BACKGROUND);
  });

  it('defaults to Real lighting and persists the mode and each mode’s background', () => {
    const initial = loadBackgroundChoice();
    expect(initial.mode).toBe('real');
    const next = stepBackground({ ...stepBackground(initial, 1), mode: 'studio' }, -1);
    saveBackgroundChoice(next);
    expect(loadBackgroundChoice()).toEqual(next);
    expect(next.background.real).toBe(floor('01'));
  });

  it('wraps through the active list and ignores saved backgrounds outside it', () => {
    const defaults = loadBackgroundChoice();
    expect(stepBackground({ ...defaults, background: { ...defaults.background, real: floor('07') } }, 1).background.real).toBe(floor('01'));
    store.set('ouroboros.boardBackground', JSON.stringify({ real: floor('05'), studio: 'nope' }));
    store.set('ouroboros.lightingMode', 'disco');
    expect(loadBackgroundChoice()).toEqual(defaults);
  });
});

describe('real lighting settings', () => {
  it('has a slider for every setting, each factory value inside its range on every floor', () => {
    const sliders = REAL_LIGHTING_SLIDERS.flatMap(group => group.sliders);
    expect(sliders.map(s => s.key).sort()).toEqual(Object.keys(DEFAULT_REAL_LIGHTING).sort());
    for (const url of REAL_LIGHTING_FLOORS) for (const s of sliders) {
      expect(realLightingDefaults(url)[s.key]).toBeGreaterThanOrEqual(s.min);
      expect(realLightingDefaults(url)[s.key]).toBeLessThanOrEqual(s.max);
    }
  });

  it('glass glow runs 3 to 12', () => {
    expect(REAL_LIGHTING_SLIDERS.flatMap(g => g.sliders).find(s => s.key === 'glassGlow')).toMatchObject({ min: 3, max: 12 });
  });

  it('keeps live sliders and a saved look per floor; Reset returns to the saved look, Factory to the defaults', () => {
    let lights = updateFloorLighting({}, floor('07'), { type: 'set', update: v => ({ ...v, neon: 2 }) });
    lights = updateFloorLighting(lights, floor('07'), { type: 'save' });
    lights = updateFloorLighting(lights, floor('07'), { type: 'set', update: v => ({ ...v, neon: .5 }) });
    lights = updateFloorLighting(lights, floor('01'), { type: 'set', update: v => ({ ...v, depth: .9 }) });
    expect(floorLighting(lights, floor('07')).neon).toBe(.5);
    expect(floorLighting(lights, floor('01')).depth).toBe(.9);
    expect(floorLighting(lights, floor('02'))).toEqual(realLightingDefaults(floor('02')));

    saveRealLightingStore(lights);
    expect(loadRealLightingStore()).toEqual(lights);

    const reset = updateFloorLighting(lights, floor('07'), { type: 'reset' });
    expect(floorLighting(reset, floor('07')).neon).toBe(2);
    const factory = updateFloorLighting(reset, floor('07'), { type: 'factory' });
    expect(floorLighting(factory, floor('07'))).toEqual(realLightingDefaults(floor('07')));
    expect(factory[floor('07')].saved?.neon).toBe(2);
    expect(floorLighting(updateFloorLighting(lights, floor('01'), { type: 'reset' }), floor('01'))).toEqual(realLightingDefaults(floor('01')));
  });

  it('migrates the single pre-v2 look to back-07, clamping out-of-range values and dropping invalid ones', () => {
    store.set('ouroboros.realLighting', JSON.stringify({ neon: 999, metalness: -3, depth: 'deep', bump: null, lamps: 40, glassGlow: 1 }));
    expect(loadRealLightingStore()).toEqual({ [floor('07')]: { current: { ...DEFAULT_REAL_LIGHTING, neon: 3, metalness: 0, glassGlow: 3 } } });
    store.set('ouroboros.realLighting.v2', '{not json');
    expect(loadRealLightingStore()).toEqual({});
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadRealLightingStore()).toEqual({});
    expect(() => saveRealLightingStore({})).not.toThrow();
  });
});
