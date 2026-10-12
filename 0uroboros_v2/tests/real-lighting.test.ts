import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_BACKGROUNDS, NO_BOARD_BACKGROUND, REAL_LIGHTING_FLOORS, boardBackgroundLabel, backgroundsFor, loadBackgroundChoice, saveBackgroundChoice, stepBackground } from '../src/boardBackgrounds';
import { DEFAULT_REAL_LIGHTING, REAL_LIGHTING_SLIDERS, floorLighting, loadRealLightingStore, realLightingDefaults, saveRealLightingStore, updateFloorLighting } from '../src/realLighting';

const floor = (n: string) => `/assets/board/backgrounds/back-${n}.webp`;
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('lighting mode and floors', () => {
  it('offers Underworld, Table Top and Tunnel in both modes, Studio ending in None', () => {
    expect(REAL_LIGHTING_FLOORS).toEqual([floor('02'), floor('07'), floor('01')]);
    expect(BOARD_BACKGROUNDS).toEqual([floor('02'), floor('07'), floor('01'), NO_BOARD_BACKGROUND]);
    expect(BOARD_BACKGROUNDS.map(boardBackgroundLabel)).toEqual(['Underworld', 'Table Top', 'Tunnel', 'None']);
    expect(backgroundsFor('real')).toBe(REAL_LIGHTING_FLOORS);
    expect(backgroundsFor('studio')).toBe(BOARD_BACKGROUNDS);
  });

  it('defaults to Studio lighting on Underworld and persists the mode and each mode’s background', () => {
    const initial = loadBackgroundChoice();
    expect(initial).toEqual({ mode: 'studio', background: { real: floor('02'), studio: floor('02') } });
    const next = stepBackground({ ...stepBackground({ ...initial, mode: 'real' }, 1), mode: 'studio' }, -1);
    saveBackgroundChoice(next);
    expect(loadBackgroundChoice()).toEqual(next);
    expect(next.background.real).toBe(floor('07'));
    expect(next.background.studio).toBe(NO_BOARD_BACKGROUND);
  });

  it('ignores choices saved under the old keys, which recorded the old defaults on every load', () => {
    store.set('ouroboros.lightingMode', 'real');
    store.set('ouroboros.lightingMode.v2', 'real');
    store.set('ouroboros.boardBackground', JSON.stringify({ real: floor('07'), studio: floor('01') }));
    expect(loadBackgroundChoice()).toEqual({ mode: 'studio', background: { real: floor('02'), studio: floor('02') } });
  });

  it('wraps through the active list and ignores saved backgrounds outside it, including the removed ones', () => {
    const defaults = loadBackgroundChoice();
    expect(stepBackground({ mode: 'real', background: { ...defaults.background, real: floor('01') } }, 1).background.real).toBe(floor('02'));
    store.set('ouroboros.boardBackground.v2', JSON.stringify({ real: floor('08'), studio: '/assets/board/backgrounds/background-01.mp4' }));
    store.set('ouroboros.lightingMode.v3', 'disco');
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

  it('follows looks and choices saved against the old PNG floors to their WebP builds', () => {
    store.set('ouroboros.realLighting.v2', JSON.stringify({ '/assets/board/backgrounds/back-01.png': { current: { neon: 2 } } }));
    expect(loadRealLightingStore()[floor('01')]?.current.neon).toBe(2);
    store.set('ouroboros.boardBackground.v2', JSON.stringify({ real: '/assets/board/backgrounds/back-07.png', studio: '/assets/board/backgrounds/back-01.png' }));
    expect(loadBackgroundChoice().background).toEqual({ real: floor('07'), studio: floor('01') });
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
