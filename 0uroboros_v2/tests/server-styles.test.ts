import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SERVER_STYLE, SERVER_STYLES, loadServerStyle, saveServerStyle } from '../src/serverStyles';
import { SHIELD_HIT_S, hitGlow } from '../src/serverShield';

describe('server tube style setting', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to the shield', () => {
    expect(DEFAULT_SERVER_STYLE).toBe('shield');
    expect(loadServerStyle()).toBe('shield');
  });

  it('offers shield, pulse and classic as separate choices', () => {
    expect(SERVER_STYLES.map(option => option.id)).toEqual(['shield', 'pulse', 'classic']);
  });

  it('round-trips a saved choice', () => {
    saveServerStyle('classic');
    expect(loadServerStyle()).toBe('classic');
    saveServerStyle('pulse');
    expect(loadServerStyle()).toBe('pulse');
    saveServerStyle('shield');
    expect(loadServerStyle()).toBe('shield');
  });

  it('falls back to the default for unknown or unreadable values', () => {
    store.set('ouroboros.serverStyle', 'liquid');
    expect(loadServerStyle()).toBe('shield');
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadServerStyle()).toBe('shield');
    expect(() => saveServerStyle('classic')).not.toThrow();
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
