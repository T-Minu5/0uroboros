import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUALITY, QUALITY_LEVELS, SETTLE_S, createQualityMonitor, isSoftwareRenderer, loadAutoQuality, loadQualityPreference, sampleQuality, saveAutoQuality, saveQualityPreference, type QualityLevel, type QualityMonitor } from '../src/graphicsQuality';

/** Runs `seconds` of frames at `ms` each, returning every level change in order. */
function run(monitor: QualityMonitor, ms: number, seconds: number, frame?: (i: number) => number) {
  const changes: QualityLevel[] = [];
  const count = Math.round(seconds * 1000 / ms);
  for (let i = 0; i < count; i++) {
    const next = sampleQuality(monitor, (frame?.(i) ?? ms) / 1000);
    if (next) changes.push(next);
  }
  return changes;
}

describe('quality levels', () => {
  it('each level costs no more than the one above it', () => {
    const maxDpr = (dpr: number | [number, number]) => typeof dpr === 'number' ? dpr : dpr[1];
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      const above = QUALITY[QUALITY_LEVELS[i - 1]], level = QUALITY[QUALITY_LEVELS[i]];
      expect(maxDpr(level.dpr)).toBeLessThanOrEqual(maxDpr(above.dpr));
      expect(level.samples).toBeLessThanOrEqual(above.samples);
      for (const key of ['shadows', 'bloom', 'neonRig', 'realFloor'] as const) if (level[key]) expect(above[key]).toBe(true);
    }
  });

  it('only High keeps the Neon light rig', () => {
    expect(QUALITY_LEVELS.filter(level => QUALITY[level].neonRig)).toEqual(['high']);
  });
});

describe('auto quality monitor', () => {
  it('holds a steady 60 fps at High', () => {
    expect(run(createQualityMonitor('high'), 16.7, 60)).toEqual([]);
  });

  it('drops one level at a time while frames stay slow, settling between steps', () => {
    const monitor = createQualityMonitor('high');
    expect(run(monitor, 40, SETTLE_S + 4.5)).toEqual(['medium']);
    expect(run(monitor, 40, SETTLE_S + 4.5)).toEqual(['low']);
    expect(run(monitor, 40, 30)).toEqual([]);
  });

  it('ignores hitches and long pauses', () => {
    const monitor = createQualityMonitor('high');
    expect(run(monitor, 16.7, 60, i => i % 20 === 0 ? 120 : 16.7)).toEqual([]);
    expect(run(monitor, 16.7, 30, i => i % 300 === 0 ? 2000 : 16.7)).toEqual([]);
  });

  it('climbs back one level after sustained headroom', () => {
    const monitor = createQualityMonitor('low');
    expect(run(monitor, 16.7, SETTLE_S + 15)).toEqual([]);
    expect(run(monitor, 16.7, 2)).toEqual(['medium']);
    expect(run(monitor, 16.7, SETTLE_S + 17)).toEqual(['high']);
  });

  it('stops climbing to a level that could not hold its frame rate', () => {
    const monitor = createQualityMonitor('medium');
    expect(run(monitor, 16.7, SETTLE_S + 17)).toEqual(['high']);
    expect(run(monitor, 30, SETTLE_S + 4.5)).toEqual(['medium']);
    expect(monitor.ceiling).toBe('medium');
    expect(run(monitor, 16.7, 120)).toEqual([]);
  });

  it('never climbs above its ceiling', () => {
    expect(run(createQualityMonitor('low', 'low'), 8, 120)).toEqual([]);
  });

  it('recognises software WebGL', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
  });
});

describe('quality storage', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to Auto starting at High, and persists both', () => {
    expect(loadQualityPreference()).toBe('auto');
    expect(loadAutoQuality()).toBe('high');
    saveQualityPreference('medium');
    saveAutoQuality('low');
    expect(loadQualityPreference()).toBe('medium');
    expect(loadAutoQuality()).toBe('low');
  });

  it('ignores unknown or unreadable values', () => {
    store.set('ouroboros.graphicsQuality', 'ultra');
    store.set('ouroboros.graphicsAutoLevel', 'potato');
    expect(loadQualityPreference()).toBe('auto');
    expect(loadAutoQuality()).toBe('high');
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadQualityPreference()).toBe('auto');
    expect(() => saveAutoQuality('low')).not.toThrow();
  });
});
