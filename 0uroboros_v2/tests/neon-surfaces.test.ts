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

  it('offers Frosted, Pearl and Glossy', () => {
    expect(NEON_SURFACES).toEqual([{ id: 'glass', label: 'Frosted' }, { id: 'paint', label: 'Pearl' }, { id: 'liquidGlass', label: 'Glossy' }]);
  });

  it('loads the retired liquid finish as the default', () => {
    store.set('ouroboros.neonSurface', 'liquid');
    expect(loadNeonSurface()).toBe(DEFAULT_NEON_SURFACE);
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
