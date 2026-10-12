import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SERVER_STYLE, SERVER_STYLES, loadServerStyles, saveServerStyles } from '../src/serverStyles';
import { SHIELD_HIT_S, hitGlow } from '../src/serverShield';

describe('server tube style setting', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults both players to Digital (the classic column)', () => {
    expect(DEFAULT_SERVER_STYLE).toBe('classic');
    expect(loadServerStyles()).toEqual(['classic', 'classic']);
  });

  it('offers Digital first, then Shield and Pulse', () => {
    expect(SERVER_STYLES).toEqual([{ id: 'classic', label: 'Digital' }, { id: 'shield', label: 'Shield' }, { id: 'pulse', label: 'Pulse' }]);
  });

  it('round-trips a separate choice for each player', () => {
    saveServerStyles(['classic', 'pulse']);
    expect(loadServerStyles()).toEqual(['classic', 'pulse']);
    saveServerStyles(['shield', 'classic']);
    expect(loadServerStyles()).toEqual(['shield', 'classic']);
  });

  it('moves everyone to the Digital default once, ignoring choices saved under the old keys', () => {
    store.set('ouroboros.serverStyle', 'pulse');
    store.set('ouroboros.serverStyles', JSON.stringify(['shield', 'shield']));
    expect(loadServerStyles()).toEqual(['classic', 'classic']);
  });

  it('falls back to the default for unknown or unreadable values', () => {
    store.set('ouroboros.serverStyles.v2', JSON.stringify(['liquid', 'pulse']));
    expect(loadServerStyles()).toEqual(['classic', 'classic']);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadServerStyles()).toEqual(['classic', 'classic']);
    expect(() => saveServerStyles(['classic', 'classic'])).not.toThrow();
  });
});

describe('hit ripple on Pulse discs', () => {
  it('flashes at the impact, then travels outward as a ring', () => {
    expect(hitGlow(0, 0, 1)).toBeGreaterThan(1);
    expect(hitGlow(1, .05, 1)).toBe(0);
    expect(hitGlow(.7, .4, 1)).toBeGreaterThan(hitGlow(.2, .4, 1));
  });

  it('is gone outside its lifetime and keeps only the impact flash without motion', () => {
    expect(hitGlow(0, -.1, 1)).toBe(0);
    expect(hitGlow(0, SHIELD_HIT_S + .01, 1)).toBe(0);
    expect(hitGlow(.7, .4, 0)).toBe(0);
    expect(hitGlow(0, .05, 0)).toBeGreaterThan(1);
  });
});
