import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEON_SURFACE, NEON_SURFACES, loadNeonSurface, saveNeonSurface } from '../src/neonSurfaces';

describe('neon table surface setting', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to the original glass', () => {
    expect(DEFAULT_NEON_SURFACE).toBe('glass');
    expect(loadNeonSurface()).toBe('glass');
  });

  it('offers glass, car paint, liquid and liquid glass', () => {
    expect(NEON_SURFACES.map(option => option.id)).toEqual(['glass', 'paint', 'liquid', 'liquidGlass']);
  });

  it('round-trips a saved choice', () => {
    saveNeonSurface('paint');
    expect(loadNeonSurface()).toBe('paint');
    saveNeonSurface('glass');
    expect(loadNeonSurface()).toBe('glass');
  });

  it('falls back to glass for unknown or unreadable values', () => {
    store.set('ouroboros.neonSurface', 'plastic');
    expect(loadNeonSurface()).toBe('glass');
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadNeonSurface()).toBe('glass');
    expect(() => saveNeonSurface('paint')).not.toThrow();
  });
});
